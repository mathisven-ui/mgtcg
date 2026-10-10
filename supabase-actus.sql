-- ==========================================================
-- MGTCG — supabase-actus.sql   (V2 : actualités)
-- À copier-coller UNE SEULE FOIS dans Supabase :
-- SQL Editor → New query → coller → Run
-- Créé par Mathis GILLIG.
-- ==========================================================

create table if not exists public.news (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 5 and 160),
  summary     text not null check (char_length(summary) between 10 and 1200),
  category    text not null default 'Actu' check (category in ('Actu', 'Sortie', 'Marché', 'Grading', 'Tournoi', 'Arnaque')),
  url         text check (url is null or (url ~ '^https?://' and char_length(url) < 400)),
  source      text check (source is null or char_length(source) <= 120),
  published   date not null default current_date,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists news_idx on public.news (status, published desc);

alter table public.news enable row level security;

drop policy if exists "actus : lecture" on public.news;
create policy "actus : lecture" on public.news
  for select to anon, authenticated
  using (status = 'approved' or created_by = auth.uid() or public.is_admin());

drop policy if exists "actus : proposer" on public.news;
create policy "actus : proposer" on public.news
  for insert to authenticated
  with check (created_by = auth.uid() and (status = 'pending' or public.is_admin()));

drop policy if exists "actus : admin modifie" on public.news;
create policy "actus : admin modifie" on public.news
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "actus : admin supprime" on public.news;
create policy "actus : admin supprime" on public.news
  for delete to authenticated using (public.is_admin());

create or replace function public.limite_actus()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return new; end if;
  if (select count(*) from public.news where created_by = auth.uid() and status = 'pending') >= 5 then
    raise exception 'Limite atteinte : 5 actus en attente de validation maximum.';
  end if;
  return new;
end; $$;
drop trigger if exists anti_spam_news on public.news;
create trigger anti_spam_news before insert on public.news
  for each row execute procedure public.limite_actus();

grant select on public.news to anon, authenticated;
grant insert, update, delete on public.news to authenticated;

-- Premières actus (sources consultées le 10 octobre 2026)
insert into public.news (title, summary, category, url, source, published, status)
select v.title, v.summary, v.category, v.url, v.source, v.published::date, 'approved'
from (values
  ('Méga-Évolution – Règne Delta sort le 6 novembre 2026',
   'La prochaine extension française (ME06) arrive le 6 novembre avec boosters, display, demi-display, Coffret Dresseur d''Élite et portfolios. Les avant-premières ont lieu en boutique du 24 octobre au 1er novembre.',
   'Sortie', 'https://lebooster.fr/guides/calendrier-sorties-pokemon', 'lebooster.fr', '2026-10-10'),
  ('30ᵉ anniversaire : une avalanche de produits jusqu''à mi-novembre',
   'Pokébox, collection classeur, decks de combat Mentali-ex et Noctali-ex, Coffrets Ultra-Premium Jour et Nuit, collection Métamorph et collections figurine Mew et Mewtwo s''enchaînent d''octobre à novembre 2026. Dates détaillées dans l''Agenda.',
   'Sortie', 'https://jollycards.fr/pages/calendrier-des-sorties-pokemon', 'jollycards.fr', '2026-10-10'),
  ('Grading : PSA suspend son offre d''entrée de gamme « Value »',
   'En 2026, PSA a suspendu temporairement ses services « Value ». Le premier prix passe par l''offre Regular (79,99 $ par carte). Côté France, PCA démarre à 10,90 € et CCC à 17 € par carte selon la valeur. Compare avec l''outil « Faire grader ? ».',
   'Grading', 'https://margeoapp.com/blog/faire-grader-cartes-pokemon', 'margeoapp.com', '2026-10-10')
) as v(title, summary, category, url, source, published)
where not exists (select 1 from public.news n where n.title = v.title);
