-- ==========================================================
-- MGTCG — supabase-boutiques.sql   (V2 : boutiques + restocks)
-- À copier-coller UNE SEULE FOIS dans Supabase :
-- SQL Editor → New query → coller → Run
-- (Le fichier supabase-setup.sql doit déjà avoir été lancé.)
-- Créé par Mathis GILLIG.
-- ==========================================================

-- 1) Boutiques proposées par les membres ---------------------
create table if not exists public.shops (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 80),
  address     text not null check (char_length(address) between 5 and 200),
  lat         double precision not null check (lat between -90 and 90),
  lon         double precision not null check (lon between -180 and 180),
  kind        text not null default 'independante' check (kind in ('enseigne', 'independante')),
  sells       text[] not null default '{}',
  website     text check (website is null or (website ~ '^https?://' and char_length(website) < 300)),
  note        text check (note is null or char_length(note) <= 300),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

-- 2) Restocks signalés par les membres -----------------------
create table if not exists public.restocks (
  id          uuid primary key default gen_random_uuid(),
  shop_key    text not null check (char_length(shop_key) between 3 and 80),   -- ex : "osm:node/123" ou "mg:<uuid>"
  shop_name   text check (shop_name is null or char_length(shop_name) <= 80),
  product     text not null check (product in ('Boosters', 'ETB', 'Display', 'UPC', 'Coffret', 'Cartes gradées', 'Autre')),
  set_name    text check (set_name is null or char_length(set_name) <= 60),
  note        text check (note is null or char_length(note) <= 140),
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists restocks_shop_idx on public.restocks (shop_key, created_at desc);

-- 3) Sécurité (RLS) ------------------------------------------
alter table public.shops    enable row level security;
alter table public.restocks enable row level security;

-- Boutiques : tout le monde voit les boutiques validées,
-- chacun voit aussi ses propositions, l'admin voit tout.
drop policy if exists "boutiques : lecture" on public.shops;
create policy "boutiques : lecture" on public.shops
  for select to anon, authenticated
  using (status = 'approved' or created_by = auth.uid() or public.is_admin());

-- Un membre connecté peut PROPOSER une boutique (toujours « en attente »)
drop policy if exists "boutiques : proposer" on public.shops;
create policy "boutiques : proposer" on public.shops
  for insert to authenticated
  with check (created_by = auth.uid() and status = 'pending');

-- Seul l'admin peut valider, refuser, modifier ou supprimer
drop policy if exists "boutiques : admin modifie" on public.shops;
create policy "boutiques : admin modifie" on public.shops
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "boutiques : admin supprime" on public.shops;
create policy "boutiques : admin supprime" on public.shops
  for delete to authenticated
  using (public.is_admin());

-- Restocks : visibles par tous, ajoutés par les membres connectés,
-- supprimés par leur auteur ou l'admin.
drop policy if exists "restocks : lecture" on public.restocks;
create policy "restocks : lecture" on public.restocks
  for select to anon, authenticated
  using (true);

drop policy if exists "restocks : signaler" on public.restocks;
create policy "restocks : signaler" on public.restocks
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "restocks : supprimer" on public.restocks;
create policy "restocks : supprimer" on public.restocks
  for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- 4) Anti-spam : limites par membre --------------------------
create or replace function public.limite_anti_spam()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'restocks' then
    if (select count(*) from public.restocks
        where user_id = auth.uid() and created_at > now() - interval '1 day') >= 15 then
      raise exception 'Limite atteinte : 15 restocks par jour maximum.';
    end if;
  elsif tg_table_name = 'shops' then
    if (select count(*) from public.shops
        where created_by = auth.uid() and status = 'pending') >= 5 then
      raise exception 'Limite atteinte : 5 boutiques en attente de validation maximum.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists anti_spam_restocks on public.restocks;
create trigger anti_spam_restocks before insert on public.restocks
  for each row execute procedure public.limite_anti_spam();

drop trigger if exists anti_spam_shops on public.shops;
create trigger anti_spam_shops before insert on public.shops
  for each row execute procedure public.limite_anti_spam();

-- 5) Accès via le site (les règles RLS ci-dessus filtrent) ----
grant select on public.shops, public.restocks to anon, authenticated;
grant insert, update, delete on public.shops to authenticated;
grant insert, delete on public.restocks to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.collections to authenticated;
