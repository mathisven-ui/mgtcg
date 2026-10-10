-- ==========================================================
-- MGTCG — supabase-profils.sql   (V3 : profils publics + classements)
-- À copier-coller UNE SEULE FOIS dans Supabase :
-- SQL Editor → New query → coller → Run
-- Le profil public est FACULTATIF. Pas de texte libre : un pseudo,
-- des badges, quelques chiffres et une vitrine de 6 cartes maximum.
-- Créé par Mathis GILLIG.
-- ==========================================================

-- Vérifications des listes (mêmes règles que pour les échanges)
create or replace function public.cles_valides(j jsonb, maxi int)
returns boolean language sql immutable as $$
  select jsonb_typeof(j) = 'array' and jsonb_array_length(j) <= maxi
     and not exists (select 1 from jsonb_array_elements(j) e
                     where jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') > 60
                        or (e #>> '{}') !~ '^[a-z-]{2,6}\|[A-Za-z0-9._-]+$');
$$;
create or replace function public.badges_valides(j jsonb)
returns boolean language sql immutable as $$
  select jsonb_typeof(j) = 'array' and jsonb_array_length(j) <= 80
     and not exists (select 1 from jsonb_array_elements(j) e
                     where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ '^[a-z0-9-]{2,30}$');
$$;

create table if not exists public.public_profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  pseudo       text not null check (pseudo ~ '^[A-Za-z0-9_-]{3,20}$'),
  showcase     jsonb not null default '[]'::jsonb check (public.cles_valides(showcase, 6)),
  badges       jsonb not null default '[]'::jsonb check (public.badges_valides(badges)),
  badge_count  int generated always as (jsonb_array_length(badges)) stored,
  cards        int not null default 0 check (cards between 0 and 200000),
  sets_done    int not null default 0 check (sets_done between 0 and 5000),
  langs        int not null default 0 check (langs between 0 and 12),
  visible      boolean not null default true,
  blocked      boolean not null default false,   -- masqué par l'admin
  updated_at   timestamptz not null default now()
);
create unique index if not exists public_profiles_pseudo_unique on public.public_profiles (lower(pseudo));
create index if not exists public_profiles_cards_idx on public.public_profiles (cards desc);

alter table public.public_profiles enable row level security;

drop policy if exists "profils : lecture" on public.public_profiles;
create policy "profils : lecture" on public.public_profiles
  for select to anon, authenticated
  using ((visible and not blocked) or user_id = auth.uid() or public.is_admin());
drop policy if exists "profils : creer" on public.public_profiles;
create policy "profils : creer" on public.public_profiles
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "profils : modifier" on public.public_profiles;
create policy "profils : modifier" on public.public_profiles
  for update to authenticated using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists "profils : supprimer" on public.public_profiles;
create policy "profils : supprimer" on public.public_profiles
  for delete to authenticated using ((user_id = auth.uid() and not blocked) or public.is_admin());

-- Un membre ne peut pas se débloquer lui-même
create or replace function public.protege_profil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.blocked := coalesce(old.blocked, false);
  end if;
  new.updated_at := now();
  return new;
end; $$;
drop trigger if exists protege_public_profiles on public.public_profiles;
create trigger protege_public_profiles before insert or update on public.public_profiles
  for each row execute procedure public.protege_profil();

grant select on public.public_profiles to anon, authenticated;
grant insert, update, delete on public.public_profiles to authenticated;
