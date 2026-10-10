-- ==========================================================
-- MGTCG — supabase-ouvertures.sql   (V2 : ouvertures de boosters + taux de drop)
-- À copier-coller UNE SEULE FOIS dans Supabase :
-- SQL Editor → New query → coller → Run
-- Créé par Mathis GILLIG.
-- ==========================================================

create table if not exists public.openings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  lang        text not null check (char_length(lang) between 2 and 6),
  set_id      text not null check (char_length(set_id) between 1 and 40),
  set_name    text check (set_name is null or char_length(set_name) <= 80),
  product     text not null default 'Booster' check (product in ('Booster', 'Blister', 'Tripack', 'ETB', 'Display', 'Demi-display', 'Coffret', 'Autre')),
  boosters    integer not null check (boosters between 1 and 36),
  -- cartes « rares et plus » tirées : [{ "id": "sv03.5-199", "name": "…", "rarity": "…" }, …]
  pulls       jsonb not null default '[]'::jsonb check (jsonb_typeof(pulls) = 'array' and jsonb_array_length(pulls) <= 120),
  created_at  timestamptz not null default now(),
  constraint pulls_raisonnables check (jsonb_array_length(pulls) <= boosters * 4)
);
create index if not exists openings_set_idx on public.openings (lang, set_id, created_at desc);

alter table public.openings enable row level security;

drop policy if exists "ouvertures : lecture" on public.openings;
create policy "ouvertures : lecture" on public.openings
  for select to anon, authenticated using (true);

drop policy if exists "ouvertures : ajouter" on public.openings;
create policy "ouvertures : ajouter" on public.openings
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "ouvertures : supprimer" on public.openings;
create policy "ouvertures : supprimer" on public.openings
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- Anti-spam : 30 ouvertures enregistrées par jour et par membre
create or replace function public.limite_ouvertures()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.openings
      where user_id = auth.uid() and created_at > now() - interval '1 day') >= 30 then
    raise exception 'Limite atteinte : 30 ouvertures enregistrées par jour maximum.';
  end if;
  return new;
end; $$;
drop trigger if exists anti_spam_openings on public.openings;
create trigger anti_spam_openings before insert on public.openings
  for each row execute procedure public.limite_ouvertures();

grant select on public.openings to anon, authenticated;
grant insert, delete on public.openings to authenticated;
