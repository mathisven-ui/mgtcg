-- ==========================================================
-- MGTCG — supabase-avis.sql   (V3 : avis de la communauté)
-- À copier-coller UNE SEULE FOIS dans Supabase :
-- SQL Editor → New query → coller → Run
-- Avis encadrés sur les boutiques et les produits scellés :
-- une note, des points positifs / négatifs choisis dans une liste,
-- et un court commentaire FACULTATIF qui n'est visible qu'après
-- validation par l'administrateur.
-- Créé par Mathis GILLIG.
-- ==========================================================

create table if not exists public.reviews (
  id             uuid primary key default gen_random_uuid(),
  target_kind    text not null check (target_kind in ('boutique', 'produit')),
  target_id      text not null check (target_id ~ '^(osm:(node|way|relation)/[0-9]{1,15}|mg:[0-9a-f-]{36}|[0-9a-f-]{36})$'),
  target_name    text not null check (char_length(target_name) between 2 and 120),
  rating         int not null check (rating between 1 and 5),
  pros           text[] not null default '{}',
  cons           text[] not null default '{}',
  comment        text check (comment is null or char_length(comment) between 3 and 300),
  comment_ok     boolean not null default false,   -- commentaire validé par l'admin
  comment_public text generated always as (case when comment_ok then comment end) stored,
  status         text not null default 'visible' check (status in ('visible', 'hidden')),
  created_by     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (created_by, target_kind, target_id)
);
create index if not exists reviews_target_idx on public.reviews (target_kind, target_id);
create index if not exists reviews_recent_idx on public.reviews (created_at desc);

alter table public.reviews enable row level security;

drop policy if exists "avis : lecture" on public.reviews;
create policy "avis : lecture" on public.reviews
  for select to anon, authenticated using (status = 'visible' or created_by = auth.uid() or public.is_admin());
drop policy if exists "avis : donner" on public.reviews;
create policy "avis : donner" on public.reviews
  for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "avis : modifier" on public.reviews;
create policy "avis : modifier" on public.reviews
  for update to authenticated using (created_by = auth.uid() or public.is_admin()) with check (created_by = auth.uid() or public.is_admin());
drop policy if exists "avis : supprimer" on public.reviews;
create policy "avis : supprimer" on public.reviews
  for delete to authenticated using (created_by = auth.uid() or public.is_admin());

-- Contrôles : listes de points autorisés, pas de coordonnées, anti-spam, modération
create or replace function public.controle_avis()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pros_ok text[]; cons_ok text[];
begin
  if new.target_kind = 'boutique' then
    pros_ok := array['Bon accueil', 'Bons conseils', 'Prix corrects', 'Bien approvisionnée', 'Tournois / animations', 'Prix de sortie respectés', 'Cartes à l''unité', 'Coin pour jouer'];
    cons_ok := array['Prix trop élevés', 'Souvent en rupture', 'Lots imposés', 'Accueil à revoir', 'Horaires pas fiables'];
    if new.target_id ~ '^[0-9a-f-]{36}$' then raise exception 'Boutique inconnue.'; end if;
    if new.target_id like 'mg:%' and not exists (select 1 from public.shops where id::text = substr(new.target_id, 4) and status = 'approved') then
      raise exception 'Boutique inconnue.';
    end if;
  else
    pros_ok := array['Bon rapport qualité-prix', 'Belles cartes promo', 'Contenu généreux', 'Joli objet', 'Idéal pour débuter'];
    cons_ok := array['Trop cher', 'Peu de contenu', 'Emballage fragile', 'Difficile à trouver', 'Revendu trop cher'];
    if new.target_id !~ '^[0-9a-f-]{36}$' or not exists (select 1 from public.products where id::text = new.target_id and status = 'approved') then
      raise exception 'Produit inconnu.';
    end if;
    select name into new.target_name from public.products where id::text = new.target_id;
  end if;
  if not (new.pros <@ pros_ok) or not (new.cons <@ cons_ok) or cardinality(new.pros) > 5 or cardinality(new.cons) > 5 then
    raise exception 'Points positifs / négatifs invalides.';
  end if;
  new.comment := nullif(btrim(new.comment), '');
  if new.comment ~* '(@|https?://|www\.|\.(com|fr|net)\M|(\+33|\m0)[1-9]([ .-]?[0-9]{2}){4}|snap|insta|whatsapp|discord|telegram)' then
    raise exception 'Pas de lien, de pseudo ni de coordonnées dans le commentaire.';
  end if;
  if new.target_name ~* '(@|https?://)' then raise exception 'Nom invalide.'; end if;

  if tg_op = 'INSERT' then
    if (select count(*) from public.reviews where created_by = auth.uid() and created_at > now() - interval '1 day') >= 10 then
      raise exception 'Limite atteinte : 10 avis par jour maximum.';
    end if;
    if not public.is_admin() then new.comment_ok := false; new.status := 'visible'; end if;
  else
    if not public.is_admin() then
      new.status := old.status;
      new.comment_ok := case when new.comment is distinct from old.comment then false else old.comment_ok end;
      new.created_by := old.created_by; new.target_kind := old.target_kind; new.target_id := old.target_id;
    end if;
  end if;
  new.updated_at := now();
  return new;
end; $$;
drop trigger if exists controle_reviews on public.reviews;
create trigger controle_reviews before insert or update on public.reviews
  for each row execute procedure public.controle_avis();

-- Le commentaire brut n'est lisible que par son auteur et l'admin (via la fonction ci-dessous) ;
-- tout le monde voit « comment_public » (rempli seulement une fois validé).
revoke all on public.reviews from anon, authenticated;
grant select (id, target_kind, target_id, target_name, rating, pros, cons, comment_public, comment_ok, status, created_by, created_at, updated_at)
  on public.reviews to anon, authenticated;
grant insert (target_kind, target_id, target_name, rating, pros, cons, comment) on public.reviews to authenticated;
grant update (rating, pros, cons, comment, comment_ok, status) on public.reviews to authenticated;
grant delete on public.reviews to authenticated;

-- Mon avis (avec mon commentaire, même pas encore validé)
create or replace function public.mon_avis(kind text, tid text)
returns table (id uuid, rating int, pros text[], cons text[], comment text, comment_ok boolean)
language sql stable security definer set search_path = public as $$
  select r.id, r.rating, r.pros, r.cons, r.comment, r.comment_ok from public.reviews r
  where r.created_by = auth.uid() and r.target_kind = kind and r.target_id = tid;
$$;
-- Commentaires à valider (admin seulement)
create or replace function public.avis_a_valider()
returns table (id uuid, target_kind text, target_name text, rating int, comment text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.target_kind, r.target_name, r.rating, r.comment, r.created_at from public.reviews r
  where public.is_admin() and r.comment is not null and not r.comment_ok and r.status = 'visible'
  order by r.created_at limit 100;
$$;
revoke all on function public.mon_avis(text, text) from public, anon;
revoke all on function public.avis_a_valider() from public, anon;
grant execute on function public.mon_avis(text, text) to authenticated;
grant execute on function public.avis_a_valider() to authenticated;
