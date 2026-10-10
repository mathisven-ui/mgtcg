-- ==========================================================
-- MGTCG — supabase-suggestions-idf.sql
-- 26 boutiques spécialisées en Île-de-France, trouvées sur
-- tcg.promo, pkmcards.fr et majestikgames.com (octobre 2026).
-- Elles arrivent « en attente » : valide-les une par une dans
-- 👑 Espace admin (le lien « Vérifier l'emplacement » aide).
-- À lancer UNE SEULE FOIS : SQL Editor → New query → Run.
-- ==========================================================
insert into public.shops (name, address, lat, lon, website, note, kind, status)
select v.name, v.address, v.lat, v.lon, v.website, v.note, 'independante', 'pending'
from (values
  ('Ludifolie', '73 rue de Fontenay, 94300 Vincennes', 48.848069, 2.437693, null, 'Suggestion à vérifier (source : tcg.promo).'),
  ('Le Troll Savant', '33 rue du Général Leclerc, 94000 Créteil', 48.792688, 2.462984, 'https://www.letrollsavant.fr', 'Suggestion à vérifier (source : tcg.promo).'),
  ('Ludiworld', '9 boulevard Pierre Mendès France, 77600 Bussy-Saint-Georges', 48.835935, 2.708151, null, 'Suggestion à vérifier (source : pkmcards.fr).'),
  ('PLAZA TCG', '39 avenue de la Société des Nations, 77144 Montévrain', 48.854109, 2.765059, null, 'Suggestion à vérifier (source : tcg.promo).'),
  ('Le Coin des Barons', '48 bis rue de Rivoli, 75004 Paris', 48.856926, 2.354393, null, 'Suggestion à vérifier (source : tcg.promo).'),
  ('Fuji Store', '6 rue Rampon, 75011 Paris', 48.86616, 2.367168, 'https://fuji-store.fr', 'Suggestion à vérifier (source : tcg.promo).'),
  ('Cartabaffe', '78 rue Notre-Dame de Nazareth, 75003 Paris', 48.868018, 2.35476, 'https://www.cartabaffe.fr', 'Suggestion à vérifier (source : tcg.promo).'),
  ('UltraJeux Bastille', '13 rue Amelot, 75011 Paris', 48.855432, 2.369242, null, 'Suggestion à vérifier (source : tcg.promo).'),
  ('UltraJeux Oberkampf', '108 boulevard Richard Lenoir, 75011 Paris', 48.863895, 2.371571, null, 'Suggestion à vérifier (source : tcg.promo).'),
  ('UltraJeux Rennes-Raspail', '110 rue de Rennes, 75006 Paris', 48.848472, 2.32808, null, 'Suggestion à vérifier (source : tcg.promo).'),
  ('Variantes', '29 rue Saint-André des Arts, 75006 Paris', 48.85329, 2.342134, null, 'Suggestion à vérifier (source : tcg.promo).'),
  ('Curious Pop', '57 rue du Temple, 75004 Paris', 48.860226, 2.354597, null, 'Suggestion à vérifier (source : tcg.promo).'),
  ('Atmos Arena', '4 rue du Caire, 75002 Paris', 48.867214, 2.352458, null, 'Suggestion à vérifier (source : tcg.promo).'),
  ('Le Repaire du Dragon', '43 bis avenue Simon Bolivar, 75019 Paris', 48.876057, 2.380553, null, 'Suggestion à vérifier (source : tcg.promo).'),
  ('Playin Paris BNF', '131 avenue de France, 75013 Paris', 48.831216, 2.375755, null, 'Suggestion à vérifier (source : tcg.promo / pkmcards.fr).'),
  ('BaronCollections', '26 boulevard Voltaire, 75011 Paris', 48.864644, 2.368307, null, 'Suggestion à vérifier (source : tcg.promo).'),
  ('Troll2jeux', '15-17 place d''Aligre, 75012 Paris', 48.848844, 2.378865, null, 'Suggestion à vérifier (source : tcg.promo).'),
  ('Parkage', '25 rue Geoffroy-Saint-Hilaire, 75005 Paris', 48.840277, 2.356146, null, 'Suggestion à vérifier (source : tcg.promo).'),
  ('MEiSiA', '84 rue René Boulanger, 75010 Paris', 48.869365, 2.356953, null, 'Suggestion à vérifier (source : pkmcards.fr).'),
  ('MajestiK Games', '148 avenue du Maine, 75014 Paris', 48.834237, 2.324001, 'https://www.majestikgames.com', 'Suggestion à vérifier (source : majestikgames.com).'),
  ('PokéMagique', '44 rue Voltaire, 92800 Puteaux', 48.879633, 2.241873, 'https://pokemagique.fr', 'Suggestion à vérifier (source : tcg.promo).'),
  ('Mystic Games', '270 boulevard Jean Jaurès, 92100 Boulogne-Billancourt', 48.826357, 2.247494, null, 'Suggestion à vérifier (source : tcg.promo).'),
  ('Le Repaire TCG', '153 avenue Achille Peretti, 92200 Neuilly-sur-Seine', 48.884707, 2.267132, null, 'Suggestion à vérifier (source : tcg.promo).'),
  ('Goupiya', '67 avenue Aristide Briand, 92160 Antony', 48.758216, 2.306741, null, 'Suggestion à vérifier (source : pkmcards.fr).'),
  ('L''Antre de Po', '9 place Hoche, 78000 Versailles', 48.806222, 2.128527, null, 'Suggestion à vérifier (source : tcg.promo).'),
  ('Les Fous du Roy', '31 rue du Général Leclerc, 78000 Versailles', 48.798977, 2.127215, null, 'Suggestion à vérifier (source : tcg.promo).')
) as v(name, address, lat, lon, website, note)
where not exists (select 1 from public.shops s where lower(s.name) = lower(v.name));
