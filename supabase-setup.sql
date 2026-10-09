-- ==========================================================
-- MGTCG — supabase-setup.sql
-- À copier-coller UNE SEULE FOIS dans Supabase :
-- menu de gauche → SQL Editor → New query → coller → Run
-- Créé par Mathis GILLIG.
-- ==========================================================

-- 1) Les profils (un par compte) ---------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  role        text not null default 'user' check (role in ('user', 'admin')),
  created_at  timestamptz not null default now()
);

-- 2) Les collections (une par compte) ----------------------
create table if not exists public.collections (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  -- sécurité : une collection ne peut pas dépasser ~2 Mo
  constraint collection_taille_max check (pg_column_size(data) < 2000000)
);

-- 3) Sécurité : chacun ne voit QUE ses propres données -----
alter table public.profiles    enable row level security;
alter table public.collections enable row level security;

-- Fonction qui dit si la personne connectée est administrateur
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

drop policy if exists "profil : lire le sien (ou admin)" on public.profiles;
create policy "profil : lire le sien (ou admin)" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());
-- Pas de règle de modification : personne ne peut se donner le rôle admin tout seul.

drop policy if exists "collection : lire la sienne (ou admin)" on public.collections;
create policy "collection : lire la sienne (ou admin)" on public.collections
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "collection : créer la sienne" on public.collections;
create policy "collection : créer la sienne" on public.collections
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "collection : modifier la sienne" on public.collections;
create policy "collection : modifier la sienne" on public.collections
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "collection : supprimer la sienne" on public.collections;
create policy "collection : supprimer la sienne" on public.collections
  for delete to authenticated
  using (user_id = auth.uid());

-- 4) Création automatique du profil à l'inscription --------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ==========================================================
-- 5) DEVENIR ADMINISTRATEUR
-- Une fois ton compte créé sur le site (et l'email confirmé),
-- remplace TON-EMAIL ci-dessous, sélectionne UNIQUEMENT cette
-- ligne et clique sur Run :
--
-- update public.profiles set role = 'admin' where email = 'TON-EMAIL';
-- ==========================================================
