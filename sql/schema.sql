-- Migration: add multiplier to products and app_settings table
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add multiplier to products (used to scale filament usage costs)
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS multiplier numeric DEFAULT 1.0;
UPDATE public.products SET multiplier = 1.0 WHERE multiplier IS NULL;

-- app_settings table (if not already applied)
CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner uuid REFERENCES auth.users(id),
  mat_cost_per_kg numeric,
  hourly_rate numeric,
  margin numeric,
  default_multiplier numeric DEFAULT 1.0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
-- Add default_multiplier if table already existed without it
ALTER TABLE IF EXISTS public.app_settings ADD COLUMN IF NOT EXISTS default_multiplier numeric DEFAULT 1.0;
CREATE UNIQUE INDEX IF NOT EXISTS app_settings_owner_idx ON public.app_settings(owner);

-- Enable RLS and policies (safe minimal setup)
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='app_settings' AND policyname='app_settings_select_owner') THEN
    PERFORM pg_sleep(0); -- no-op to keep DO block
    EXECUTE 'CREATE POLICY app_settings_select_owner ON public.app_settings FOR SELECT USING (owner = auth.uid())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='app_settings' AND policyname='app_settings_insert_owner') THEN
    EXECUTE 'CREATE POLICY app_settings_insert_owner ON public.app_settings FOR INSERT WITH CHECK (owner = auth.uid())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='app_settings' AND policyname='app_settings_update_owner') THEN
    EXECUTE 'CREATE POLICY app_settings_update_owner ON public.app_settings FOR UPDATE USING (owner = auth.uid()) WITH CHECK (owner = auth.uid())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='app_settings' AND policyname='app_settings_delete_owner') THEN
    EXECUTE 'CREATE POLICY app_settings_delete_owner ON public.app_settings FOR DELETE USING (owner = auth.uid())';
  END IF;
END$$;

-- Ensure existing products have multiplier set
UPDATE public.products SET multiplier = 1.0 WHERE multiplier IS NULL;

-- End migration
-- SQL para criar tabelas no Supabase (execute no SQL Editor do Supabase)
-- Filamentos
create table if not exists filaments (
  id uuid primary key default gen_random_uuid(),
  name text,
  color text,
  manufacturer text,
  quantity numeric,
  price_per_kg numeric,
  photo text,
  inserted_at timestamptz default now()
);

-- Produtos (catalogo)
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text,
  price numeric,
  photo text,
  filaments_info text, -- JSON: [{"filament_id":"uuid","name":"PLA Branco","color":"Branco","qty":50}]
  print_time numeric,  -- horas de impressão (opcional)
  inserted_at timestamptz default now()
);
-- Migracao (execute se a tabela ja existia):
-- alter table products add column if not exists filaments_info text;
-- alter table products add column if not exists print_time numeric;
-- alter table filaments add column if not exists price_per_kg numeric;

-- Vendas
create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  product_name text,
  price numeric,
  notes text,
  created_at timestamptz default now()
);

-- Itens da venda (mapear uso de filamento para dedução)
create table if not exists sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid references sales(id) on delete cascade,
  filament_id uuid references filaments(id) on delete set null,
  qty_used numeric
);

-- Clientes
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text,
  notes text,
  created_at timestamptz default now()
);

alter table customers enable row level security;
drop policy if exists "customers_auth" on customers;
create policy "customers_auth" on customers for all to authenticated using (true) with check (true);

-- Encomendas (ordens de serviço pendentes)
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  product_name text not null,
  price numeric not null default 0,
  notes text,
  status text not null default 'pendente',
  created_at timestamptz default now()
);
-- Migracao (execute se a tabela ja existia):
-- alter table orders add column if not exists customer_id uuid references customers(id) on delete set null;
-- (Se tiver colunas customer_name/customer_contact antigas, podem ser removidas após migrar dados)

-- Itens da encomenda (filamentos necessários, sem deduzir estoque)
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  filament_id uuid references filaments(id) on delete set null,
  qty_needed numeric not null default 0
);

-- RLS: habilitar e liberar acesso para usuários autenticados
alter table orders      enable row level security;
alter table order_items enable row level security;

drop policy if exists "orders_auth"      on orders;
drop policy if exists "order_items_auth" on order_items;

create policy "orders_auth"
  on orders for all
  to authenticated
  using (true)
  with check (true);

create policy "order_items_auth"
  on order_items for all
  to authenticated
  using (true)
  with check (true);
