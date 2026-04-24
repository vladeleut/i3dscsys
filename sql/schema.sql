-- SQL para criar tabelas no Supabase (execute no SQL Editor do Supabase)
-- Filamentos
create table if not exists filaments (
  id uuid primary key default gen_random_uuid(),
  name text,
  color text,
  manufacturer text,
  quantity numeric,
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
  inserted_at timestamptz default now()
);
-- Migracao (execute se a tabela ja existia):
-- alter table products add column if not exists filaments_info text;

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

-- Encomendas (ordens de serviço pendentes)
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  price numeric not null default 0,
  notes text,
  status text not null default 'pendente',
  created_at timestamptz default now()
);

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
