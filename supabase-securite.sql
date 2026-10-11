-- ==========================================================
-- MGTCG — supabase-securite.sql   (sécurité renforcée)
-- À copier-coller UNE SEULE FOIS dans Supabase :
-- SQL Editor → New query → coller → Run
-- Double authentification (2FA) : quand un membre l'a activée, ses
-- données (collection, échanges, photos…) ne sont accessibles
-- qu'après avoir tapé le code de son appli d'authentification.
-- Pour l'admin : les pouvoirs d'administration demandent aussi le code.
-- Créé par Mathis GILLIG.
-- ==========================================================

-- Vrai si la session a passé le bon niveau de sécurité :
-- membre SANS 2FA → toujours vrai ; membre AVEC 2FA → seulement après le code (aal2)
create or replace function public.mfa_ok()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified');
$$;
grant execute on function public.mfa_ok() to anon, authenticated;

-- L'admin doit avoir passé la 2FA s'il l'a activée
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') and public.mfa_ok();
$$;

-- Règles « restrictives » : elles s'ajoutent aux règles existantes
do $$
declare t text;
begin
  foreach t in array array['collections', 'trade_lists', 'trade_offers', 'trade_blocks'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "2FA obligatoire si activée" on public.%I', t);
      execute format('create policy "2FA obligatoire si activée" on public.%I as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok())', t);
    end if;
  end loop;
end $$;

-- Photos privées du passeport
drop policy if exists "passeports : 2FA obligatoire si activée" on storage.objects;
create policy "passeports : 2FA obligatoire si activée" on storage.objects
  as restrictive for all to authenticated
  using (bucket_id <> 'passeports' or public.mfa_ok())
  with check (bucket_id <> 'passeports' or public.mfa_ok());
