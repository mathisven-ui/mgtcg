-- ==========================================================
-- MGTCG — supabase-passeport.sql   (V3 : photos du passeport des cartes)
-- À copier-coller UNE SEULE FOIS dans Supabase :
-- SQL Editor → New query → coller → Run
-- Crée un espace de stockage PRIVÉ « passeports » : chaque membre ne
-- peut voir, ajouter et supprimer que SES photos (dossier = son identifiant).
-- Photos en JPEG, 600 Ko maximum (le site les réduit avant l'envoi).
-- Créé par Mathis GILLIG.
-- ==========================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('passeports', 'passeports', false, 614400, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 614400, allowed_mime_types = array['image/jpeg'];

drop policy if exists "passeports : voir mes photos" on storage.objects;
create policy "passeports : voir mes photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'passeports' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "passeports : ajouter mes photos" on storage.objects;
create policy "passeports : ajouter mes photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'passeports' and (storage.foldername(name))[1] = auth.uid()::text
              and lower(storage.extension(name)) = 'jpg'
              -- 400 photos maximum par membre
              and (select count(*) from storage.objects o
                   where o.bucket_id = 'passeports' and (storage.foldername(o.name))[1] = auth.uid()::text) < 400);

drop policy if exists "passeports : supprimer mes photos" on storage.objects;
create policy "passeports : supprimer mes photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'passeports' and (storage.foldername(name))[1] = auth.uid()::text);
