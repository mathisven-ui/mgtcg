-- ==========================================================
-- MGTCG — supabase-echanges.sql   (V3 : échanges entre membres)
-- À copier-coller UNE SEULE FOIS dans Supabase :
-- SQL Editor → New query → coller → Run
-- Sécurité : pas de messagerie libre. Les membres s'envoient des
-- propositions encadrées (cartes + boutique ou événement public + date).
-- Créé par Mathis GILLIG.
-- ==========================================================

-- Une clé de carte MGTCG ressemble à « fr|sv03.5-199 »
create or replace function public.cles_valides(j jsonb, maxi int)
returns boolean language sql immutable as $$
  select jsonb_typeof(j) = 'array' and jsonb_array_length(j) <= maxi
     and not exists (select 1 from jsonb_array_elements(j) e
                     where jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') > 60
                        or (e #>> '{}') !~ '^[a-z-]{2,6}\|[A-Za-z0-9._-]+$');
$$;

-- 1) La liste d'échange de chaque membre -----------------------
create table if not exists public.trade_lists (
  user_id     uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  pseudo      text not null unique check (pseudo ~ '^[A-Za-z0-9_-]{3,20}$'),
  dept        text check (dept is null or dept ~ '^([0-9]{2}|2A|2B|97[1-6])$'),
  haves       jsonb not null default '[]'::jsonb check (public.cles_valides(haves, 500)),
  wants       jsonb not null default '[]'::jsonb check (public.cles_valides(wants, 500)),
  active      boolean not null default true,
  blocked     boolean not null default false,   -- désactivée par l'admin
  updated_at  timestamptz not null default now()
);
alter table public.trade_lists enable row level security;

drop policy if exists "echanges : voir les listes" on public.trade_lists;
create policy "echanges : voir les listes" on public.trade_lists
  for select to authenticated
  using ((active and not blocked) or user_id = auth.uid() or public.is_admin());
drop policy if exists "echanges : creer sa liste" on public.trade_lists;
create policy "echanges : creer sa liste" on public.trade_lists
  for insert to authenticated with check (user_id = auth.uid() and not blocked);
drop policy if exists "echanges : modifier sa liste" on public.trade_lists;
create policy "echanges : modifier sa liste" on public.trade_lists
  for update to authenticated using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists "echanges : supprimer sa liste" on public.trade_lists;
create policy "echanges : supprimer sa liste" on public.trade_lists
  for delete to authenticated using ((user_id = auth.uid() and not blocked) or public.is_admin());
create unique index if not exists trade_lists_pseudo_unique on public.trade_lists (lower(pseudo));

-- Un membre ne peut pas se débloquer lui-même
create or replace function public.protege_liste()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.blocked := coalesce(old.blocked, false);
  end if;
  new.updated_at := now();
  return new;
end; $$;
drop trigger if exists protege_trade_lists on public.trade_lists;
create trigger protege_trade_lists before insert or update on public.trade_lists
  for each row execute procedure public.protege_liste();

-- 2) Les propositions d'échange --------------------------------
create table if not exists public.trade_offers (
  id          uuid primary key default gen_random_uuid(),
  from_user   uuid not null references auth.users (id) on delete cascade default auth.uid(),
  to_user     uuid not null references auth.users (id) on delete cascade,
  give        jsonb not null check (public.cles_valides(give, 20) and jsonb_array_length(give) >= 1),
  get         jsonb not null check (public.cles_valides(get, 20) and jsonb_array_length(get) >= 1),
  place_kind  text not null check (place_kind in ('boutique', 'evenement')),  -- boutique validée ou convention / tournoi
  place_id    uuid not null,
  place_name  text,                       -- rempli automatiquement depuis la base
  meet_date   date not null,
  slot        text not null check (slot in ('matin', 'midi', 'apres-midi')),
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'countered')),
  parent      uuid references public.trade_offers (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (from_user <> to_user)
);
create index if not exists trade_offers_to_idx on public.trade_offers (to_user, created_at desc);
create index if not exists trade_offers_from_idx on public.trade_offers (from_user, created_at desc);
alter table public.trade_offers enable row level security;

drop policy if exists "offres : voir les miennes" on public.trade_offers;
create policy "offres : voir les miennes" on public.trade_offers
  for select to authenticated using (from_user = auth.uid() or to_user = auth.uid() or public.is_admin());
drop policy if exists "offres : proposer" on public.trade_offers;
create policy "offres : proposer" on public.trade_offers
  for insert to authenticated with check (from_user = auth.uid() and status = 'pending');
drop policy if exists "offres : repondre" on public.trade_offers;
create policy "offres : repondre" on public.trade_offers
  for update to authenticated using (from_user = auth.uid() or to_user = auth.uid());

-- 3) Blocages et signalements ------------------------------------
create table if not exists public.trade_blocks (
  blocker     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  blocked     uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker, blocked)
);
alter table public.trade_blocks enable row level security;
drop policy if exists "blocages : les miens" on public.trade_blocks;
create policy "blocages : les miens" on public.trade_blocks
  for all to authenticated using (blocker = auth.uid()) with check (blocker = auth.uid());

create table if not exists public.trade_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  reported    uuid not null references auth.users (id) on delete cascade,
  reason      text not null check (reason in ('Contact hors du site', 'Comportement inapproprié', 'Faux échange / arnaque', 'Pseudo inapproprié', 'Autre')),
  offer_id    uuid references public.trade_offers (id) on delete set null,
  handled     boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table public.trade_reports enable row level security;
drop policy if exists "signalements : envoyer" on public.trade_reports;
create policy "signalements : envoyer" on public.trade_reports
  for insert to authenticated with check (reporter = auth.uid() and reported <> auth.uid());
drop policy if exists "signalements : admin" on public.trade_reports;
create policy "signalements : admin" on public.trade_reports
  for select to authenticated using (public.is_admin());
drop policy if exists "signalements : admin traite" on public.trade_reports;
create policy "signalements : admin traite" on public.trade_reports
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- 4) Contrôles des propositions ----------------------------------
create or replace function public.controle_offre()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  l_from public.trade_lists; l_to public.trade_lists;
begin
  if tg_op = 'INSERT' then
    select * into l_from from public.trade_lists where user_id = new.from_user;
    select * into l_to from public.trade_lists where user_id = new.to_user;
    if l_from is null or not l_from.active or l_from.blocked then raise exception 'Active d''abord ta liste d''échange.'; end if;
    if l_to is null or not l_to.active or l_to.blocked then raise exception 'Ce membre n''échange plus pour le moment.'; end if;
    if exists (select 1 from public.trade_blocks where (blocker = new.to_user and blocked = new.from_user) or (blocker = new.from_user and blocked = new.to_user)) then
      raise exception 'Échange impossible avec ce membre.';
    end if;
    -- Les cartes doivent venir des listes « à échanger » de chacun
    if exists (select 1 from jsonb_array_elements_text(new.give) g where not (l_from.haves ? g)) then raise exception 'Une carte proposée n''est pas dans ta liste à échanger.'; end if;
    if exists (select 1 from jsonb_array_elements_text(new.get) g where not (l_to.haves ? g)) then raise exception 'Une carte demandée n''est plus dans sa liste.'; end if;
    -- Lieu public : boutique ou événement validés, nom recopié depuis la base
    if new.place_kind = 'boutique' then
      select name || ' — ' || address into new.place_name from public.shops where id = new.place_id and status = 'approved';
    else
      select title || coalesce(' — ' || city, '') into new.place_name from public.events
        where id = new.place_id and status = 'approved' and kind in ('convention', 'tournoi') and city is not null
          and coalesce(end_date, start_date) >= current_date;
    end if;
    if new.place_name is null then raise exception 'Choisis une boutique ou un événement de la liste.'; end if;
    if new.meet_date < current_date or new.meet_date > current_date + 90 then raise exception 'Choisis une date dans les 3 prochains mois.'; end if;
    -- Anti-spam
    if (select count(*) from public.trade_offers where from_user = new.from_user and status = 'pending') >= 10 then
      raise exception 'Limite atteinte : 10 propositions en attente maximum.';
    end if;
    if (select count(*) from public.trade_offers where from_user = new.from_user and created_at > now() - interval '1 day') >= 20 then
      raise exception 'Limite atteinte : 20 propositions par jour maximum.';
    end if;
    new.status := 'pending';
    return new;
  end if;

  -- UPDATE : seul le statut change, et seulement dans le bon sens
  if new.from_user <> old.from_user or new.to_user <> old.to_user or new.give <> old.give or new.get <> old.get
     or new.place_id <> old.place_id or new.place_kind <> old.place_kind or new.meet_date <> old.meet_date or new.slot <> old.slot
     or new.place_name is distinct from old.place_name or new.parent is distinct from old.parent or new.created_at <> old.created_at then
    raise exception 'Seule la réponse peut être modifiée.';
  end if;
  if not (
       (old.status = 'pending'  and new.status in ('accepted', 'declined', 'countered') and auth.uid() = old.to_user)
    or (old.status = 'pending'  and new.status = 'cancelled' and auth.uid() = old.from_user)
    or (old.status = 'accepted' and new.status = 'cancelled' and auth.uid() in (old.from_user, old.to_user))
    or new.status = old.status
  ) then
    raise exception 'Action impossible sur cette proposition.';
  end if;
  new.updated_at := now();
  return new;
end; $$;
drop trigger if exists controle_trade_offers on public.trade_offers;
create trigger controle_trade_offers before insert or update on public.trade_offers
  for each row execute procedure public.controle_offre();

-- Anti-spam signalements : 10 par jour
create or replace function public.limite_signalements()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.trade_reports where reporter = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Limite atteinte : 10 signalements par jour.';
  end if;
  return new;
end; $$;
drop trigger if exists anti_spam_trade_reports on public.trade_reports;
create trigger anti_spam_trade_reports before insert on public.trade_reports
  for each row execute procedure public.limite_signalements();

grant select, insert, update, delete on public.trade_lists to authenticated;
grant select, insert, update on public.trade_offers to authenticated;
grant select, insert, delete on public.trade_blocks to authenticated;
grant select, insert, update on public.trade_reports to authenticated;
