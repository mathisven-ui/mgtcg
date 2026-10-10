-- ==========================================================
-- MGTCG — supabase-scelle.sql   (V2 : produits scellés)
-- À copier-coller UNE SEULE FOIS dans Supabase :
-- SQL Editor → New query → coller → Run
-- Créé par Mathis GILLIG.
-- ==========================================================

-- 1) Catalogue des produits (géré par l'admin, proposé par les membres)
create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 3 and 120),
  type         text not null check (type in ('Booster', 'Blister', 'Tripack', 'Display', 'ETB', 'UPC', 'Coffret', 'Pokébox', 'Mini-tin', 'Collection premium', 'Autre')),
  lang         text not null default 'fr' check (lang in ('fr', 'en', 'ja', 'zh', 'ko', 'autre')),
  serie        text check (serie is null or char_length(serie) <= 80),
  set_name     text check (set_name is null or char_length(set_name) <= 80),
  release_date date,
  msrp         numeric(10, 2) check (msrp is null or (msrp > 0 and msrp < 100000)),   -- prix de vente à la sortie
  content      text check (content is null or char_length(content) <= 300),            -- ex : « 9 boosters, 65 sleeves, 1 promo »
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists products_status_idx on public.products (status, release_date desc);

-- 2) Prix constatés (signalés par les membres)
create table if not exists public.product_prices (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  price       numeric(10, 2) not null check (price > 0 and price < 100000),
  source      text not null check (source in ('Cardmarket', 'Boutique', 'eBay', 'Vinted', 'Leboncoin', 'Grande enseigne', 'Autre')),
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists product_prices_idx on public.product_prices (product_id, created_at desc);

-- 3) Sécurité (RLS)
alter table public.products       enable row level security;
alter table public.product_prices enable row level security;

drop policy if exists "produits : lecture" on public.products;
create policy "produits : lecture" on public.products
  for select to anon, authenticated
  using (status = 'approved' or created_by = auth.uid() or public.is_admin());

drop policy if exists "produits : proposer" on public.products;
create policy "produits : proposer" on public.products
  for insert to authenticated
  with check (created_by = auth.uid() and (status = 'pending' or public.is_admin()));

drop policy if exists "produits : admin modifie" on public.products;
create policy "produits : admin modifie" on public.products
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "produits : admin supprime" on public.products;
create policy "produits : admin supprime" on public.products
  for delete to authenticated using (public.is_admin());

drop policy if exists "prix : lecture" on public.product_prices;
create policy "prix : lecture" on public.product_prices
  for select to anon, authenticated using (true);

drop policy if exists "prix : signaler" on public.product_prices;
create policy "prix : signaler" on public.product_prices
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "prix : supprimer" on public.product_prices;
create policy "prix : supprimer" on public.product_prices
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- 4) Anti-spam (l'admin n'est pas limité)
create or replace function public.limite_scelle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then return new; end if;
  if tg_table_name = 'product_prices' then
    if (select count(*) from public.product_prices
        where user_id = auth.uid() and created_at > now() - interval '1 day') >= 30 then
      raise exception 'Limite atteinte : 30 prix signalés par jour maximum.';
    end if;
    if exists (select 1 from public.product_prices
        where user_id = auth.uid() and product_id = new.product_id and created_at > now() - interval '12 hours') then
      raise exception 'Limite atteinte : un seul prix par produit toutes les 12 heures.';
    end if;
  elsif tg_table_name = 'products' then
    if (select count(*) from public.products where created_by = auth.uid() and status = 'pending') >= 10 then
      raise exception 'Limite atteinte : 10 produits en attente de validation maximum.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists anti_spam_prices on public.product_prices;
create trigger anti_spam_prices before insert on public.product_prices
  for each row execute procedure public.limite_scelle();

drop trigger if exists anti_spam_products on public.products;
create trigger anti_spam_products before insert on public.products
  for each row execute procedure public.limite_scelle();

-- 5) Accès via le site (les règles RLS ci-dessus filtrent)
grant select on public.products, public.product_prices to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
grant insert, delete on public.product_prices to authenticated;
