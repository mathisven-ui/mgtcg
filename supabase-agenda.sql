-- ==========================================================
-- MGTCG — supabase-agenda.sql   (V2 : agenda des sorties et conventions)
-- À copier-coller UNE SEULE FOIS dans Supabase :
-- SQL Editor → New query → coller → Run
-- Créé par Mathis GILLIG.
-- ==========================================================

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('sortie', 'sortie-jp', 'avant-premiere', 'convention', 'tournoi', 'autre')),
  title       text not null check (char_length(title) between 3 and 140),
  start_date  date not null,
  end_date    date check (end_date is null or end_date >= start_date),
  city        text check (city is null or char_length(city) <= 120),
  address     text check (address is null or char_length(address) <= 200),
  lat         double precision check (lat is null or lat between -90 and 90),
  lon         double precision check (lon is null or lon between -180 and 180),
  url         text check (url is null or (url ~ '^https?://' and char_length(url) < 400)),
  description text check (description is null or char_length(description) <= 500),
  source      text check (source is null or char_length(source) <= 120),
  confirmed   boolean not null default true,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists events_date_idx on public.events (status, start_date);

alter table public.events enable row level security;

drop policy if exists "agenda : lecture" on public.events;
create policy "agenda : lecture" on public.events
  for select to anon, authenticated
  using (status = 'approved' or created_by = auth.uid() or public.is_admin());

drop policy if exists "agenda : proposer" on public.events;
create policy "agenda : proposer" on public.events
  for insert to authenticated
  with check (created_by = auth.uid() and (status = 'pending' or public.is_admin()));

drop policy if exists "agenda : admin modifie" on public.events;
create policy "agenda : admin modifie" on public.events
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "agenda : admin supprime" on public.events;
create policy "agenda : admin supprime" on public.events
  for delete to authenticated using (public.is_admin());

-- Anti-spam : 10 propositions en attente maximum par membre
create or replace function public.limite_agenda()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return new; end if;
  if (select count(*) from public.events where created_by = auth.uid() and status = 'pending') >= 10 then
    raise exception 'Limite atteinte : 10 événements en attente de validation maximum.';
  end if;
  return new;
end; $$;
drop trigger if exists anti_spam_events on public.events;
create trigger anti_spam_events before insert on public.events
  for each row execute procedure public.limite_agenda();

grant select on public.events to anon, authenticated;
grant insert, update, delete on public.events to authenticated;

-- ==========================================================
-- Premiers événements (sources : lebooster.fr, jollycards.fr,
-- tobiocards.com — consultés le 10 octobre 2026).
-- Les dates peuvent bouger : vérifie sur le site de l'événement.
-- Conventions : position = ville (pas l'adresse exacte du lieu).
-- ==========================================================
insert into public.events (kind, title, start_date, end_date, city, lat, lon, url, description, source, confirmed, status)
select v.kind, v.title, v.start_date::date, v.end_date::date, v.city, v.lat, v.lon, v.url, v.description, v.source, v.confirmed, 'approved'
from (values
  ('sortie', 'Pokébox 30ᵉ Anniversaire (Amphinobi-ex et Nymphali-ex)', '2026-10-16', null, null, null, null, null, 'Boîtes avec 4 boosters et une carte promo.', 'lebooster.fr / jollycards.fr', true),
  ('sortie', 'Collection classeur 30ᵉ Anniversaire', '2026-10-23', null, null, null, null, null, 'Classeur + 5 boosters.', 'lebooster.fr / jollycards.fr', true),
  ('avant-premiere', 'Avant-premières Méga-Évolution – Règne Delta', '2026-10-24', '2026-11-01', null, null, null, null, 'Tournois d''avant-première dans les boutiques participantes, avec le Coffret Stratégies et Combats.', 'lebooster.fr / jollycards.fr', true),
  ('sortie', 'Decks de combat 30ᵉ Anniversaire Mentali-ex et Noctali-ex', '2026-10-30', null, null, null, null, null, null, 'lebooster.fr / jollycards.fr', true),
  ('sortie', 'Méga-Évolution – Règne Delta (ME06)', '2026-11-06', null, null, null, null, null, 'Nouvelle extension : boosters, display, demi-display, Coffret Dresseur d''Élite, portfolios.', 'lebooster.fr / jollycards.fr', true),
  ('sortie', 'Coffrets Ultra-Premium 30ᵉ Anniversaire Jour et Nuit', '2026-11-06', null, null, null, null, null, null, 'lebooster.fr / jollycards.fr', true),
  ('sortie', 'Collection Premium Métamorph 30ᵉ Anniversaire', '2026-11-06', null, null, null, null, null, '8 boosters.', 'lebooster.fr / jollycards.fr', true),
  ('sortie', 'Collections avec figurine Mew et Mewtwo 30ᵉ Anniversaire', '2026-11-06', null, null, null, null, null, '5 boosters chacune.', 'lebooster.fr / jollycards.fr', true),
  ('sortie', 'Collections autocollant 30ᵉ Anniversaire Lucario et Noadkoko d''Alola', '2026-11-13', null, null, null, null, null, 'Tripack avec autocollant.', 'lebooster.fr / jollycards.fr', true),
  ('sortie-jp', 'Aura Seeker (Japon)', '2026-11-27', null, null, null, null, null, 'Extension japonaise annoncée par la rumeur, pas encore confirmée par Pokémon.', 'lebooster.fr (d''après PokeBeach)', false),
  ('sortie-jp', 'MEGA x MEGA Parade (Japon)', '2027-02-19', null, null, null, null, null, 'Extension japonaise selon la rumeur, pas encore annoncée par Pokémon.', 'lebooster.fr (d''après PokeBeach)', false),
  ('convention', 'Animasia 2026', '2026-10-10', '2026-10-11', 'Bordeaux (33)', 44.8378, -0.5792, 'https://www.animasia.org/', 'Convention / salon : renseigne-toi sur le site pour la présence de stands TCG et de tournois.', 'tobiocards.com', true),
  ('convention', 'Village TCG #1 – Boulogne Geek Festival', '2026-10-10', '2026-10-11', 'Boulogne-sur-Mer (62)', 50.7264, 1.6147, 'https://boulognegeekfestival.fr/', 'Convention / salon : renseigne-toi sur le site pour la présence de stands TCG et de tournois.', 'tobiocards.com', true),
  ('convention', 'Geek Life Blois 2026', '2026-10-10', '2026-10-11', 'Blois (41)', 47.5861, 1.3359, 'https://www.geeklife.fr/blois/', 'Convention / salon : renseigne-toi sur le site pour la présence de stands TCG et de tournois.', 'tobiocards.com', true),
  ('convention', 'Kamo Con NEO', '2026-10-17', '2026-10-18', 'Dijon (21)', 47.322, 5.0415, 'https://kamocon-neo.fr/', 'Convention / salon : renseigne-toi sur le site pour la présence de stands TCG et de tournois.', 'tobiocards.com', true),
  ('convention', 'Hashtag Festival 2026', '2026-10-17', '2026-10-18', 'Bourg-en-Bresse (01)', 46.2052, 5.2255, 'https://hashtag-festival.com/', 'Convention / salon : renseigne-toi sur le site pour la présence de stands TCG et de tournois.', 'tobiocards.com', true),
  ('convention', 'Neo Geek Card Show', '2026-10-17', '2026-10-18', 'Vergèze (30)', 43.7442, 4.2206, 'https://www.instagram.com/neo.geekshow/', 'Convention / salon : renseigne-toi sur le site pour la présence de stands TCG et de tournois.', 'tobiocards.com', true),
  ('convention', 'Paris Games Week 2026', '2026-10-22', '2026-10-25', 'Paris (75) – Paris Expo Porte de Versailles', 48.8323, 2.2875, 'https://www.parisgamesweek.com/fr', 'Convention / salon : renseigne-toi sur le site pour la présence de stands TCG et de tournois.', 'tobiocards.com', true),
  ('convention', 'TGS Pau Anime Game Show 2026', '2026-10-31', '2026-11-01', 'Pau (64)', 43.2951, -0.3708, 'https://tgs-pau.fr/', 'Convention / salon : renseigne-toi sur le site pour la présence de stands TCG et de tournois.', 'tobiocards.com', true),
  ('convention', 'Japan Event 2026', '2026-10-31', '2026-11-01', 'Clermont-Ferrand (63)', 45.7772, 3.087, 'https://www.japan-event.fr/', 'Convention / salon : renseigne-toi sur le site pour la présence de stands TCG et de tournois.', 'tobiocards.com', true),
  ('convention', 'Albi Games Festival 2026', '2026-10-31', '2026-11-01', 'Le Séquestre / Albi (81)', 43.9126, 2.111, 'https://www.facebook.com/albigamesfestival/', 'Convention / salon : renseigne-toi sur le site pour la présence de stands TCG et de tournois.', 'tobiocards.com', true),
  ('convention', 'HeroFestival Marseille Saison XII', '2026-11-07', '2026-11-08', 'Marseille (13)', 43.2965, 5.3698, 'https://www.herofestival.fr/', 'Convention / salon : renseigne-toi sur le site pour la présence de stands TCG et de tournois.', 'tobiocards.com', true),
  ('convention', 'JAPAN Mangalaxy Orléans', '2026-11-07', '2026-11-08', 'Orléans (45)', 47.903, 1.9093, 'https://www.billetweb.fr/japan-mangalaxy-1ere-dition-les-7-et-8-novembre-2026', 'Convention / salon : renseigne-toi sur le site pour la présence de stands TCG et de tournois.', 'tobiocards.com', true),
  ('convention', 'Y/CON 2026', '2026-11-07', '2026-11-08', 'Montreuil (93)', 48.8638, 2.4485, 'https://y-con-france.com/en/home/', 'Convention / salon : renseigne-toi sur le site pour la présence de stands TCG et de tournois.', 'tobiocards.com', true),
  ('convention', 'Art To Play 2026', '2026-11-14', '2026-11-15', 'Nantes (44)', 47.2184, -1.5536, 'https://art-to-play.fr/', 'Convention / salon : renseigne-toi sur le site pour la présence de stands TCG et de tournois.', 'tobiocards.com', true),
  ('convention', 'Anim''Est 2026', '2026-11-14', '2026-11-15', 'Nancy (54)', 48.6921, 6.1844, 'https://animest.net/', 'Convention / salon : renseigne-toi sur le site pour la présence de stands TCG et de tournois.', 'tobiocards.com', true),
  ('convention', 'Anime Focal Paris 2026', '2026-11-14', '2026-11-15', 'Nanterre (92)', 48.8924, 2.2071, 'https://www.animefocal.com/paris/', 'Convention / salon : renseigne-toi sur le site pour la présence de stands TCG et de tournois.', 'tobiocards.com', true),
  ('convention', 'Geek Legends – Vesoul #9', '2026-11-14', '2026-11-15', 'Vesoul (70)', 47.6233, 6.155, 'https://geeklegends.fr/', 'Convention / salon : renseigne-toi sur le site pour la présence de stands TCG et de tournois.', 'tobiocards.com', true),
  ('convention', 'Geek Days Lille Winter 2026', '2026-11-21', '2026-11-22', 'Lille (59)', 50.6292, 3.0573, 'https://www.geek-days.com/fr', 'Convention / salon : renseigne-toi sur le site pour la présence de stands TCG et de tournois.', 'tobiocards.com', true),
  ('convention', 'Game''In Reims 2026', '2026-11-21', '2026-11-22', 'Reims (51)', 49.2583, 4.0317, 'https://www.gameinreims.fr/fr', 'Convention / salon : renseigne-toi sur le site pour la présence de stands TCG et de tournois.', 'tobiocards.com', true),
  ('convention', 'Geek Life – Amiens 2026', '2026-11-21', '2026-11-22', 'Amiens (80)', 49.8941, 2.2958, 'https://www.geeklife.fr/amiens/', 'Convention / salon : renseigne-toi sur le site pour la présence de stands TCG et de tournois.', 'tobiocards.com', true),
  ('convention', 'TGS Toulouse Occitanie Game Show 2026', '2026-11-28', '2026-11-29', 'Aussonne / Toulouse (31)', 43.6806, 1.3134, 'https://tgs-toulouse.fr/', 'Convention / salon : renseigne-toi sur le site pour la présence de stands TCG et de tournois.', 'tobiocards.com', true),
  ('convention', 'Japan Touch 2026', '2026-11-28', '2026-11-29', 'Chassieu / Lyon (69)', 45.731, 4.948, 'https://www.japan-touch.com/', 'Convention / salon : renseigne-toi sur le site pour la présence de stands TCG et de tournois.', 'tobiocards.com', true),
  ('convention', 'Geek Collector – Bar-le-Duc #1', '2026-12-06', null, 'Bar-le-Duc (55)', 48.7728, 5.16, 'https://geekcollector.fr/', 'Convention / salon : renseigne-toi sur le site pour la présence de stands TCG et de tournois.', 'tobiocards.com', true),
  ('convention', 'Retro Toys Saint-Laurent-en-Caux', '2026-12-06', null, 'Saint-Laurent-en-Caux (76)', 49.756, 0.88, 'https://www.retro-toys.fr/', 'Convention / salon : renseigne-toi sur le site pour la présence de stands TCG et de tournois.', 'tobiocards.com', true),
  ('convention', 'Winter Geek Festival 2026', '2026-12-12', '2026-12-13', 'La Louvière (Belgique)', 50.4802, 4.1873, 'https://www.billetweb.fr/le-winter-geek-festival-2026&language=en', 'Convention / salon : renseigne-toi sur le site pour la présence de stands TCG et de tournois.', 'tobiocards.com', true),
  ('convention', 'Comic Con Luxembourg 2026', '2026-12-12', '2026-12-13', 'Luxembourg', 49.6116, 6.1319, 'https://comiccon.lu/', 'Convention / salon : renseigne-toi sur le site pour la présence de stands TCG et de tournois.', 'tobiocards.com', true)
) as v(kind, title, start_date, end_date, city, lat, lon, url, description, source, confirmed)
where not exists (select 1 from public.events x where lower(x.title) = lower(v.title));
