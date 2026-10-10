-- ==========================================================
-- MGTCG — supabase-bouclier.sql   (V3 : bouclier anti-arnaques)
-- À copier-coller UNE SEULE FOIS dans Supabase :
-- SQL Editor → New query → coller → Run
-- Les membres signalent des FAÇONS d'arnaquer (pas de pseudo, pas de nom) ;
-- l'admin valide avant publication.
-- Créé par Mathis GILLIG.
-- ==========================================================

create table if not exists public.scam_alerts (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 5 and 140),
  description  text not null check (char_length(description) between 20 and 1500),
  platform     text not null default 'Autre' check (platform in ('Vinted', 'Leboncoin', 'eBay', 'Cardmarket', 'Facebook', 'Instagram', 'Discord', 'WhatsApp', 'En main propre', 'Autre')),
  kind         text not null default 'Autre' check (kind in ('Fausse carte', 'Booster rescellé', 'Faux boîtier gradé', 'Paiement', 'Faux lien', 'Colis', 'Échange', 'Autre')),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists scam_alerts_idx on public.scam_alerts (status, created_at desc);

alter table public.scam_alerts enable row level security;

drop policy if exists "alertes : lecture" on public.scam_alerts;
create policy "alertes : lecture" on public.scam_alerts
  for select to anon, authenticated
  using (status = 'approved' or created_by = auth.uid() or public.is_admin());

drop policy if exists "alertes : signaler" on public.scam_alerts;
create policy "alertes : signaler" on public.scam_alerts
  for insert to authenticated
  with check (created_by = auth.uid() and (status = 'pending' or public.is_admin()));

drop policy if exists "alertes : admin modifie" on public.scam_alerts;
create policy "alertes : admin modifie" on public.scam_alerts
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "alertes : admin supprime" on public.scam_alerts;
create policy "alertes : admin supprime" on public.scam_alerts
  for delete to authenticated using (public.is_admin());

-- Anti-spam : 3 signalements en attente maximum par membre
create or replace function public.limite_alertes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return new; end if;
  if (select count(*) from public.scam_alerts where created_by = auth.uid() and status = 'pending') >= 3 then
    raise exception 'Limite atteinte : 3 signalements en attente de validation maximum.';
  end if;
  return new;
end; $$;
drop trigger if exists anti_spam_scam_alerts on public.scam_alerts;
create trigger anti_spam_scam_alerts before insert on public.scam_alerts
  for each row execute procedure public.limite_alertes();

grant select on public.scam_alerts to anon, authenticated;
grant insert, update, delete on public.scam_alerts to authenticated;

-- Premières alertes (rédigées par MGTCG)
insert into public.scam_alerts (title, description, platform, kind, status)
select v.title, v.description, v.platform, v.kind, 'approved'
from (values
  ('Faux lien « paiement sécurisé » envoyé par message',
   'Le vendeur ou l''acheteur te demande de continuer sur WhatsApp ou par email, puis t''envoie un lien qui imite la plateforme (« confirmer la vente », « recevoir ton argent »). Le site demande ta carte bancaire. Ne clique jamais : sur Vinted, Leboncoin ou eBay, tout se passe dans l''appli, jamais par un lien reçu.',
   'Leboncoin', 'Faux lien'),
  ('Boosters à l''unité ouverts puis recollés',
   'Des boosters vendus à l''unité, souvent d''extensions chères, ont été ouverts (cartes rares retirées) puis refermés à la colle ou au fer. Indices : soudures irrégulières, aluminium froissé, booster plus fin. Préfère les produits encore sous blister ou les boutiques.',
   'Vinted', 'Booster rescellé'),
  ('Boîtier gradé dont le numéro ne correspond pas',
   'Une carte « gradée » est vendue dans un boîtier copié. Tape toujours le numéro du certificat sur le site officiel du gradeur : la photo, le nom de la carte et la note doivent correspondre exactement.',
   'eBay', 'Faux boîtier gradé')
) as v(title, description, platform, kind)
where not exists (select 1 from public.scam_alerts a where a.title = v.title);
