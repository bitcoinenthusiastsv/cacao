-- CacaoMarket, Fase 1: tables, row-level security for reads, and the photo bucket.
--
-- Rule of the whole app: the browser never writes to these tables. Every write goes through the
-- Next.js server, which checks the session and then calls the functions of the next migration with
-- the service role. So the policies below only grant SELECT; with no INSERT/UPDATE/DELETE policy,
-- row-level security refuses those to `anon` and `authenticated`.

create type public.estado_negocio as enum ('pendiente', 'aprobado', 'suspendido');
create type public.estado_orden as enum (
  'creada', 'esperando_pago', 'pagada', 'lista', 'entregada', 'cerrada', 'expirada', 'disputada', 'resuelta'
);
create type public.modo_entrega as enum ('recogida', 'entrega_vendedor');
create type public.tipo_proveedor as enum ('manual', 'falso', 'nwc', 'blink');
create type public.estado_cobro as enum ('pendiente', 'pagado', 'expirado');
create type public.estado_disputa as enum ('abierta', 'resuelta');
create type public.resultado_disputa as enum ('reembolso_total', 'reembolso_parcial', 'sin_reembolso');

-- One row per auth user, created by the trigger at the end of this file.
create table public.usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  telefono text not null unique,
  nombre text not null default '' check (char_length(nombre) <= 80),
  es_admin boolean not null default false,
  creado_en timestamptz not null default now()
);

-- One business per account.
create table public.negocios (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null unique references public.usuarios (id) on delete cascade,
  nombre text not null check (char_length(nombre) between 2 and 80),
  descripcion text not null default '' check (char_length(descripcion) <= 600),
  ubicacion text not null default '' check (char_length(ubicacion) <= 160),
  estado public.estado_negocio not null default 'pendiente',
  abierto boolean not null default true,
  tipo_proveedor_pago public.tipo_proveedor not null default 'manual',
  lightning_address text check (lightning_address is null or lightning_address ~ '^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$'),
  -- For the nwc and blink adapters (not in the first cut). Never sent to the browser.
  credencial_pago_cifrada text,
  creado_en timestamptz not null default now()
);

create table public.categorias (
  id smallint primary key generated always as identity,
  nombre text not null unique,
  orden smallint not null default 0
);

create table public.productos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  categoria_id smallint not null references public.categorias (id),
  nombre text not null check (char_length(nombre) between 2 and 80),
  descripcion text not null default '' check (char_length(descripcion) <= 600),
  -- What one unit of stock is: "libra", "docena", "unidad", "botella de 750 ml".
  unidad text not null check (char_length(unidad) between 1 and 40),
  precio_usd_centavos integer not null check (precio_usd_centavos > 0),
  stock integer not null default 0 check (stock >= 0),
  activo boolean not null default true,
  -- Public URLs in the `productos` storage bucket.
  fotos text[] not null default '{}',
  creado_en timestamptz not null default now()
);
create index productos_negocio on public.productos (negocio_id);
create index productos_categoria on public.productos (categoria_id);

create table public.ordenes (
  id uuid primary key default gen_random_uuid(),
  -- Short number people can say out loud: "orden 1042".
  numero bigint generated always as identity (start with 1001) unique,
  comprador_id uuid not null references public.usuarios (id),
  negocio_id uuid not null references public.negocios (id),
  estado public.estado_orden not null default 'creada',
  total_usd_centavos integer not null check (total_usd_centavos > 0),
  total_sats bigint not null check (total_sats > 0),
  -- USD per BTC used for the conversion.
  cotizacion_usd_btc numeric(14, 2) not null check (cotizacion_usd_btc > 0),
  modo_entrega public.modo_entrega not null,
  -- Six digits. The buyer shows it to the seller at hand-over. Set when the order is paid.
  codigo_entrega text,
  comision_teorica_sats bigint not null default 0,
  clave_idempotencia text not null,
  creada_en timestamptz not null default now(),
  pagada_en timestamptz,
  lista_en timestamptz,
  entregada_en timestamptz,
  cerrada_en timestamptz,
  expirada_en timestamptz,
  disputada_en timestamptz,
  resuelta_en timestamptz,
  unique (comprador_id, clave_idempotencia)
);
create index ordenes_comprador on public.ordenes (comprador_id, creada_en desc);
create index ordenes_negocio on public.ordenes (negocio_id, creada_en desc);
create index ordenes_estado on public.ordenes (estado);

create table public.lineas_orden (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references public.ordenes (id) on delete cascade,
  producto_id uuid not null references public.productos (id),
  -- Copied when the order is created, so later edits to the product do not rewrite history.
  nombre text not null,
  unidad text not null,
  cantidad integer not null check (cantidad > 0),
  precio_usd_centavos integer not null check (precio_usd_centavos > 0)
);
create index lineas_orden_orden on public.lineas_orden (orden_id);

-- The payment request for an order. One per order.
create table public.cobros (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null unique references public.ordenes (id) on delete cascade,
  proveedor public.tipo_proveedor not null,
  referencia_externa text,
  -- Lightning invoice for the exact amount, when the seller's wallet gave one.
  bolt11 text,
  -- Where to pay when there is no invoice: the seller's Lightning Address.
  destino text,
  -- LUD-21 URL that tells whether the invoice was paid. Server only.
  verificar_url text,
  estado public.estado_cobro not null default 'pendiente',
  expira_en timestamptz not null,
  pagado_en timestamptz
);

create table public.mensajes (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references public.ordenes (id) on delete cascade,
  autor_id uuid not null references public.usuarios (id),
  texto text not null check (char_length(texto) between 1 and 1000),
  creado_en timestamptz not null default now()
);
create index mensajes_orden on public.mensajes (orden_id, creado_en);

create table public.resenas (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null unique references public.ordenes (id) on delete cascade,
  negocio_id uuid not null references public.negocios (id),
  puntuacion smallint not null check (puntuacion between 1 and 5),
  comentario text not null default '' check (char_length(comentario) <= 600),
  creada_en timestamptz not null default now()
);
create index resenas_negocio on public.resenas (negocio_id);

create table public.disputas (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null unique references public.ordenes (id) on delete cascade,
  motivo text not null check (char_length(motivo) between 5 and 1000),
  evidencia text not null default '' check (char_length(evidencia) <= 2000),
  estado public.estado_disputa not null default 'abierta',
  resultado public.resultado_disputa,
  nota_resolucion text not null default '',
  resuelta_por uuid references public.usuarios (id),
  creada_en timestamptz not null default now(),
  resuelta_en timestamptz,
  -- The app holds no money: the seller refunds outside it and marks it; the buyer confirms.
  reembolso_marcado_en timestamptz,
  reembolso_confirmado_en timestamptz
);

-- In-app notices: order changes and new messages.
create table public.avisos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  tipo text not null,
  orden_id uuid references public.ordenes (id) on delete cascade,
  texto text not null,
  leido boolean not null default false,
  creado_en timestamptz not null default now()
);
create index avisos_usuario on public.avisos (usuario_id, leido, creado_en desc);

create table public.auditoria (
  id bigint primary key generated always as identity,
  actor_id uuid references public.usuarios (id),
  accion text not null,
  entidad text not null,
  entidad_id text not null,
  detalle jsonb not null default '{}',
  creado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Helpers used by the policies. SECURITY DEFINER so a policy can look at tables the caller cannot.

create function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select es_admin from public.usuarios where id = auth.uid()), false);
$$;

create function public.mi_negocio_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.negocios where usuario_id = auth.uid();
$$;

-- Buyer of the order, owner of the business that sells it, or an administrator.
create function public.puede_ver_orden(p_orden_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.ordenes o
    where o.id = p_orden_id
      and (o.comprador_id = auth.uid() or o.negocio_id = public.mi_negocio_id() or public.es_admin())
  );
$$;

-- ---------------------------------------------------------------------------------------------
-- Row-level security: reads only.

alter table public.usuarios enable row level security;
alter table public.negocios enable row level security;
alter table public.categorias enable row level security;
alter table public.productos enable row level security;
alter table public.ordenes enable row level security;
alter table public.lineas_orden enable row level security;
alter table public.cobros enable row level security;
alter table public.mensajes enable row level security;
alter table public.resenas enable row level security;
alter table public.disputas enable row level security;
alter table public.avisos enable row level security;
alter table public.auditoria enable row level security;

-- Yourself, the people on the other side of your orders (to show their name), and admins see all.
create policy usuarios_leer on public.usuarios for select to authenticated
  using (
    id = auth.uid()
    or public.es_admin()
    or exists (
      select 1 from public.ordenes o join public.negocios n on n.id = o.negocio_id
      where (o.comprador_id = usuarios.id and n.usuario_id = auth.uid())
         or (n.usuario_id = usuarios.id and o.comprador_id = auth.uid())
    )
  );

-- The approved catalogue is public. Owners see their own business in any state; admins see all.
create policy negocios_leer on public.negocios for select to anon, authenticated
  using (estado = 'aprobado' or usuario_id = auth.uid() or public.es_admin());

create policy categorias_leer on public.categorias for select to anon, authenticated using (true);

create policy productos_leer on public.productos for select to anon, authenticated
  using (
    (activo and exists (select 1 from public.negocios n where n.id = negocio_id and n.estado = 'aprobado'))
    or negocio_id = public.mi_negocio_id()
    or public.es_admin()
  );

create policy ordenes_leer on public.ordenes for select to authenticated
  using (comprador_id = auth.uid() or negocio_id = public.mi_negocio_id() or public.es_admin());

create policy lineas_leer on public.lineas_orden for select to authenticated
  using (public.puede_ver_orden(orden_id));

create policy cobros_leer on public.cobros for select to authenticated
  using (public.puede_ver_orden(orden_id));

create policy mensajes_leer on public.mensajes for select to authenticated
  using (public.puede_ver_orden(orden_id));

create policy resenas_leer on public.resenas for select to anon, authenticated using (true);

create policy disputas_leer on public.disputas for select to authenticated
  using (public.puede_ver_orden(orden_id));

create policy avisos_leer on public.avisos for select to authenticated
  using (usuario_id = auth.uid());

create policy auditoria_leer on public.auditoria for select to authenticated
  using (public.es_admin());

-- Table privileges. Nothing is granted by default, so reads are granted here (row-level security
-- still filters the rows) and the service role, used only by the server, gets everything.
grant usage on schema public to anon, authenticated, service_role;
grant select on public.categorias, public.productos, public.resenas to anon, authenticated;
grant select on public.lineas_orden, public.mensajes, public.disputas, public.avisos,
  public.auditoria to authenticated;
-- Orders: every column except `codigo_entrega`. The seller can read their orders, and the delivery
-- code is what proves the buyer received them, so only the server hands it out, and only to the buyer.
grant select (id, numero, comprador_id, negocio_id, estado, total_usd_centavos, total_sats,
  cotizacion_usd_btc, modo_entrega, comision_teorica_sats, creada_en, pagada_en, lista_en, entregada_en,
  cerrada_en, expirada_en, disputada_en, resuelta_en) on public.ordenes to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

-- Columns that must never reach a browser, even for the owner. A table-level grant covers every
-- column, so the grant is taken away and given back column by column. Because of this, browser and
-- user-session queries on these three tables must name their columns: `select *` is refused.
revoke select on public.negocios from anon, authenticated;
grant select (id, usuario_id, nombre, descripcion, ubicacion, estado, abierto, tipo_proveedor_pago,
  lightning_address, creado_en) on public.negocios to anon, authenticated;

revoke select on public.cobros from anon, authenticated;
grant select (id, orden_id, proveedor, bolt11, destino, estado, expira_en, pagado_en)
  on public.cobros to authenticated;

-- Phones are private. A session already knows its own phone; nobody else needs it.
revoke select on public.usuarios from anon, authenticated;
grant select (id, nombre, es_admin, creado_en) on public.usuarios to authenticated;

-- ---------------------------------------------------------------------------------------------
-- A profile row for every new auth user.

create function public.crear_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.usuarios (id, telefono)
  values (new.id, coalesce(new.phone, new.email, new.id::text))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger al_crear_usuario after insert on auth.users
  for each row execute function public.crear_usuario();

-- ---------------------------------------------------------------------------------------------
-- Product photos: public to read, written only by the server.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('productos', 'productos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Live updates for the order screen and the chat.
alter publication supabase_realtime add table public.ordenes, public.mensajes, public.avisos, public.cobros;
