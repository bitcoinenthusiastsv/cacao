-- CacaoMarket, services and the requests board: tables, row-level security, grants and functions.
--
-- Same rules as the previous migrations: the browser only reads, every write is a function called by the
-- server with the service role, and every grant is explicit. Product orders keep their behaviour; the
-- functions that a job also uses (_transicion_orden, confirmar_pago, expirar_ordenes, abrir_disputa,
-- resolver_disputa, enviar_mensaje, _texto_aviso) branch on ordenes.tipo and keep the product path as it was.

-- ---------------------------------------------------------------------------------------------
-- Tables

create table public.categorias_servicio (
  id smallint primary key generated always as identity,
  nombre text not null unique,
  orden smallint not null default 0
);

-- A service a shop offers: fixed price per unit, or quoted case by case.
create table public.servicios (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  categoria_id smallint not null references public.categorias_servicio (id),
  titulo text not null check (char_length(titulo) between 2 and 80),
  descripcion text not null default '' check (char_length(descripcion) <= 600),
  zona text not null default '' check (char_length(zona) <= 160),
  tipo_precio public.tipo_precio not null,
  -- Price and unit only for fixed services: "$5.00 por corte".
  precio_usd_centavos integer check (precio_usd_centavos > 0),
  unidad text check (char_length(unidad) between 1 and 40),
  activo boolean not null default true,
  -- Hidden by an administrator; the shop cannot unhide it.
  oculto boolean not null default false,
  fotos text[] not null default '{}',
  creado_en timestamptz not null default now(),
  check ((tipo_precio = 'fijo' and precio_usd_centavos is not null and unidad is not null)
      or (tipo_precio = 'cotizar' and precio_usd_centavos is null and unidad is null))
);
create index servicios_negocio on public.servicios (negocio_id);
create index servicios_categoria on public.servicios (categoria_id);

-- What a person needs, posted on the board. Anyone with an account can post one.
create table public.necesidades (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios (id),
  categoria_id smallint not null references public.categorias_servicio (id),
  titulo text not null check (char_length(titulo) between 4 and 100),
  descripcion text not null default '' check (char_length(descripcion) <= 1000),
  zona text not null default '' check (char_length(zona) <= 160),
  presupuesto_usd_centavos integer check (presupuesto_usd_centavos is null or presupuesto_usd_centavos > 0),
  estado public.estado_necesidad not null default 'abierta',
  oculta boolean not null default false,
  creada_en timestamptz not null default now(),
  vence_en timestamptz not null default now() + interval '14 days'
);
create index necesidades_abiertas on public.necesidades (estado, creada_en desc);

-- A quote. Born either from a service (the client asks for a price) or from a need (a shop makes an
-- offer). Exactly one of the two. One per shop and need, so an offer can be reused after a withdrawal.
create table public.cotizaciones (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id),
  cliente_id uuid not null references public.usuarios (id),
  servicio_id uuid references public.servicios (id),
  necesidad_id uuid references public.necesidades (id),
  check ((servicio_id is null) <> (necesidad_id is null)),
  descripcion_cliente text not null default '' check (char_length(descripcion_cliente) <= 1000),
  precio_usd_centavos integer check (precio_usd_centavos is null or precio_usd_centavos > 0),
  mensaje text not null default '' check (char_length(mensaje) <= 600),
  estado public.estado_cotizacion not null default 'solicitada',
  orden_id uuid references public.ordenes (id),
  creada_en timestamptz not null default now(),
  respondida_en timestamptz,
  check (estado not in ('ofrecida', 'aceptada') or precio_usd_centavos is not null),
  check (estado <> 'aceptada' or orden_id is not null),
  unique (necesidad_id, negocio_id)
);
create index cotizaciones_cliente on public.cotizaciones (cliente_id, creada_en desc);
create index cotizaciones_negocio on public.cotizaciones (negocio_id, creada_en desc);
create index cotizaciones_orden on public.cotizaciones (orden_id);

-- Orders become jobs too: a job has no delivery mode and no delivery code.
alter table public.ordenes
  add column tipo public.tipo_orden not null default 'productos',
  add column hecha_en timestamptz,
  add column cancelada_en timestamptz,
  add column motivo_cancelacion text,
  alter column modo_entrega drop not null,
  add constraint ordenes_modo_entrega_de_productos check (tipo = 'servicio' or modo_entrega is not null),
  add constraint ordenes_sin_codigo_de_servicio check (tipo = 'productos' or codigo_entrega is null);

-- A line is a product, a service, or (for a job made from a need) neither: that job's need is found
-- through cotizaciones.orden_id. The line keeps the name and price either way.
alter table public.lineas_orden
  alter column producto_id drop not null,
  add column servicio_id uuid references public.servicios (id),
  add constraint lineas_orden_como_mucho_uno check (producto_id is null or servicio_id is null);

-- Notices that are not about an order (a new quote, a new offer) link to a page instead.
alter table public.avisos add column ruta text check (ruta is null or char_length(ruta) <= 300);

-- ---------------------------------------------------------------------------------------------
-- Row-level security: reads only, as in the first migration.

alter table public.categorias_servicio enable row level security;
alter table public.servicios enable row level security;
alter table public.necesidades enable row level security;
alter table public.cotizaciones enable row level security;

create policy categorias_servicio_leer on public.categorias_servicio for select to anon, authenticated
  using (true);

-- Same visibility as products: active, not hidden by an admin, shop approved. The owner and admins see all.
create policy servicios_leer on public.servicios for select to anon, authenticated
  using (
    (activo and not oculto and exists (select 1 from public.negocios n where n.id = negocio_id and n.estado = 'aprobado'))
    or negocio_id = public.mi_negocio_id()
    or public.es_admin()
  );

create policy necesidades_leer on public.necesidades for select to anon, authenticated
  using ((estado = 'abierta' and not oculta) or usuario_id = auth.uid() or public.es_admin());

-- Quotes are private: the client, the shop that made them, and admins.
create policy cotizaciones_leer on public.cotizaciones for select to authenticated
  using (cliente_id = auth.uid() or negocio_id = public.mi_negocio_id() or public.es_admin());

-- ---------------------------------------------------------------------------------------------
-- Grants. Nothing is granted by default on a hosted project (see 20261012000003_privilegios.sql), so
-- every read is named here. Sessions get no insert, update or delete on anything.
-- avisos.ruta needs no grant: the table-level select on avisos already covers new columns.

grant select on public.categorias_servicio, public.servicios, public.necesidades to anon, authenticated;
grant select on public.cotizaciones to authenticated;

-- Session columns on the new order fields. Never codigo_entrega.
grant select (tipo, hecha_en, cancelada_en, motivo_cancelacion) on public.ordenes to authenticated;

grant all on public.categorias_servicio, public.servicios, public.necesidades, public.cotizaciones to service_role;

-- ---------------------------------------------------------------------------------------------
-- Private helpers

-- "$3.50" for a notice text. Written out, so no locale can change the format.
create function public._usd_texto(p_centavos integer) returns text
language plpgsql immutable security definer set search_path = public as $$
begin
  return '$' || (p_centavos / 100)::text || '.' || lpad((p_centavos % 100)::text, 2, '0');
end;
$$;

-- Notice text for the buyer ('comprador') or the shop owner ('vendedor') of an order.
-- Replaces the one in 20261012000002_funciones.sql with the same signature: adds the states of a job.
create or replace function public._texto_aviso(p_estado public.estado_orden, p_numero bigint, p_para text) returns text
language plpgsql immutable security definer set search_path = public as $$
declare
  n text := p_numero::text;
begin
  if p_para = 'comprador' then
    return case p_estado
      when 'esperando_pago' then 'Tu orden ' || n || ' espera el pago por Lightning.'
      when 'pagada' then 'Recibimos el pago de tu orden ' || n || '.'
      when 'lista' then 'Tu orden ' || n || ' está lista.'
      when 'entregada' then 'Tu orden ' || n || ' fue entregada. Dejá tu reseña cuando quieras.'
      when 'cerrada' then 'La orden ' || n || ' quedó cerrada. Gracias por tu compra.'
      when 'expirada' then 'La orden ' || n || ' expiró sin pago. Los productos volvieron al stock.'
      when 'disputada' then 'Tu disputa de la orden ' || n || ' quedó abierta.'
      when 'resuelta' then 'El administrador resolvió la disputa de la orden ' || n || '. Revisá el resultado.'
      when 'acordada' then 'Acordaste el trabajo de la orden ' || n || '. Coordiná hora y lugar por el chat.'
      when 'hecha' then 'El trabajo de la orden ' || n || ' está hecho. Ya podés pagar.'
      when 'cancelada' then 'La orden ' || n || ' se canceló. Revisá el motivo en la orden.'
      else 'La orden ' || n || ' cambió de estado.'
    end;
  end if;
  return case p_estado
    when 'pagada' then 'La orden ' || n || ' está pagada. Preparala.'
    when 'lista' then 'La orden ' || n || ' quedó lista para entregar.'
    when 'entregada' then 'El comprador confirmó la entrega de la orden ' || n || '.'
    when 'cerrada' then 'El comprador dejó su reseña. La orden ' || n || ' quedó cerrada.'
    when 'expirada' then 'La orden ' || n || ' expiró sin pago.'
    when 'disputada' then 'El comprador abrió una disputa en la orden ' || n || '. Revisala.'
    when 'resuelta' then 'El administrador resolvió la disputa de la orden ' || n || '. Revisá el resultado.'
    when 'acordada' then 'Tenés un trabajo acordado en la orden ' || n || '. Cobrás al terminar. Coordiná bien antes de ir.'
    when 'hecha' then 'La orden ' || n || ' volvió a estar hecha. Esperá el pago del cliente.'
    when 'cancelada' then 'La orden ' || n || ' se canceló. Revisá el motivo en la orden.'
    else 'La orden ' || n || ' cambió de estado.'
  end;
end;
$$;

-- Jobs read differently when they are paid: the work is paid and finished in one step.
-- Anything else falls back to _texto_aviso, so product orders get the same text as before.
create function public._texto_aviso_servicio(p_tipo public.tipo_orden, p_estado public.estado_orden,
  p_numero bigint, p_para text) returns text
language plpgsql immutable security definer set search_path = public as $$
declare
  n text := p_numero::text;
begin
  if p_tipo = 'servicio' and p_estado = 'pagada' then
    if p_para = 'comprador' then
      return 'Recibimos el pago del trabajo de la orden ' || n || '. Dejá tu reseña cuando quieras.';
    end if;
    return 'Cobraste el trabajo de la orden ' || n || '. Ya quedó terminado.';
  end if;
  return public._texto_aviso(p_estado, p_numero, p_para);
end;
$$;

-- The only way an order changes state. Locks the order, checks the current state, sets the new state
-- and its timestamp, writes one audit row and one notice for the other party.
-- p_actor null means the system. p_ambas_partes notifies both sides (used for resolutions).
-- Replaces the one in 20261012000002_funciones.sql with the same signature: sets hecha_en and cancelada_en.
create or replace function public._transicion_orden(
  p_orden uuid,
  p_actor uuid,
  p_desde public.estado_orden[],
  p_hacia public.estado_orden,
  p_ambas_partes boolean default false
) returns public.ordenes
language plpgsql security definer set search_path = public as $$
declare
  v_antes public.ordenes;
  v_despues public.ordenes;
  v_vendedor uuid;
begin
  select * into v_antes from public.ordenes where id = p_orden for update;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa orden.' using errcode = 'P0001';
  end if;
  if not (v_antes.estado = any (p_desde)) then
    raise exception '%', 'ESTADO_INVALIDO: La orden no está en un estado que permita esta acción.' using errcode = 'P0001';
  end if;

  update public.ordenes set
    estado = p_hacia,
    pagada_en = case when p_hacia = 'pagada' then now() else pagada_en end,
    lista_en = case when p_hacia = 'lista' then now() else lista_en end,
    entregada_en = case when p_hacia = 'entregada' then now() else entregada_en end,
    cerrada_en = case when p_hacia = 'cerrada' then now() else cerrada_en end,
    expirada_en = case when p_hacia = 'expirada' then now() else expirada_en end,
    disputada_en = case when p_hacia = 'disputada' then now() else disputada_en end,
    resuelta_en = case when p_hacia = 'resuelta' then now() else resuelta_en end,
    hecha_en = case when p_hacia = 'hecha' then now() else hecha_en end,
    cancelada_en = case when p_hacia = 'cancelada' then now() else cancelada_en end
  where id = p_orden
  returning * into v_despues;

  select n.usuario_id into v_vendedor from public.negocios n where n.id = v_antes.negocio_id;

  insert into public.auditoria (actor_id, accion, entidad, entidad_id, detalle)
  values (p_actor, 'orden.' || p_hacia, 'orden', p_orden::text,
          jsonb_build_object('desde', v_antes.estado, 'hacia', p_hacia));

  -- The buyer hears about it when someone else acts; the shop owner hears when the buyer acts.
  if p_ambas_partes or p_actor is distinct from v_antes.comprador_id then
    insert into public.avisos (usuario_id, tipo, orden_id, texto)
    values (v_antes.comprador_id, 'orden.' || p_hacia, p_orden,
            public._texto_aviso_servicio(v_antes.tipo, p_hacia, v_antes.numero, 'comprador'));
  end if;
  if p_ambas_partes or p_actor = v_antes.comprador_id then
    insert into public.avisos (usuario_id, tipo, orden_id, texto)
    values (v_vendedor, 'orden.' || p_hacia, p_orden,
            public._texto_aviso_servicio(v_antes.tipo, p_hacia, v_antes.numero, 'vendedor'));
  end if;

  return v_despues;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Services

create function public.guardar_servicio(
  p_usuario uuid,
  p_servicio uuid,
  p_categoria integer,
  p_titulo text,
  p_descripcion text,
  p_zona text,
  p_tipo_precio public.tipo_precio,
  p_precio integer,
  p_unidad text,
  p_activo boolean,
  p_fotos text[]
) returns public.servicios
language plpgsql security definer set search_path = public as $$
declare
  v_negocio public.negocios;
  v_servicio public.servicios;
  v_titulo text;
  v_descripcion text;
  v_zona text;
  v_precio integer := null;
  v_unidad text := null;
  v_fotos text[] := coalesce(p_fotos, '{}');
begin
  select * into v_negocio from public.negocios where usuario_id = p_usuario;
  if not found then
    raise exception '%', 'NO_PERMITIDO: Primero tenés que registrar tu negocio.' using errcode = 'P0001';
  end if;
  if v_negocio.estado <> 'aprobado' then
    raise exception '%', 'NO_PERMITIDO: Solo los negocios aprobados publican servicios.' using errcode = 'P0001';
  end if;

  v_titulo := public._texto_valido(p_titulo, 2, 80, 'El título tiene que tener entre 2 y 80 caracteres.');
  v_descripcion := public._texto_valido(p_descripcion, 0, 600, 'La descripción no puede pasar de 600 caracteres.');
  v_zona := public._texto_valido(p_zona, 0, 160, 'La zona no puede pasar de 160 caracteres.');

  if p_categoria is null or not exists (select 1 from public.categorias_servicio c where c.id = p_categoria) then
    raise exception '%', 'DATOS_INVALIDOS: Elegí una categoría válida.' using errcode = 'P0001';
  end if;
  if p_tipo_precio is null then
    raise exception '%', 'DATOS_INVALIDOS: Elegí si el servicio tiene precio fijo o se cotiza.' using errcode = 'P0001';
  end if;
  if p_activo is null then
    raise exception '%', 'DATOS_INVALIDOS: Indicá si el servicio está activo.' using errcode = 'P0001';
  end if;
  if cardinality(v_fotos) > 6 then
    raise exception '%', 'DATOS_INVALIDOS: Un servicio puede tener hasta 6 fotos.' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(v_fotos) f where char_length(f) > 500) then
    raise exception '%', 'DATOS_INVALIDOS: Una de las fotos tiene una dirección demasiado larga.' using errcode = 'P0001';
  end if;

  -- A quoted service stores no price and no unit: the price comes from each job.
  if p_tipo_precio = 'fijo' then
    if p_precio is null or p_precio <= 0 then
      raise exception '%', 'DATOS_INVALIDOS: El precio tiene que ser mayor que cero.' using errcode = 'P0001';
    end if;
    v_precio := p_precio;
    v_unidad := public._texto_valido(p_unidad, 1, 40, 'La unidad tiene que tener entre 1 y 40 caracteres.');
  end if;

  if p_servicio is null then
    insert into public.servicios (negocio_id, categoria_id, titulo, descripcion, zona, tipo_precio,
      precio_usd_centavos, unidad, activo, fotos)
    values (v_negocio.id, p_categoria::smallint, v_titulo, v_descripcion, v_zona, p_tipo_precio,
      v_precio, v_unidad, p_activo, v_fotos)
    returning * into v_servicio;
  else
    perform 1 from public.servicios where id = p_servicio and negocio_id = v_negocio.id for update;
    if not found then
      raise exception '%', 'NO_ENCONTRADA: No encontramos ese servicio en tu negocio.' using errcode = 'P0001';
    end if;
    update public.servicios set
      categoria_id = p_categoria::smallint,
      titulo = v_titulo,
      descripcion = v_descripcion,
      zona = v_zona,
      tipo_precio = p_tipo_precio,
      precio_usd_centavos = v_precio,
      unidad = v_unidad,
      activo = p_activo,
      fotos = v_fotos
    where id = p_servicio
    returning * into v_servicio;
  end if;

  return v_servicio;
end;
$$;

create function public.ocultar_servicio(p_servicio uuid, p_actor uuid, p_oculto boolean)
returns public.servicios
language plpgsql security definer set search_path = public as $$
declare
  v_servicio public.servicios;
begin
  perform public._exigir_admin(p_actor);
  if p_oculto is null then
    raise exception '%', 'DATOS_INVALIDOS: Indicá si el servicio se oculta.' using errcode = 'P0001';
  end if;

  perform 1 from public.servicios where id = p_servicio for update;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos ese servicio.' using errcode = 'P0001';
  end if;

  update public.servicios set oculto = p_oculto where id = p_servicio
  returning * into v_servicio;

  insert into public.auditoria (actor_id, accion, entidad, entidad_id, detalle)
  values (p_actor, case when p_oculto then 'servicio.ocultado' else 'servicio.mostrado' end,
          'servicio', p_servicio::text, '{}');

  return v_servicio;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Needs (the board)

create function public.publicar_necesidad(p_usuario uuid, p_categoria integer, p_titulo text,
  p_descripcion text, p_zona text, p_presupuesto integer)
returns public.necesidades
language plpgsql security definer set search_path = public as $$
declare
  v_necesidad public.necesidades;
  v_titulo text;
  v_descripcion text;
  v_zona text;
begin
  if not exists (select 1 from public.usuarios u where u.id = p_usuario) then
    raise exception '%', 'NO_ENCONTRADA: No encontramos tu cuenta.' using errcode = 'P0001';
  end if;

  v_titulo := public._texto_valido(p_titulo, 4, 100, 'El título tiene que tener entre 4 y 100 caracteres.');
  v_descripcion := public._texto_valido(p_descripcion, 0, 1000, 'La descripción no puede pasar de 1000 caracteres.');
  v_zona := public._texto_valido(p_zona, 0, 160, 'La zona no puede pasar de 160 caracteres.');

  if p_categoria is null or not exists (select 1 from public.categorias_servicio c where c.id = p_categoria) then
    raise exception '%', 'DATOS_INVALIDOS: Elegí una categoría válida.' using errcode = 'P0001';
  end if;
  if p_presupuesto is not null and p_presupuesto <= 0 then
    raise exception '%', 'DATOS_INVALIDOS: El presupuesto tiene que ser mayor que cero.' using errcode = 'P0001';
  end if;

  insert into public.necesidades (usuario_id, categoria_id, titulo, descripcion, zona, presupuesto_usd_centavos)
  values (p_usuario, p_categoria::smallint, v_titulo, v_descripcion, v_zona, p_presupuesto)
  returning * into v_necesidad;

  insert into public.auditoria (actor_id, accion, entidad, entidad_id, detalle)
  values (p_usuario, 'necesidad.publicada', 'necesidad', v_necesidad.id::text, '{}');

  return v_necesidad;
end;
$$;

create function public.cancelar_necesidad(p_necesidad uuid, p_usuario uuid) returns public.necesidades
language plpgsql security definer set search_path = public as $$
declare
  v_necesidad public.necesidades;
begin
  select * into v_necesidad from public.necesidades where id = p_necesidad for update;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa necesidad.' using errcode = 'P0001';
  end if;
  if v_necesidad.usuario_id is distinct from p_usuario then
    raise exception '%', 'NO_PERMITIDO: Solo quien publicó la necesidad puede cancelarla.' using errcode = 'P0001';
  end if;
  if v_necesidad.estado <> 'abierta' then
    raise exception '%', 'ESTADO_INVALIDO: La necesidad ya no está abierta.' using errcode = 'P0001';
  end if;

  update public.necesidades set estado = 'cancelada' where id = p_necesidad
  returning * into v_necesidad;

  -- Offers still waiting are closed; the shops that made them are not told (not in the first cut).
  update public.cotizaciones set estado = 'rechazada', respondida_en = now()
  where necesidad_id = p_necesidad and estado in ('solicitada', 'ofrecida');

  insert into public.auditoria (actor_id, accion, entidad, entidad_id, detalle)
  values (p_usuario, 'necesidad.cancelada', 'necesidad', p_necesidad::text, '{}');

  return v_necesidad;
end;
$$;

create function public.ocultar_necesidad(p_necesidad uuid, p_actor uuid, p_oculta boolean)
returns public.necesidades
language plpgsql security definer set search_path = public as $$
declare
  v_necesidad public.necesidades;
begin
  perform public._exigir_admin(p_actor);
  if p_oculta is null then
    raise exception '%', 'DATOS_INVALIDOS: Indicá si la necesidad se oculta.' using errcode = 'P0001';
  end if;

  perform 1 from public.necesidades where id = p_necesidad for update;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa necesidad.' using errcode = 'P0001';
  end if;

  update public.necesidades set oculta = p_oculta where id = p_necesidad
  returning * into v_necesidad;

  insert into public.auditoria (actor_id, accion, entidad, entidad_id, detalle)
  values (p_actor, case when p_oculta then 'necesidad.ocultada' else 'necesidad.mostrada' end,
          'necesidad', p_necesidad::text, '{}');

  return v_necesidad;
end;
$$;

-- Needs past their deadline close, and so do their open offers. Returns how many needs closed.
create function public.vencer_necesidades() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_total integer := 0;
begin
  for v_id in
    select n.id from public.necesidades n
    where n.estado = 'abierta' and n.vence_en < now()
    for update skip locked
  loop
    update public.necesidades set estado = 'vencida' where id = v_id;
    update public.cotizaciones set estado = 'vencida', respondida_en = now()
    where necesidad_id = v_id and estado in ('solicitada', 'ofrecida');

    insert into public.auditoria (actor_id, accion, entidad, entidad_id, detalle)
    values (null, 'necesidad.vencida', 'necesidad', v_id::text, '{}');
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Quotes

-- A client asks a shop for a price on a service marked "cotizar".
create function public.solicitar_cotizacion(p_cliente uuid, p_servicio uuid, p_descripcion text)
returns public.cotizaciones
language plpgsql security definer set search_path = public as $$
declare
  v_servicio public.servicios;
  v_negocio public.negocios;
  v_cotizacion public.cotizaciones;
  v_descripcion text;
begin
  v_descripcion := public._texto_valido(p_descripcion, 10, 1000,
    'La descripción del trabajo tiene que tener entre 10 y 1000 caracteres.');

  if not exists (select 1 from public.usuarios u where u.id = p_cliente) then
    raise exception '%', 'NO_ENCONTRADA: No encontramos tu cuenta.' using errcode = 'P0001';
  end if;

  select * into v_servicio from public.servicios where id = p_servicio;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos ese servicio.' using errcode = 'P0001';
  end if;
  select * into v_negocio from public.negocios where id = v_servicio.negocio_id;

  if v_negocio.usuario_id = p_cliente then
    raise exception '%', 'NO_PERMITIDO: No podés pedirle una cotización a tu propio negocio.' using errcode = 'P0001';
  end if;
  if not (v_servicio.activo and not v_servicio.oculto and v_negocio.estado = 'aprobado') then
    raise exception '%', 'NO_ENCONTRADA: No encontramos ese servicio.' using errcode = 'P0001';
  end if;
  if not v_negocio.abierto then
    raise exception '%', 'NEGOCIO_CERRADO: Este negocio no recibe pedidos por ahora.' using errcode = 'P0001';
  end if;
  if v_servicio.tipo_precio <> 'cotizar' then
    raise exception '%', 'ESTADO_INVALIDO: Este servicio tiene precio fijo. Contratalo directamente.' using errcode = 'P0001';
  end if;

  insert into public.cotizaciones (negocio_id, cliente_id, servicio_id, descripcion_cliente, estado)
  values (v_servicio.negocio_id, p_cliente, p_servicio, v_descripcion, 'solicitada')
  returning * into v_cotizacion;

  insert into public.avisos (usuario_id, tipo, orden_id, texto, ruta)
  values (v_negocio.usuario_id, 'cotizacion.solicitada', null,
          'Te pidieron cotizar el servicio "' || v_servicio.titulo || '". Respondé cuando puedas.',
          '/mi-negocio/cotizaciones');

  insert into public.auditoria (actor_id, accion, entidad, entidad_id, detalle)
  values (p_cliente, 'cotizacion.solicitada', 'cotizacion', v_cotizacion.id::text, '{}');

  return v_cotizacion;
end;
$$;

-- The shop answers a request with a price and a message.
create function public.responder_cotizacion(p_cotizacion uuid, p_actor uuid, p_precio integer, p_mensaje text)
returns public.cotizaciones
language plpgsql security definer set search_path = public as $$
declare
  v_cotizacion public.cotizaciones;
  v_negocio public.negocios;
  v_mensaje text;
begin
  v_mensaje := public._texto_valido(p_mensaje, 0, 600, 'El mensaje no puede pasar de 600 caracteres.');

  select * into v_cotizacion from public.cotizaciones where id = p_cotizacion for update;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa cotización.' using errcode = 'P0001';
  end if;
  select * into v_negocio from public.negocios where id = v_cotizacion.negocio_id;
  if v_negocio.usuario_id is distinct from p_actor then
    if p_actor = v_cotizacion.cliente_id then
      raise exception '%', 'NO_PERMITIDO: Solo el negocio puede responder la cotización.' using errcode = 'P0001';
    end if;
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa cotización.' using errcode = 'P0001';
  end if;

  if v_cotizacion.estado <> 'solicitada' then
    raise exception '%', 'ESTADO_INVALIDO: Esa cotización ya no espera respuesta.' using errcode = 'P0001';
  end if;
  if p_precio is null or p_precio <= 0 then
    raise exception '%', 'DATOS_INVALIDOS: El precio tiene que ser mayor que cero.' using errcode = 'P0001';
  end if;

  update public.cotizaciones set estado = 'ofrecida', precio_usd_centavos = p_precio,
    mensaje = v_mensaje, respondida_en = now()
  where id = p_cotizacion
  returning * into v_cotizacion;

  insert into public.avisos (usuario_id, tipo, orden_id, texto, ruta)
  values (v_cotizacion.cliente_id, 'cotizacion.ofrecida', null,
          'Te respondieron la cotización: ' || public._usd_texto(p_precio) || '. Revisala para aceptarla o rechazarla.',
          '/cotizaciones');

  insert into public.auditoria (actor_id, accion, entidad, entidad_id, detalle)
  values (p_actor, 'cotizacion.ofrecida', 'cotizacion', p_cotizacion::text, '{}');

  return v_cotizacion;
end;
$$;

-- A shop offers a price on a need. One per shop and need; a withdrawn offer is reused.
create function public.ofertar(p_usuario uuid, p_necesidad uuid, p_precio integer, p_mensaje text)
returns public.cotizaciones
language plpgsql security definer set search_path = public as $$
declare
  v_negocio public.negocios;
  v_necesidad public.necesidades;
  v_cotizacion public.cotizaciones;
  v_mensaje text;
begin
  v_mensaje := public._texto_valido(p_mensaje, 0, 600, 'El mensaje no puede pasar de 600 caracteres.');

  select * into v_negocio from public.negocios where usuario_id = p_usuario;
  if not found or v_negocio.estado <> 'aprobado' then
    raise exception '%', 'NO_PERMITIDO: Solo los negocios aprobados pueden ofertar.' using errcode = 'P0001';
  end if;
  if p_precio is null or p_precio <= 0 then
    raise exception '%', 'DATOS_INVALIDOS: El precio tiene que ser mayor que cero.' using errcode = 'P0001';
  end if;

  -- Locked first, like aceptar_cotizacion, so offers and accepts of one need line up.
  select * into v_necesidad from public.necesidades where id = p_necesidad for update;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa necesidad.' using errcode = 'P0001';
  end if;
  if v_necesidad.usuario_id = p_usuario then
    raise exception '%', 'NO_PERMITIDO: No podés ofertar en tu propia necesidad.' using errcode = 'P0001';
  end if;
  if v_necesidad.oculta then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa necesidad.' using errcode = 'P0001';
  end if;
  if v_necesidad.estado <> 'abierta' then
    raise exception '%', 'ESTADO_INVALIDO: Esa necesidad ya no recibe ofertas.' using errcode = 'P0001';
  end if;
  if v_necesidad.vence_en <= now() then
    raise exception '%', 'ESTADO_INVALIDO: Esa necesidad ya venció.' using errcode = 'P0001';
  end if;

  select * into v_cotizacion from public.cotizaciones
  where necesidad_id = p_necesidad and negocio_id = v_negocio.id for update;

  if found then
    if v_cotizacion.estado = 'ofrecida' then
      raise exception '%', 'ESTADO_INVALIDO: Ya ofertaste en esta necesidad. Podés retirar tu oferta para cambiarla.' using errcode = 'P0001';
    end if;
    if v_cotizacion.estado <> 'retirada' then
      raise exception '%', 'ESTADO_INVALIDO: Ya no podés ofertar en esta necesidad.' using errcode = 'P0001';
    end if;
    update public.cotizaciones set estado = 'ofrecida', precio_usd_centavos = p_precio,
      mensaje = v_mensaje, respondida_en = now()
    where id = v_cotizacion.id
    returning * into v_cotizacion;
  else
    insert into public.cotizaciones (negocio_id, cliente_id, necesidad_id, descripcion_cliente,
      precio_usd_centavos, mensaje, estado, respondida_en)
    values (v_negocio.id, v_necesidad.usuario_id, p_necesidad, '', p_precio, v_mensaje, 'ofrecida', now())
    returning * into v_cotizacion;
  end if;

  insert into public.avisos (usuario_id, tipo, orden_id, texto, ruta)
  values (v_necesidad.usuario_id, 'oferta.nueva', null,
          'Recibiste una oferta de ' || v_negocio.nombre || ' para "' || v_necesidad.titulo || '": '
            || public._usd_texto(p_precio) || '.',
          '/necesito/' || p_necesidad::text);

  insert into public.auditoria (actor_id, accion, entidad, entidad_id, detalle)
  values (p_usuario, 'oferta.ofrecida', 'cotizacion', v_cotizacion.id::text, '{}');

  return v_cotizacion;
end;
$$;

-- The shop takes its offer back, while nobody has accepted it.
create function public.retirar_cotizacion(p_cotizacion uuid, p_actor uuid) returns public.cotizaciones
language plpgsql security definer set search_path = public as $$
declare
  v_cotizacion public.cotizaciones;
  v_negocio public.negocios;
begin
  select * into v_cotizacion from public.cotizaciones where id = p_cotizacion for update;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa cotización.' using errcode = 'P0001';
  end if;
  select * into v_negocio from public.negocios where id = v_cotizacion.negocio_id;
  if v_negocio.usuario_id is distinct from p_actor then
    if p_actor = v_cotizacion.cliente_id then
      raise exception '%', 'NO_PERMITIDO: Solo el negocio puede retirar la cotización.' using errcode = 'P0001';
    end if;
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa cotización.' using errcode = 'P0001';
  end if;
  if v_cotizacion.estado not in ('solicitada', 'ofrecida') then
    raise exception '%', 'ESTADO_INVALIDO: Esa cotización ya no se puede retirar.' using errcode = 'P0001';
  end if;

  update public.cotizaciones set estado = 'retirada' where id = p_cotizacion
  returning * into v_cotizacion;

  insert into public.auditoria (actor_id, accion, entidad, entidad_id, detalle)
  values (p_actor, 'cotizacion.retirada', 'cotizacion', p_cotizacion::text, '{}');

  return v_cotizacion;
end;
$$;

-- The client turns a quote down. The shop hears about it.
create function public.rechazar_cotizacion(p_cotizacion uuid, p_actor uuid) returns public.cotizaciones
language plpgsql security definer set search_path = public as $$
declare
  v_cotizacion public.cotizaciones;
  v_negocio public.negocios;
begin
  select * into v_cotizacion from public.cotizaciones where id = p_cotizacion for update;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa cotización.' using errcode = 'P0001';
  end if;
  if v_cotizacion.cliente_id is distinct from p_actor then
    select * into v_negocio from public.negocios where id = v_cotizacion.negocio_id;
    if v_negocio.usuario_id = p_actor then
      raise exception '%', 'NO_PERMITIDO: Solo el cliente puede rechazar la cotización.' using errcode = 'P0001';
    end if;
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa cotización.' using errcode = 'P0001';
  end if;
  if v_cotizacion.estado not in ('solicitada', 'ofrecida') then
    raise exception '%', 'ESTADO_INVALIDO: Esa cotización ya no se puede rechazar.' using errcode = 'P0001';
  end if;

  update public.cotizaciones set estado = 'rechazada', respondida_en = now() where id = p_cotizacion
  returning * into v_cotizacion;

  select * into v_negocio from public.negocios where id = v_cotizacion.negocio_id;
  insert into public.avisos (usuario_id, tipo, orden_id, texto, ruta)
  values (v_negocio.usuario_id, 'cotizacion.rechazada', null,
          'El cliente rechazó tu cotización.', '/mi-negocio/cotizaciones');

  insert into public.auditoria (actor_id, accion, entidad, entidad_id, detalle)
  values (p_actor, 'cotizacion.rechazada', 'cotizacion', p_cotizacion::text, '{}');

  return v_cotizacion;
end;
$$;

-- The client accepts an offer or a quote: the job is born in state 'acordada'.
-- Lock order: the need first (when there is one), then the quote. ofertar uses the same order. With the
-- quote locked first, two accepts of two offers of one need would each wait on the other's offer row.
create function public.aceptar_cotizacion(p_cotizacion uuid, p_actor uuid, p_cotizacion_btc numeric)
returns public.ordenes
language plpgsql security definer set search_path = public as $$
declare
  v_cotizacion public.cotizaciones;
  v_necesidad public.necesidades;
  v_necesidad_id uuid;
  v_negocio public.negocios;
  v_servicio public.servicios;
  v_orden public.ordenes;
  v_titulo text;
  v_centavos integer;
  v_sats bigint;
begin
  if p_cotizacion_btc is null or round(p_cotizacion_btc, 2) <= 0 then
    raise exception '%', 'DATOS_INVALIDOS: La cotización tiene que ser mayor que cero.' using errcode = 'P0001';
  end if;

  select c.necesidad_id into v_necesidad_id from public.cotizaciones c where c.id = p_cotizacion;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa cotización.' using errcode = 'P0001';
  end if;
  if v_necesidad_id is not null then
    select * into v_necesidad from public.necesidades where id = v_necesidad_id for update;
  end if;

  select * into v_cotizacion from public.cotizaciones where id = p_cotizacion for update;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa cotización.' using errcode = 'P0001';
  end if;
  if v_cotizacion.cliente_id is distinct from p_actor then
    if exists (select 1 from public.negocios n where n.id = v_cotizacion.negocio_id and n.usuario_id = p_actor) then
      raise exception '%', 'NO_PERMITIDO: Solo el cliente puede aceptar la cotización.' using errcode = 'P0001';
    end if;
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa cotización.' using errcode = 'P0001';
  end if;

  -- The same client accepting again gets the order the first accept made.
  if v_cotizacion.estado = 'aceptada' then
    select * into v_orden from public.ordenes where id = v_cotizacion.orden_id;
    return v_orden;
  end if;

  if v_necesidad_id is not null then
    if v_necesidad.estado = 'asignada' then
      raise exception '%', 'ESTADO_INVALIDO: Esa necesidad ya fue asignada.' using errcode = 'P0001';
    end if;
    if v_necesidad.estado <> 'abierta' or v_necesidad.oculta or v_necesidad.vence_en <= now() then
      raise exception '%', 'ESTADO_INVALIDO: Esa necesidad ya no está abierta.' using errcode = 'P0001';
    end if;
  end if;

  if v_cotizacion.estado <> 'ofrecida' then
    raise exception '%', 'ESTADO_INVALIDO: Esa cotización ya no está ofrecida.' using errcode = 'P0001';
  end if;

  select * into v_negocio from public.negocios where id = v_cotizacion.negocio_id;
  if v_negocio.estado <> 'aprobado' or not v_negocio.abierto then
    raise exception '%', 'NEGOCIO_CERRADO: Este negocio no recibe pedidos por ahora.' using errcode = 'P0001';
  end if;

  if v_necesidad_id is not null then
    v_titulo := v_necesidad.titulo;
  else
    select * into v_servicio from public.servicios where id = v_cotizacion.servicio_id;
    v_titulo := v_servicio.titulo;
  end if;

  -- Same sats rule as crear_orden: cents * 1e6 / quote, rounded up; commission at the default 100 bps.
  v_centavos := v_cotizacion.precio_usd_centavos;
  v_sats := ceil((v_centavos::bigint * 1000000)::numeric / round(p_cotizacion_btc, 2))::bigint;

  insert into public.ordenes (comprador_id, negocio_id, estado, tipo, total_usd_centavos, total_sats,
    cotizacion_usd_btc, modo_entrega, comision_teorica_sats, clave_idempotencia)
  values (v_cotizacion.cliente_id, v_cotizacion.negocio_id, 'acordada', 'servicio', v_centavos, v_sats,
    round(p_cotizacion_btc, 2), null, ceil(v_sats::numeric * 100 / 10000)::bigint,
    'cotizacion:' || p_cotizacion::text)
  returning * into v_orden;

  insert into public.lineas_orden (orden_id, producto_id, servicio_id, nombre, unidad, cantidad, precio_usd_centavos)
  values (v_orden.id, null, v_cotizacion.servicio_id, v_titulo, 'trabajo', 1, v_centavos);

  if v_necesidad_id is not null then
    update public.necesidades set estado = 'asignada' where id = v_necesidad_id;
    update public.cotizaciones set estado = 'rechazada', respondida_en = now()
    where necesidad_id = v_necesidad_id and id <> p_cotizacion and estado in ('solicitada', 'ofrecida');
    insert into public.auditoria (actor_id, accion, entidad, entidad_id, detalle)
    values (p_actor, 'necesidad.asignada', 'necesidad', v_necesidad_id::text, '{}');
  end if;

  update public.cotizaciones set estado = 'aceptada', orden_id = v_orden.id where id = p_cotizacion;

  insert into public.auditoria (actor_id, accion, entidad, entidad_id, detalle)
  values (p_actor, 'cotizacion.aceptada', 'cotizacion', p_cotizacion::text, '{}');
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, detalle)
  values (p_actor, 'orden.acordada', 'orden', v_orden.id::text, jsonb_build_object('desde', null, 'hacia', 'acordada'));

  insert into public.avisos (usuario_id, tipo, orden_id, texto)
  values (v_orden.comprador_id, 'orden.acordada', v_orden.id, public._texto_aviso('acordada', v_orden.numero, 'comprador'));
  insert into public.avisos (usuario_id, tipo, orden_id, texto)
  values (v_negocio.usuario_id, 'orden.acordada', v_orden.id, public._texto_aviso('acordada', v_orden.numero, 'vendedor'));

  return v_orden;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Jobs

-- The client hires a fixed-price service. The price and unit are copied into the job now, so later edits
-- by the shop do not change it. The same key twice returns the job it made.
create function public.contratar_servicio(p_cliente uuid, p_servicio uuid, p_nota text, p_clave text,
  p_cotizacion_btc numeric)
returns public.ordenes
language plpgsql security definer set search_path = public as $$
declare
  v_orden public.ordenes;
  v_servicio public.servicios;
  v_negocio public.negocios;
  v_nota text := btrim(coalesce(p_nota, ''));
  v_sats bigint;
begin
  if p_cliente is null or p_servicio is null or p_clave is null
     or char_length(btrim(p_clave)) = 0 or char_length(p_clave) > 100 then
    raise exception '%', 'DATOS_INVALIDOS: Faltan datos para contratar el servicio.' using errcode = 'P0001';
  end if;
  if p_cotizacion_btc is null or round(p_cotizacion_btc, 2) <= 0 then
    raise exception '%', 'DATOS_INVALIDOS: La cotización tiene que ser mayor que cero.' using errcode = 'P0001';
  end if;
  if char_length(v_nota) > 600 then
    raise exception '%', 'DATOS_INVALIDOS: La nota no puede pasar de 600 caracteres.' using errcode = 'P0001';
  end if;

  -- A double tap, or a retry after a timeout, gets the job the first request made.
  select * into v_orden from public.ordenes where comprador_id = p_cliente and clave_idempotencia = p_clave;
  if found then
    if v_orden.tipo <> 'servicio' then
      raise exception '%', 'DATOS_INVALIDOS: Esa clave ya se usó para otro pedido.' using errcode = 'P0001';
    end if;
    return v_orden;
  end if;

  if not exists (select 1 from public.usuarios u where u.id = p_cliente) then
    raise exception '%', 'NO_ENCONTRADA: No encontramos tu cuenta.' using errcode = 'P0001';
  end if;

  -- Locked so that two requests for one service run one after the other.
  select * into v_servicio from public.servicios where id = p_servicio for update;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos ese servicio.' using errcode = 'P0001';
  end if;
  select * into v_negocio from public.negocios where id = v_servicio.negocio_id;

  if v_negocio.usuario_id = p_cliente then
    raise exception '%', 'NO_PERMITIDO: No podés contratar tu propio servicio.' using errcode = 'P0001';
  end if;
  if not (v_servicio.activo and not v_servicio.oculto and v_negocio.estado = 'aprobado') then
    raise exception '%', 'NO_ENCONTRADA: No encontramos ese servicio.' using errcode = 'P0001';
  end if;
  if not v_negocio.abierto then
    raise exception '%', 'NEGOCIO_CERRADO: Este negocio no recibe pedidos por ahora.' using errcode = 'P0001';
  end if;
  if v_servicio.tipo_precio <> 'fijo' then
    raise exception '%', 'ESTADO_INVALIDO: Este servicio se cotiza. Pedí una cotización.' using errcode = 'P0001';
  end if;

  select * into v_orden from public.ordenes where comprador_id = p_cliente and clave_idempotencia = p_clave;
  if found then
    return v_orden;
  end if;

  v_sats := ceil((v_servicio.precio_usd_centavos::bigint * 1000000)::numeric / round(p_cotizacion_btc, 2))::bigint;

  insert into public.ordenes (comprador_id, negocio_id, estado, tipo, total_usd_centavos, total_sats,
    cotizacion_usd_btc, modo_entrega, comision_teorica_sats, clave_idempotencia)
  values (p_cliente, v_servicio.negocio_id, 'acordada', 'servicio', v_servicio.precio_usd_centavos, v_sats,
    round(p_cotizacion_btc, 2), null, ceil(v_sats::numeric * 100 / 10000)::bigint, p_clave)
  returning * into v_orden;

  insert into public.lineas_orden (orden_id, producto_id, servicio_id, nombre, unidad, cantidad, precio_usd_centavos)
  values (v_orden.id, null, v_servicio.id, v_servicio.titulo, v_servicio.unidad, 1, v_servicio.precio_usd_centavos);

  -- The note is the first thing the client says in the job's chat.
  if v_nota <> '' then
    insert into public.mensajes (orden_id, autor_id, texto) values (v_orden.id, p_cliente, v_nota);
  end if;

  insert into public.auditoria (actor_id, accion, entidad, entidad_id, detalle)
  values (p_cliente, 'orden.acordada', 'orden', v_orden.id::text, jsonb_build_object('desde', null, 'hacia', 'acordada'));

  insert into public.avisos (usuario_id, tipo, orden_id, texto)
  values (v_negocio.usuario_id, 'orden.acordada', v_orden.id, public._texto_aviso('acordada', v_orden.numero, 'vendedor'));

  return v_orden;
end;
$$;

-- The shop says the work is done. Only then can the client pay.
create function public.marcar_hecha(p_orden uuid, p_actor uuid) returns public.ordenes
language plpgsql security definer set search_path = public as $$
declare
  v_orden public.ordenes;
  v_rol text;
begin
  select * into v_orden from public.ordenes where id = p_orden for update;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa orden.' using errcode = 'P0001';
  end if;
  v_rol := public._rol_en_orden(v_orden, p_actor);
  if v_rol is null then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa orden.' using errcode = 'P0001';
  end if;
  if v_rol <> 'vendedor' then
    raise exception '%', 'NO_PERMITIDO: Solo quien ofrece el trabajo puede marcarlo como hecho.' using errcode = 'P0001';
  end if;
  if v_orden.tipo <> 'servicio' then
    raise exception '%', 'ESTADO_INVALIDO: Esta orden no es un trabajo.' using errcode = 'P0001';
  end if;

  return public._transicion_orden(p_orden, p_actor, array['acordada']::public.estado_orden[], 'hecha', false);
end;
$$;

-- Either party can cancel an agreed job, with a short reason. If the job came from a need that has not
-- expired, the need goes back to open and the shop may offer again.
create function public.cancelar_orden(p_orden uuid, p_actor uuid, p_motivo text) returns public.ordenes
language plpgsql security definer set search_path = public as $$
declare
  v_orden public.ordenes;
  v_rol text;
  v_motivo text;
  v_cotizacion public.cotizaciones;
  v_necesidad public.necesidades;
begin
  v_motivo := public._texto_valido(p_motivo, 4, 300, 'El motivo tiene que tener entre 4 y 300 caracteres.');

  select * into v_orden from public.ordenes where id = p_orden for update;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa orden.' using errcode = 'P0001';
  end if;
  v_rol := public._rol_en_orden(v_orden, p_actor);
  if v_rol is null then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa orden.' using errcode = 'P0001';
  end if;
  if v_orden.tipo <> 'servicio' or v_orden.estado <> 'acordada' then
    raise exception '%', 'ESTADO_INVALIDO: Esta orden ya no se puede cancelar.' using errcode = 'P0001';
  end if;

  -- The notice to the other party comes from the transition.
  v_orden := public._transicion_orden(p_orden, p_actor, array['acordada']::public.estado_orden[], 'cancelada', false);
  update public.ordenes set motivo_cancelacion = v_motivo where id = p_orden
  returning * into v_orden;

  select * into v_cotizacion from public.cotizaciones where orden_id = p_orden;
  if found and v_cotizacion.necesidad_id is not null then
    select * into v_necesidad from public.necesidades where id = v_cotizacion.necesidad_id for update;
    if v_necesidad.estado = 'asignada' and v_necesidad.vence_en > now() then
      update public.necesidades set estado = 'abierta' where id = v_necesidad.id;
      -- Withdrawn rather than accepted, so the same shop can make a new offer on the reopened need.
      update public.cotizaciones set estado = 'retirada' where id = v_cotizacion.id;
      insert into public.auditoria (actor_id, accion, entidad, entidad_id, detalle)
      values (p_actor, 'necesidad.reabierta', 'necesidad', v_necesidad.id::text, '{}');
    end if;
  end if;

  return v_orden;
end;
$$;

-- The payment request for a job the shop marked done. The sats are fixed now, with today's quote, and
-- any earlier request row for the job is replaced.
create function public.registrar_cobro_servicio(
  p_orden uuid,
  p_proveedor public.tipo_proveedor,
  p_referencia text,
  p_bolt11 text,
  p_destino text,
  p_verificar_url text,
  p_expira_en timestamptz,
  p_cotizacion_btc numeric
) returns public.cobros
language plpgsql security definer set search_path = public as $$
declare
  v_orden public.ordenes;
  v_cobro public.cobros;
  v_cotizacion numeric;
  v_sats bigint;
begin
  if p_proveedor is null or p_expira_en is null then
    raise exception '%', 'DATOS_INVALIDOS: Faltan datos del cobro.' using errcode = 'P0001';
  end if;
  if p_cotizacion_btc is null or round(p_cotizacion_btc, 2) <= 0 then
    raise exception '%', 'DATOS_INVALIDOS: La cotización tiene que ser mayor que cero.' using errcode = 'P0001';
  end if;
  v_cotizacion := round(p_cotizacion_btc, 2);

  select * into v_orden from public.ordenes where id = p_orden for update;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa orden.' using errcode = 'P0001';
  end if;
  if v_orden.tipo <> 'servicio' then
    raise exception '%', 'ESTADO_INVALIDO: Esta orden no es un trabajo.' using errcode = 'P0001';
  end if;
  if v_orden.estado <> 'hecha' then
    raise exception '%', 'ESTADO_INVALIDO: Este trabajo todavía no está hecho, así que no se puede pedir el pago.' using errcode = 'P0001';
  end if;

  v_sats := ceil((v_orden.total_usd_centavos::bigint * 1000000)::numeric / v_cotizacion)::bigint;

  delete from public.cobros where orden_id = p_orden;
  insert into public.cobros (orden_id, proveedor, referencia_externa, bolt11, destino, verificar_url, expira_en)
  values (p_orden, p_proveedor, p_referencia, p_bolt11, p_destino, p_verificar_url, p_expira_en)
  returning * into v_cobro;

  update public.ordenes set
    cotizacion_usd_btc = v_cotizacion,
    total_sats = v_sats,
    comision_teorica_sats = ceil(v_sats::numeric * 100 / 10000)::bigint
  where id = p_orden;

  perform public._transicion_orden(p_orden, null, array['hecha']::public.estado_orden[], 'esperando_pago', false);

  return v_cobro;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Changed functions. Same signatures as before; product orders take the same path as before.

-- A job is paid and finished in one step: the work was done before the request, so the payment is the
-- confirmation and no delivery code is made.
create or replace function public.confirmar_pago(p_orden uuid, p_actor uuid) returns public.ordenes
language plpgsql security definer set search_path = public as $$
declare
  v_orden public.ordenes;
  v_cobro public.cobros;
  v_rol text;
begin
  select * into v_orden from public.ordenes where id = p_orden for update;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa orden.' using errcode = 'P0001';
  end if;

  if p_actor is not null then
    v_rol := public._rol_en_orden(v_orden, p_actor);
    if v_rol is null then
      raise exception '%', 'NO_ENCONTRADA: No encontramos esa orden.' using errcode = 'P0001';
    end if;
    if v_rol <> 'vendedor' then
      raise exception '%', 'NO_PERMITIDO: Solo el vendedor puede confirmar el pago.' using errcode = 'P0001';
    end if;
  end if;

  if v_orden.estado <> 'esperando_pago' then
    raise exception '%', 'ESTADO_INVALIDO: La orden no está esperando pago.' using errcode = 'P0001';
  end if;

  select * into v_cobro from public.cobros where orden_id = p_orden for update;
  if not found or v_cobro.estado <> 'pendiente' then
    raise exception '%', 'ESTADO_INVALIDO: La orden no tiene un cobro pendiente.' using errcode = 'P0001';
  end if;
  -- Paying late is refused. The order stays as it is until expirar_ordenes runs.
  if v_cobro.expira_en < now() then
    raise exception '%', 'FUERA_DE_PLAZO: Se venció el plazo para pagar esta orden.' using errcode = 'P0001';
  end if;

  update public.cobros set estado = 'pagado', pagado_en = now() where id = v_cobro.id;

  if v_orden.tipo = 'servicio' then
    -- Both sides hear about the payment once, from the notice of 'pagada'.
    perform public._transicion_orden(p_orden, p_actor, array['esperando_pago']::public.estado_orden[], 'pagada', true);
    update public.ordenes set estado = 'entregada', entregada_en = now() where id = p_orden
    returning * into v_orden;
    insert into public.auditoria (actor_id, accion, entidad, entidad_id, detalle)
    values (p_actor, 'orden.entregada', 'orden', p_orden::text, jsonb_build_object('desde', 'pagada', 'hacia', 'entregada'));
    return v_orden;
  end if;

  update public.ordenes set codigo_entrega = public._codigo_entrega() where id = p_orden;

  -- When the system saw the payment, the shop owner has to hear about it too: it is their cue to
  -- prepare the order.
  return public._transicion_orden(p_orden, p_actor, array['esperando_pago']::public.estado_orden[], 'pagada',
    p_actor is null);
end;
$$;

-- Expires requests past their deadline and orders that were never paid within 10 minutes. Product orders
-- return the stock to the shelf. A job with an expired request goes back to 'hecha', so the client can ask
-- for a new request; it has no stock. Returns how many orders moved. Then closes the needs past their deadline.
create or replace function public.expirar_ordenes() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_orden public.ordenes;
  v_linea public.lineas_orden;
  v_total integer := 0;
begin
  for v_orden in
    select o.* from public.ordenes o
    where (o.estado = 'esperando_pago' and exists (
            select 1 from public.cobros c
            where c.orden_id = o.id and c.estado = 'pendiente' and c.expira_en < now()))
       or (o.estado = 'creada' and o.creada_en < now() - interval '10 minutes')
    for update skip locked
  loop
    update public.cobros set estado = 'expirado' where orden_id = v_orden.id and estado = 'pendiente';
    if v_orden.tipo = 'servicio' then
      perform public._transicion_orden(v_orden.id, null,
        array['esperando_pago']::public.estado_orden[], 'hecha', false);
    else
      for v_linea in select * from public.lineas_orden where orden_id = v_orden.id loop
        update public.productos set stock = stock + v_linea.cantidad where id = v_linea.producto_id;
      end loop;
      perform public._transicion_orden(v_orden.id, null,
        array['creada', 'esperando_pago']::public.estado_orden[], 'expirada', false);
    end if;
    v_total := v_total + 1;
  end loop;

  perform public.vencer_necesidades();
  return v_total;
end;
$$;

-- A client may dispute a job that was marked done but never paid. The rest of the rules are unchanged.
create or replace function public.abrir_disputa(p_orden uuid, p_actor uuid, p_motivo text, p_evidencia text)
returns public.disputas
language plpgsql security definer set search_path = public as $$
declare
  v_orden public.ordenes;
  v_disputa public.disputas;
  v_rol text;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_evidencia text := btrim(coalesce(p_evidencia, ''));
begin
  if char_length(v_motivo) < 5 or char_length(v_motivo) > 1000 then
    raise exception '%', 'DATOS_INVALIDOS: El motivo tiene que tener entre 5 y 1000 caracteres.' using errcode = 'P0001';
  end if;
  if char_length(v_evidencia) > 2000 then
    raise exception '%', 'DATOS_INVALIDOS: La evidencia no puede pasar de 2000 caracteres.' using errcode = 'P0001';
  end if;

  select * into v_orden from public.ordenes where id = p_orden for update;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa orden.' using errcode = 'P0001';
  end if;
  v_rol := public._rol_en_orden(v_orden, p_actor);
  if v_rol is null then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa orden.' using errcode = 'P0001';
  end if;
  if v_rol <> 'comprador' then
    raise exception '%', 'NO_PERMITIDO: Solo el comprador puede abrir una disputa.' using errcode = 'P0001';
  end if;
  if not (v_orden.estado in ('pagada', 'lista', 'entregada')
          or (v_orden.estado = 'hecha' and v_orden.tipo = 'servicio')) then
    raise exception '%', 'ESTADO_INVALIDO: Esta orden no se puede disputar en este momento.' using errcode = 'P0001';
  end if;
  if v_orden.estado = 'entregada' and v_orden.entregada_en < now() - interval '48 hours' then
    raise exception '%', 'FUERA_DE_PLAZO: Pasaron más de 48 horas desde la entrega.' using errcode = 'P0001';
  end if;

  insert into public.disputas (orden_id, motivo, evidencia)
  values (p_orden, v_motivo, v_evidencia)
  returning * into v_disputa;

  perform public._transicion_orden(p_orden, p_actor,
    array['pagada', 'lista', 'entregada', 'hecha']::public.estado_orden[], 'disputada', false);

  return v_disputa;
end;
$$;

-- A job never paid has two results: the work is owed (back to 'hecha') or it is not (cancelled, with the
-- note as the reason). Every other order keeps the three money results.
create or replace function public.resolver_disputa(p_orden uuid, p_actor uuid, p_resultado public.resultado_disputa, p_nota text)
returns public.disputas
language plpgsql security definer set search_path = public as $$
declare
  v_orden public.ordenes;
  v_disputa public.disputas;
  v_nota text := btrim(coalesce(p_nota, ''));
  v_sin_pagar boolean;
begin
  perform public._exigir_admin(p_actor);

  if p_resultado is null then
    raise exception '%', 'DATOS_INVALIDOS: Elegí un resultado para la disputa.' using errcode = 'P0001';
  end if;
  if char_length(v_nota) > 1000 then
    raise exception '%', 'DATOS_INVALIDOS: La nota no puede pasar de 1000 caracteres.' using errcode = 'P0001';
  end if;

  select * into v_orden from public.ordenes where id = p_orden for update;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa orden.' using errcode = 'P0001';
  end if;
  if v_orden.estado <> 'disputada' then
    raise exception '%', 'ESTADO_INVALIDO: Esa orden no tiene una disputa abierta.' using errcode = 'P0001';
  end if;

  v_sin_pagar := v_orden.tipo = 'servicio' and v_orden.pagada_en is null;
  if v_sin_pagar and p_resultado not in ('corresponde_pagar', 'no_corresponde_pagar') then
    raise exception '%', 'DATOS_INVALIDOS: Un trabajo sin pagar solo puede resolverse como corresponde pagar o no corresponde pagar.' using errcode = 'P0001';
  end if;
  if not v_sin_pagar and p_resultado in ('corresponde_pagar', 'no_corresponde_pagar') then
    raise exception '%', 'DATOS_INVALIDOS: Ese resultado solo sirve para un trabajo sin pagar.' using errcode = 'P0001';
  end if;

  update public.disputas set
    estado = 'resuelta',
    resultado = p_resultado,
    nota_resolucion = v_nota,
    resuelta_por = p_actor,
    resuelta_en = now()
  where orden_id = p_orden
  returning * into v_disputa;

  if not v_sin_pagar then
    perform public._transicion_orden(p_orden, p_actor, array['disputada']::public.estado_orden[], 'resuelta', true);
  elsif p_resultado = 'corresponde_pagar' then
    perform public._transicion_orden(p_orden, p_actor, array['disputada']::public.estado_orden[], 'hecha', true);
  else
    perform public._transicion_orden(p_orden, p_actor, array['disputada']::public.estado_orden[], 'cancelada', true);
    update public.ordenes set motivo_cancelacion = v_nota where id = p_orden;
  end if;

  return v_disputa;
end;
$$;

-- Chat works in every state of a job except a cancelled one. Products never reach 'cancelada'.
create or replace function public.enviar_mensaje(p_orden uuid, p_actor uuid, p_texto text) returns public.mensajes
language plpgsql security definer set search_path = public as $$
declare
  v_orden public.ordenes;
  v_mensaje public.mensajes;
  v_rol text;
  v_texto text;
  v_vendedor uuid;
begin
  v_texto := public._texto_valido(p_texto, 1, 1000, 'El mensaje tiene que tener entre 1 y 1000 caracteres.');

  select * into v_orden from public.ordenes where id = p_orden;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa orden.' using errcode = 'P0001';
  end if;
  v_rol := public._rol_en_orden(v_orden, p_actor);
  if v_rol is null then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa orden.' using errcode = 'P0001';
  end if;
  if v_orden.estado = 'cancelada' then
    raise exception '%', 'ESTADO_INVALIDO: Esta orden se canceló. Ya no se puede escribir en el chat.' using errcode = 'P0001';
  end if;

  insert into public.mensajes (orden_id, autor_id, texto)
  values (p_orden, p_actor, v_texto)
  returning * into v_mensaje;

  select n.usuario_id into v_vendedor from public.negocios n where n.id = v_orden.negocio_id;
  insert into public.avisos (usuario_id, tipo, orden_id, texto)
  values (case when v_rol = 'comprador' then v_vendedor else v_orden.comprador_id end,
          'mensaje', p_orden, 'Tenés un mensaje nuevo en la orden ' || v_orden.numero::text || '.');

  return v_mensaje;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants for the new functions: only the server (service role) runs them. Helpers run as the owner.

revoke execute on function public.guardar_servicio(uuid, uuid, integer, text, text, text, public.tipo_precio, integer, text, boolean, text[])
  from public, anon, authenticated;
revoke execute on function public.ocultar_servicio(uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.publicar_necesidad(uuid, integer, text, text, text, integer) from public, anon, authenticated;
revoke execute on function public.cancelar_necesidad(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.ocultar_necesidad(uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.vencer_necesidades() from public, anon, authenticated;
revoke execute on function public.solicitar_cotizacion(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.responder_cotizacion(uuid, uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.ofertar(uuid, uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.retirar_cotizacion(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.rechazar_cotizacion(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.aceptar_cotizacion(uuid, uuid, numeric) from public, anon, authenticated;
revoke execute on function public.contratar_servicio(uuid, uuid, text, text, numeric) from public, anon, authenticated;
revoke execute on function public.marcar_hecha(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.cancelar_orden(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.registrar_cobro_servicio(uuid, public.tipo_proveedor, text, text, text, text, timestamptz, numeric)
  from public, anon, authenticated;

grant execute on function public.guardar_servicio(uuid, uuid, integer, text, text, text, public.tipo_precio, integer, text, boolean, text[]) to service_role;
grant execute on function public.ocultar_servicio(uuid, uuid, boolean) to service_role;
grant execute on function public.publicar_necesidad(uuid, integer, text, text, text, integer) to service_role;
grant execute on function public.cancelar_necesidad(uuid, uuid) to service_role;
grant execute on function public.ocultar_necesidad(uuid, uuid, boolean) to service_role;
grant execute on function public.vencer_necesidades() to service_role;
grant execute on function public.solicitar_cotizacion(uuid, uuid, text) to service_role;
grant execute on function public.responder_cotizacion(uuid, uuid, integer, text) to service_role;
grant execute on function public.ofertar(uuid, uuid, integer, text) to service_role;
grant execute on function public.retirar_cotizacion(uuid, uuid) to service_role;
grant execute on function public.rechazar_cotizacion(uuid, uuid) to service_role;
grant execute on function public.aceptar_cotizacion(uuid, uuid, numeric) to service_role;
grant execute on function public.contratar_servicio(uuid, uuid, text, text, numeric) to service_role;
grant execute on function public.marcar_hecha(uuid, uuid) to service_role;
grant execute on function public.cancelar_orden(uuid, uuid, text) to service_role;
grant execute on function public.registrar_cobro_servicio(uuid, public.tipo_proveedor, text, text, text, text, timestamptz, numeric)
  to service_role;

-- Helpers: nobody runs them directly, not even the service role.
revoke execute on function public._usd_texto(integer) from public, anon, authenticated, service_role;
revoke execute on function public._texto_aviso_servicio(public.tipo_orden, public.estado_orden, bigint, text)
  from public, anon, authenticated, service_role;
