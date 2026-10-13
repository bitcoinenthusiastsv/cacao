-- CacaoMarket, Fase 1: every write the server makes.
--
-- The server calls these functions with the service role. The grants at the end revoke execute from
-- public, anon and authenticated, so a browser or a user session cannot call them.
-- Errors are raised as 'CODE: sentence' with errcode P0001. The server shows the sentence and can
-- branch on the code.
-- Every order transition goes through _transicion_orden, so the state change, its timestamp, the audit
-- row and the notice for the other party always happen together.

-- ---------------------------------------------------------------------------------------------
-- Private helpers. Only the functions below call them.

create function public._exigir_admin(p_actor uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not coalesce((select u.es_admin from public.usuarios u where u.id = p_actor), false) then
    raise exception '%', 'NO_PERMITIDO: Solo un administrador puede hacer esto.' using errcode = 'P0001';
  end if;
end;
$$;

-- 'comprador', 'vendedor' or null (not a party to the order). Null actor is never a party.
create function public._rol_en_orden(p_orden public.ordenes, p_actor uuid) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if p_actor is null then
    return null;
  end if;
  if p_orden.comprador_id = p_actor then
    return 'comprador';
  end if;
  if exists (select 1 from public.negocios n where n.id = p_orden.negocio_id and n.usuario_id = p_actor) then
    return 'vendedor';
  end if;
  return null;
end;
$$;

-- Six random digits. gen_random_uuid is cryptographically random, unlike random().
create function public._codigo_entrega() returns text
language plpgsql security definer set search_path = public as $$
begin
  return lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))::bit(48)::bigint) % 1000000)::text, 6, '0');
end;
$$;

-- Trims a text field and checks its length. Returns the trimmed text.
create function public._texto_valido(p_texto text, p_min int, p_max int, p_mensaje text) returns text
language plpgsql immutable security definer set search_path = public as $$
declare
  v_limpio text := btrim(coalesce(p_texto, ''));
begin
  if char_length(v_limpio) < p_min or char_length(v_limpio) > p_max then
    raise exception '%', 'DATOS_INVALIDOS: ' || p_mensaje using errcode = 'P0001';
  end if;
  return v_limpio;
end;
$$;

-- Lowercases and trims a Lightning Address. Empty means null.
create function public._correo_lightning(p_direccion text) returns text
language plpgsql immutable security definer set search_path = public as $$
declare
  v_limpio text := nullif(lower(btrim(coalesce(p_direccion, ''))), '');
begin
  if v_limpio is not null and v_limpio !~ '^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then
    raise exception '%', 'DATOS_INVALIDOS: La Lightning Address no es válida. Tiene que parecerse a usuario@dominio.sv.' using errcode = 'P0001';
  end if;
  return v_limpio;
end;
$$;

-- Notice text for the buyer ('comprador') or the shop owner ('vendedor') of an order.
create function public._texto_aviso(p_estado public.estado_orden, p_numero bigint, p_para text) returns text
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
    else 'La orden ' || n || ' cambió de estado.'
  end;
end;
$$;

-- The only way an order changes state. Locks the order, checks the current state, sets the new state
-- and its timestamp, writes one audit row and one notice for the other party.
-- p_actor null means the system. p_ambas_partes notifies both sides (used for resolutions).
create function public._transicion_orden(
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
    resuelta_en = case when p_hacia = 'resuelta' then now() else resuelta_en end
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
            public._texto_aviso(p_hacia, v_antes.numero, 'comprador'));
  end if;
  if p_ambas_partes or p_actor = v_antes.comprador_id then
    insert into public.avisos (usuario_id, tipo, orden_id, texto)
    values (v_vendedor, 'orden.' || p_hacia, p_orden,
            public._texto_aviso(p_hacia, v_antes.numero, 'vendedor'));
  end if;

  return v_despues;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Orders

create function public.crear_orden(
  p_comprador uuid,
  p_negocio uuid,
  p_lineas jsonb,
  p_modo public.modo_entrega,
  p_clave text,
  p_cotizacion numeric,
  p_comision_bps integer default 100
) returns public.ordenes
language plpgsql security definer set search_path = public as $$
declare
  v_orden public.ordenes;
  v_negocio public.negocios;
  v_producto public.productos;
  v_linea jsonb;
  v_ids uuid[] := '{}';
  v_cants integer[] := '{}';
  v_cant numeric;
  v_pid uuid;
  v_total_cents bigint := 0;
  v_total_sats bigint;
  v_comision bigint;
  i integer;
begin
  -- The same cart sent twice gets the order it already made. Stock is not touched again.
  if p_comprador is not null and p_clave is not null then
    select * into v_orden from public.ordenes where comprador_id = p_comprador and clave_idempotencia = p_clave;
    if found then
      return v_orden;
    end if;
  end if;

  if p_comprador is null or p_negocio is null or p_modo is null or p_clave is null
     or char_length(btrim(p_clave)) = 0 or char_length(p_clave) > 100 then
    raise exception '%', 'DATOS_INVALIDOS: Faltan datos para crear la orden.' using errcode = 'P0001';
  end if;
  if p_cotizacion is null or round(p_cotizacion, 2) <= 0 then
    raise exception '%', 'DATOS_INVALIDOS: La cotización tiene que ser mayor que cero.' using errcode = 'P0001';
  end if;
  if p_comision_bps is null or p_comision_bps < 0 or p_comision_bps > 10000 then
    raise exception '%', 'DATOS_INVALIDOS: La comisión no es válida.' using errcode = 'P0001';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) is distinct from 'array' then
    raise exception '%', 'DATOS_INVALIDOS: La orden no tiene productos.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_lineas) not between 1 and 50 then
    raise exception '%', 'DATOS_INVALIDOS: La orden tiene que tener entre 1 y 50 productos distintos.' using errcode = 'P0001';
  end if;

  for v_linea in select value from jsonb_array_elements(p_lineas) loop
    if jsonb_typeof(v_linea) is distinct from 'object'
       or jsonb_typeof(v_linea -> 'producto_id') is distinct from 'string'
       or jsonb_typeof(v_linea -> 'cantidad') is distinct from 'number' then
      raise exception '%', 'DATOS_INVALIDOS: Cada línea necesita un producto y una cantidad.' using errcode = 'P0001';
    end if;
    if (v_linea ->> 'producto_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception '%', 'DATOS_INVALIDOS: Uno de los productos no es válido.' using errcode = 'P0001';
    end if;
    v_cant := (v_linea ->> 'cantidad')::numeric;
    if v_cant < 1 or v_cant > 1000000 or v_cant <> trunc(v_cant) then
      raise exception '%', 'DATOS_INVALIDOS: La cantidad tiene que ser un número entero de al menos 1.' using errcode = 'P0001';
    end if;
    v_pid := (v_linea ->> 'producto_id')::uuid;
    if v_pid = any (v_ids) then
      raise exception '%', 'DATOS_INVALIDOS: Un producto aparece dos veces en la orden.' using errcode = 'P0001';
    end if;
    v_ids := v_ids || v_pid;
    v_cants := v_cants || v_cant::integer;
  end loop;

  select * into v_negocio from public.negocios where id = p_negocio;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos ese negocio.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.usuarios u where u.id = p_comprador) then
    raise exception '%', 'NO_ENCONTRADA: No encontramos tu cuenta.' using errcode = 'P0001';
  end if;
  if v_negocio.estado <> 'aprobado' or not v_negocio.abierto then
    raise exception '%', 'NEGOCIO_CERRADO: Este negocio no recibe pedidos por ahora.' using errcode = 'P0001';
  end if;
  if v_negocio.usuario_id = p_comprador then
    raise exception '%', 'NO_PERMITIDO: No podés comprarte a vos mismo.' using errcode = 'P0001';
  end if;

  -- Lock in id order, so two orders over overlapping products always wait in the same order.
  perform 1 from public.productos where id = any (v_ids) order by id for update;

  -- A twin request may have committed while this one waited for the locks.
  select * into v_orden from public.ordenes where comprador_id = p_comprador and clave_idempotencia = p_clave;
  if found then
    return v_orden;
  end if;

  for i in 1 .. array_length(v_ids, 1) loop
    select * into v_producto from public.productos where id = v_ids[i];
    if not found or v_producto.negocio_id <> p_negocio or not v_producto.activo then
      raise exception '%', 'NO_ENCONTRADA: Uno de los productos ya no está disponible en esta tienda.' using errcode = 'P0001';
    end if;
    if v_producto.stock < v_cants[i] then
      raise exception '%', 'SIN_STOCK: Ya no quedan suficientes unidades de ' || v_producto.nombre || '.' using errcode = 'P0001';
    end if;
    v_total_cents := v_total_cents + v_producto.precio_usd_centavos::bigint * v_cants[i];
  end loop;

  if v_total_cents > 100000000 then
    raise exception '%', 'DATOS_INVALIDOS: La orden es demasiado grande. Dividila en dos.' using errcode = 'P0001';
  end if;

  -- Sats = dollars / quote (in BTC) * 1e8 = cents * 1e6 / quote. Rounded up.
  v_total_sats := ceil((v_total_cents * 1000000)::numeric / p_cotizacion)::bigint;
  v_comision := ceil(v_total_sats::numeric * p_comision_bps / 10000)::bigint;

  insert into public.ordenes (comprador_id, negocio_id, estado, total_usd_centavos, total_sats,
    cotizacion_usd_btc, modo_entrega, comision_teorica_sats, clave_idempotencia)
  values (p_comprador, p_negocio, 'creada', v_total_cents, v_total_sats,
    round(p_cotizacion, 2), p_modo, v_comision, p_clave)
  returning * into v_orden;

  for i in 1 .. array_length(v_ids, 1) loop
    select * into v_producto from public.productos where id = v_ids[i];
    insert into public.lineas_orden (orden_id, producto_id, nombre, unidad, cantidad, precio_usd_centavos)
    values (v_orden.id, v_producto.id, v_producto.nombre, v_producto.unidad, v_cants[i], v_producto.precio_usd_centavos);
    update public.productos set stock = stock - v_cants[i] where id = v_producto.id;
  end loop;

  insert into public.auditoria (actor_id, accion, entidad, entidad_id, detalle)
  values (p_comprador, 'orden.creada', 'orden', v_orden.id::text,
          jsonb_build_object('total_sats', v_total_sats, 'total_usd_centavos', v_total_cents));

  return v_orden;
end;
$$;

create function public.registrar_cobro(
  p_orden uuid,
  p_proveedor public.tipo_proveedor,
  p_referencia text,
  p_bolt11 text,
  p_destino text,
  p_verificar_url text,
  p_expira_en timestamptz
) returns public.cobros
language plpgsql security definer set search_path = public as $$
declare
  v_orden public.ordenes;
  v_cobro public.cobros;
begin
  if p_proveedor is null or p_expira_en is null then
    raise exception '%', 'DATOS_INVALIDOS: Faltan datos del cobro.' using errcode = 'P0001';
  end if;

  select * into v_orden from public.ordenes where id = p_orden for update;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa orden.' using errcode = 'P0001';
  end if;
  if v_orden.estado <> 'creada' then
    raise exception '%', 'ESTADO_INVALIDO: La orden ya tiene un cobro registrado.' using errcode = 'P0001';
  end if;

  insert into public.cobros (orden_id, proveedor, referencia_externa, bolt11, destino, verificar_url, expira_en)
  values (p_orden, p_proveedor, p_referencia, p_bolt11, p_destino, p_verificar_url, p_expira_en);

  -- The system asks for the payment, so the buyer is the one who hears about it.
  perform public._transicion_orden(p_orden, null, array['creada']::public.estado_orden[], 'esperando_pago', false);

  select * into v_cobro from public.cobros where orden_id = p_orden;
  return v_cobro;
end;
$$;

-- p_actor null: the payment provider saw the money. Otherwise the shop owner confirms by hand.
create function public.confirmar_pago(p_orden uuid, p_actor uuid) returns public.ordenes
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
  update public.ordenes set codigo_entrega = public._codigo_entrega() where id = p_orden;

  -- When the system saw the payment, the shop owner has to hear about it too: it is their cue to
  -- prepare the order.
  return public._transicion_orden(p_orden, p_actor, array['esperando_pago']::public.estado_orden[], 'pagada',
    p_actor is null);
end;
$$;

-- Expires requests past their deadline and orders that were never paid within 10 minutes.
-- Returns the stock to the shelf.
create function public.expirar_ordenes() returns integer
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
    for v_linea in select * from public.lineas_orden where orden_id = v_orden.id loop
      update public.productos set stock = stock + v_linea.cantidad where id = v_linea.producto_id;
    end loop;
    perform public._transicion_orden(v_orden.id, null,
      array['creada', 'esperando_pago']::public.estado_orden[], 'expirada', false);
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$$;

create function public.marcar_lista(p_orden uuid, p_actor uuid) returns public.ordenes
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
    raise exception '%', 'NO_PERMITIDO: Solo el vendedor puede marcar la orden como lista.' using errcode = 'P0001';
  end if;

  return public._transicion_orden(p_orden, p_actor, array['pagada']::public.estado_orden[], 'lista', false);
end;
$$;

-- The buyer can confirm delivery without a code. The seller needs the code the buyer shows them.
create function public.marcar_entregada(p_orden uuid, p_actor uuid, p_codigo text) returns public.ordenes
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

  if v_orden.estado <> 'lista' then
    raise exception '%', 'ESTADO_INVALIDO: La orden todavía no está lista para entregar.' using errcode = 'P0001';
  end if;
  if v_rol = 'vendedor'
     and (p_codigo is null or btrim(p_codigo) is distinct from v_orden.codigo_entrega) then
    raise exception '%', 'CODIGO_INCORRECTO: El código de entrega no coincide.' using errcode = 'P0001';
  end if;

  return public._transicion_orden(p_orden, p_actor, array['lista']::public.estado_orden[], 'entregada', false);
end;
$$;

-- Closes delivered orders after 48 hours with no dispute.
create function public.cerrar_ordenes() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_orden public.ordenes;
  v_total integer := 0;
begin
  for v_orden in
    select o.* from public.ordenes o
    where o.estado = 'entregada'
      and o.entregada_en < now() - interval '48 hours'
      and not exists (select 1 from public.disputas d where d.orden_id = o.id)
    for update skip locked
  loop
    perform public._transicion_orden(v_orden.id, null, array['entregada']::public.estado_orden[], 'cerrada', false);
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Reviews

create function public.crear_resena(p_orden uuid, p_actor uuid, p_puntuacion integer, p_comentario text)
returns public.resenas
language plpgsql security definer set search_path = public as $$
declare
  v_orden public.ordenes;
  v_resena public.resenas;
  v_rol text;
  v_comentario text := btrim(coalesce(p_comentario, ''));
begin
  if p_puntuacion is null or p_puntuacion not between 1 and 5 then
    raise exception '%', 'DATOS_INVALIDOS: La puntuación tiene que ser de 1 a 5.' using errcode = 'P0001';
  end if;
  if char_length(v_comentario) > 600 then
    raise exception '%', 'DATOS_INVALIDOS: El comentario no puede pasar de 600 caracteres.' using errcode = 'P0001';
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
    raise exception '%', 'NO_PERMITIDO: Solo el comprador puede dejar una reseña.' using errcode = 'P0001';
  end if;
  if v_orden.estado not in ('entregada', 'cerrada') then
    raise exception '%', 'ESTADO_INVALIDO: La reseña se puede dejar después de recibir el pedido.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.resenas r where r.orden_id = p_orden) then
    raise exception '%', 'ESTADO_INVALIDO: Ya dejaste una reseña para esta orden.' using errcode = 'P0001';
  end if;

  insert into public.resenas (orden_id, negocio_id, puntuacion, comentario)
  values (p_orden, v_orden.negocio_id, p_puntuacion, v_comentario)
  returning * into v_resena;

  if v_orden.estado = 'entregada' then
    perform public._transicion_orden(p_orden, p_actor, array['entregada']::public.estado_orden[], 'cerrada', false);
  end if;

  return v_resena;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Disputes

create function public.abrir_disputa(p_orden uuid, p_actor uuid, p_motivo text, p_evidencia text)
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
  if v_orden.estado not in ('pagada', 'lista', 'entregada') then
    raise exception '%', 'ESTADO_INVALIDO: Esta orden no se puede disputar en este momento.' using errcode = 'P0001';
  end if;
  if v_orden.estado = 'entregada' and v_orden.entregada_en < now() - interval '48 hours' then
    raise exception '%', 'FUERA_DE_PLAZO: Pasaron más de 48 horas desde la entrega.' using errcode = 'P0001';
  end if;

  insert into public.disputas (orden_id, motivo, evidencia)
  values (p_orden, v_motivo, v_evidencia)
  returning * into v_disputa;

  perform public._transicion_orden(p_orden, p_actor,
    array['pagada', 'lista', 'entregada']::public.estado_orden[], 'disputada', false);

  return v_disputa;
end;
$$;

create function public.resolver_disputa(p_orden uuid, p_actor uuid, p_resultado public.resultado_disputa, p_nota text)
returns public.disputas
language plpgsql security definer set search_path = public as $$
declare
  v_orden public.ordenes;
  v_disputa public.disputas;
  v_nota text := btrim(coalesce(p_nota, ''));
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

  update public.disputas set
    estado = 'resuelta',
    resultado = p_resultado,
    nota_resolucion = v_nota,
    resuelta_por = p_actor,
    resuelta_en = now()
  where orden_id = p_orden
  returning * into v_disputa;

  perform public._transicion_orden(p_orden, p_actor, array['disputada']::public.estado_orden[], 'resuelta', true);

  return v_disputa;
end;
$$;

-- The seller pays the refund outside the app and marks it. The buyer confirms it.
create function public.marcar_reembolso(p_orden uuid, p_actor uuid) returns public.disputas
language plpgsql security definer set search_path = public as $$
declare
  v_orden public.ordenes;
  v_disputa public.disputas;
  v_rol text;
  v_vendedor uuid;
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
    raise exception '%', 'NO_PERMITIDO: Solo el vendedor puede marcar el reembolso.' using errcode = 'P0001';
  end if;

  select * into v_disputa from public.disputas where orden_id = p_orden for update;
  if not found then
    raise exception '%', 'ESTADO_INVALIDO: Esta orden no tiene una disputa resuelta.' using errcode = 'P0001';
  end if;
  if v_disputa.estado <> 'resuelta'
     or v_disputa.resultado not in ('reembolso_total', 'reembolso_parcial')
     or v_disputa.reembolso_marcado_en is not null then
    raise exception '%', 'ESTADO_INVALIDO: No hay un reembolso pendiente de marcar para esta orden.' using errcode = 'P0001';
  end if;

  update public.disputas set reembolso_marcado_en = now() where id = v_disputa.id
  returning * into v_disputa;

  insert into public.auditoria (actor_id, accion, entidad, entidad_id, detalle)
  values (p_actor, 'reembolso.marcado', 'orden', p_orden::text, '{}');

  insert into public.avisos (usuario_id, tipo, orden_id, texto)
  values (v_orden.comprador_id, 'reembolso.marcado', p_orden,
          'El vendedor marcó el reembolso de la orden ' || v_orden.numero::text || '. Confirmalo cuando lo recibas.');

  return v_disputa;
end;
$$;

create function public.confirmar_reembolso(p_orden uuid, p_actor uuid) returns public.disputas
language plpgsql security definer set search_path = public as $$
declare
  v_orden public.ordenes;
  v_disputa public.disputas;
  v_rol text;
  v_vendedor uuid;
begin
  select * into v_orden from public.ordenes where id = p_orden for update;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa orden.' using errcode = 'P0001';
  end if;
  v_rol := public._rol_en_orden(v_orden, p_actor);
  if v_rol is null then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa orden.' using errcode = 'P0001';
  end if;
  if v_rol <> 'comprador' then
    raise exception '%', 'NO_PERMITIDO: Solo el comprador puede confirmar el reembolso.' using errcode = 'P0001';
  end if;

  select * into v_disputa from public.disputas where orden_id = p_orden for update;
  if not found then
    raise exception '%', 'ESTADO_INVALIDO: Esta orden no tiene una disputa resuelta.' using errcode = 'P0001';
  end if;
  if v_disputa.reembolso_marcado_en is null or v_disputa.reembolso_confirmado_en is not null then
    raise exception '%', 'ESTADO_INVALIDO: Todavía no hay un reembolso marcado para confirmar.' using errcode = 'P0001';
  end if;

  update public.disputas set reembolso_confirmado_en = now() where id = v_disputa.id
  returning * into v_disputa;

  insert into public.auditoria (actor_id, accion, entidad, entidad_id, detalle)
  values (p_actor, 'reembolso.confirmado', 'orden', p_orden::text, '{}');

  select n.usuario_id into v_vendedor from public.negocios n where n.id = v_orden.negocio_id;
  insert into public.avisos (usuario_id, tipo, orden_id, texto)
  values (v_vendedor, 'reembolso.confirmado', p_orden,
          'El comprador confirmó el reembolso de la orden ' || v_orden.numero::text || '.');

  return v_disputa;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Chat

create function public.enviar_mensaje(p_orden uuid, p_actor uuid, p_texto text) returns public.mensajes
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
-- Shops and users

create function public.solicitar_negocio(p_usuario uuid, p_nombre text, p_descripcion text,
  p_ubicacion text, p_lightning_address text)
returns public.negocios
language plpgsql security definer set search_path = public as $$
declare
  v_negocio public.negocios;
begin
  if not exists (select 1 from public.usuarios u where u.id = p_usuario) then
    raise exception '%', 'NO_ENCONTRADA: No encontramos tu cuenta.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.negocios n where n.usuario_id = p_usuario) then
    raise exception '%', 'ESTADO_INVALIDO: Ya tenés un negocio registrado.' using errcode = 'P0001';
  end if;

  insert into public.negocios (usuario_id, nombre, descripcion, ubicacion, lightning_address)
  values (p_usuario,
    public._texto_valido(p_nombre, 2, 80, 'El nombre del negocio tiene que tener entre 2 y 80 caracteres.'),
    public._texto_valido(p_descripcion, 0, 600, 'La descripción no puede pasar de 600 caracteres.'),
    public._texto_valido(p_ubicacion, 0, 160, 'La ubicación no puede pasar de 160 caracteres.'),
    public._correo_lightning(p_lightning_address))
  returning * into v_negocio;

  return v_negocio;
end;
$$;

-- The owner edits everything except the state, which only an administrator changes.
create function public.actualizar_negocio(p_usuario uuid, p_nombre text, p_descripcion text,
  p_ubicacion text, p_lightning_address text, p_abierto boolean)
returns public.negocios
language plpgsql security definer set search_path = public as $$
declare
  v_negocio public.negocios;
  v_nombre text;
  v_descripcion text;
  v_ubicacion text;
  v_lightning text;
begin
  select * into v_negocio from public.negocios where usuario_id = p_usuario for update;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos tu negocio.' using errcode = 'P0001';
  end if;

  v_nombre := public._texto_valido(p_nombre, 2, 80, 'El nombre del negocio tiene que tener entre 2 y 80 caracteres.');
  v_descripcion := public._texto_valido(p_descripcion, 0, 600, 'La descripción no puede pasar de 600 caracteres.');
  v_ubicacion := public._texto_valido(p_ubicacion, 0, 160, 'La ubicación no puede pasar de 160 caracteres.');
  v_lightning := public._correo_lightning(p_lightning_address);
  if p_abierto is null then
    raise exception '%', 'DATOS_INVALIDOS: Indicá si la tienda está abierta.' using errcode = 'P0001';
  end if;

  update public.negocios set
    nombre = v_nombre,
    descripcion = v_descripcion,
    ubicacion = v_ubicacion,
    lightning_address = v_lightning,
    abierto = p_abierto
  where id = v_negocio.id
  returning * into v_negocio;

  return v_negocio;
end;
$$;

create function public.cambiar_estado_negocio(p_negocio uuid, p_actor uuid, p_estado public.estado_negocio)
returns public.negocios
language plpgsql security definer set search_path = public as $$
declare
  v_antes public.negocios;
  v_despues public.negocios;
  v_texto text;
begin
  perform public._exigir_admin(p_actor);

  if p_estado is null then
    raise exception '%', 'DATOS_INVALIDOS: Elegí un estado para el negocio.' using errcode = 'P0001';
  end if;

  select * into v_antes from public.negocios where id = p_negocio for update;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos ese negocio.' using errcode = 'P0001';
  end if;

  update public.negocios set estado = p_estado where id = p_negocio
  returning * into v_despues;

  insert into public.auditoria (actor_id, accion, entidad, entidad_id, detalle)
  values (p_actor, 'negocio.' || p_estado, 'negocio', p_negocio::text,
          jsonb_build_object('desde', v_antes.estado, 'hacia', p_estado));

  v_texto := case p_estado
    when 'aprobado' then 'Tu negocio ' || v_antes.nombre || ' fue aprobado. Ya podés publicar productos.'
    when 'suspendido' then 'Tu negocio ' || v_antes.nombre || ' fue suspendido por el administrador.'
    else 'Tu negocio ' || v_antes.nombre || ' volvió a estar pendiente de aprobación.'
  end;
  insert into public.avisos (usuario_id, tipo, orden_id, texto)
  values (v_antes.usuario_id, 'negocio.' || p_estado, null, v_texto);

  return v_despues;
end;
$$;

create function public.guardar_producto(
  p_usuario uuid,
  p_producto uuid,
  p_categoria integer,
  p_nombre text,
  p_descripcion text,
  p_unidad text,
  p_precio integer,
  p_stock integer,
  p_activo boolean,
  p_fotos text[]
) returns public.productos
language plpgsql security definer set search_path = public as $$
declare
  v_negocio uuid;
  v_fotos text[] := coalesce(p_fotos, '{}');
  v_producto public.productos;
  v_nombre text;
  v_descripcion text;
  v_unidad text;
begin
  select n.id into v_negocio from public.negocios n where n.usuario_id = p_usuario;
  if v_negocio is null then
    raise exception '%', 'NO_PERMITIDO: Primero tenés que registrar tu negocio.' using errcode = 'P0001';
  end if;

  v_nombre := public._texto_valido(p_nombre, 2, 80, 'El nombre del producto tiene que tener entre 2 y 80 caracteres.');
  v_descripcion := public._texto_valido(p_descripcion, 0, 600, 'La descripción no puede pasar de 600 caracteres.');
  v_unidad := public._texto_valido(p_unidad, 1, 40, 'La unidad tiene que tener entre 1 y 40 caracteres.');

  if p_precio is null or p_precio <= 0 then
    raise exception '%', 'DATOS_INVALIDOS: El precio tiene que ser mayor que cero.' using errcode = 'P0001';
  end if;
  if p_stock is null or p_stock < 0 then
    raise exception '%', 'DATOS_INVALIDOS: El stock no puede ser negativo.' using errcode = 'P0001';
  end if;
  if p_activo is null then
    raise exception '%', 'DATOS_INVALIDOS: Indicá si el producto está activo.' using errcode = 'P0001';
  end if;
  if cardinality(v_fotos) > 6 then
    raise exception '%', 'DATOS_INVALIDOS: Un producto puede tener hasta 6 fotos.' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(v_fotos) f where char_length(f) > 500) then
    raise exception '%', 'DATOS_INVALIDOS: Una de las fotos tiene una dirección demasiado larga.' using errcode = 'P0001';
  end if;
  if p_categoria is null or not exists (select 1 from public.categorias c where c.id = p_categoria) then
    raise exception '%', 'DATOS_INVALIDOS: Elegí una categoría válida.' using errcode = 'P0001';
  end if;

  if p_producto is null then
    insert into public.productos (negocio_id, categoria_id, nombre, descripcion, unidad,
      precio_usd_centavos, stock, activo, fotos)
    values (v_negocio, p_categoria, v_nombre, v_descripcion, v_unidad,
      p_precio, p_stock, p_activo, v_fotos)
    returning * into v_producto;
  else
    perform 1 from public.productos where id = p_producto and negocio_id = v_negocio for update;
    if not found then
      raise exception '%', 'NO_ENCONTRADA: No encontramos ese producto en tu negocio.' using errcode = 'P0001';
    end if;
    update public.productos set
      categoria_id = p_categoria,
      nombre = v_nombre,
      descripcion = v_descripcion,
      unidad = v_unidad,
      precio_usd_centavos = p_precio,
      stock = p_stock,
      activo = p_activo,
      fotos = v_fotos
    where id = p_producto
    returning * into v_producto;
  end if;

  return v_producto;
end;
$$;

create function public.actualizar_perfil(p_usuario uuid, p_nombre text) returns public.usuarios
language plpgsql security definer set search_path = public as $$
declare
  v_usuario public.usuarios;
begin
  update public.usuarios set nombre = public._texto_valido(p_nombre, 1, 80,
    'El nombre tiene que tener entre 1 y 80 caracteres.')
  where id = p_usuario
  returning * into v_usuario;

  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos tu cuenta.' using errcode = 'P0001';
  end if;
  return v_usuario;
end;
$$;

create function public.marcar_avisos_leidos(p_usuario uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_total integer;
begin
  update public.avisos set leido = true where usuario_id = p_usuario and not leido;
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Metrics: how much of what sellers collect is spent again inside the network.
-- "Paid" = pagada, lista, entregada, cerrada, resuelta.

create view public.circularidad_negocios (negocio_id, nombre, sats_cobrados, sats_regastados, indice) as
select
  n.id,
  n.nombre,
  c.total,
  r.total,
  case when c.total > 0 then round(r.total::numeric / c.total, 4) end
from public.negocios n
cross join lateral (
  select coalesce(sum(o.total_sats), 0)::bigint as total
  from public.ordenes o
  where o.negocio_id = n.id
    and o.estado in ('pagada', 'lista', 'entregada', 'cerrada', 'resuelta')
) c
cross join lateral (
  select coalesce(sum(o.total_sats), 0)::bigint as total
  from public.ordenes o
  where o.comprador_id = n.usuario_id
    and o.estado in ('pagada', 'lista', 'entregada', 'cerrada', 'resuelta')
) r;

-- Network totals. Re-spent sats are the sats each seller's business spent as a buyer.
-- "Negocios" counts approved shops. "Porcentaje" is the share of them that also bought.
create function public.circularidad_red()
returns table (
  sats_cobrados bigint,
  sats_regastados bigint,
  indice numeric,
  negocios integer,
  negocios_que_compran integer,
  porcentaje numeric
)
language sql stable security definer set search_path = public as $$
  with totales as (
    select
      (select coalesce(sum(o.total_sats), 0)::bigint from public.ordenes o
        where o.estado in ('pagada', 'lista', 'entregada', 'cerrada', 'resuelta')) as cobrados,
      (select coalesce(sum(v.sats_regastados), 0)::bigint from public.circularidad_negocios v) as regastados,
      (select count(*)::integer from public.negocios n where n.estado = 'aprobado') as vendedores,
      (select count(*)::integer from public.negocios n
        where n.estado = 'aprobado'
          and exists (select 1 from public.ordenes o
                      where o.comprador_id = n.usuario_id
                        and o.estado in ('pagada', 'lista', 'entregada', 'cerrada', 'resuelta'))) as compran
  )
  select
    t.cobrados,
    t.regastados,
    case when t.cobrados > 0 then round(t.regastados::numeric / t.cobrados, 4) end,
    t.vendedores,
    t.compran,
    case when t.vendedores > 0 then round(100.0 * t.compran / t.vendedores, 1) end
  from totales t;
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants. Only the server (service role) may run these. Helpers run as the function owner only.

revoke execute on function public.crear_orden(uuid, uuid, jsonb, public.modo_entrega, text, numeric, integer)
  from public, anon, authenticated;
revoke execute on function public.registrar_cobro(uuid, public.tipo_proveedor, text, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.confirmar_pago(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.expirar_ordenes() from public, anon, authenticated;
revoke execute on function public.marcar_lista(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.marcar_entregada(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.cerrar_ordenes() from public, anon, authenticated;
revoke execute on function public.crear_resena(uuid, uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.abrir_disputa(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.resolver_disputa(uuid, uuid, public.resultado_disputa, text)
  from public, anon, authenticated;
revoke execute on function public.marcar_reembolso(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.confirmar_reembolso(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.enviar_mensaje(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.solicitar_negocio(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.actualizar_negocio(uuid, text, text, text, text, boolean)
  from public, anon, authenticated;
revoke execute on function public.cambiar_estado_negocio(uuid, uuid, public.estado_negocio)
  from public, anon, authenticated;
revoke execute on function public.guardar_producto(uuid, uuid, integer, text, text, text, integer, integer, boolean, text[])
  from public, anon, authenticated;
revoke execute on function public.actualizar_perfil(uuid, text) from public, anon, authenticated;
revoke execute on function public.marcar_avisos_leidos(uuid) from public, anon, authenticated;
revoke execute on function public.circularidad_red() from public, anon, authenticated;

grant execute on function public.crear_orden(uuid, uuid, jsonb, public.modo_entrega, text, numeric, integer) to service_role;
grant execute on function public.registrar_cobro(uuid, public.tipo_proveedor, text, text, text, text, timestamptz) to service_role;
grant execute on function public.confirmar_pago(uuid, uuid) to service_role;
grant execute on function public.expirar_ordenes() to service_role;
grant execute on function public.marcar_lista(uuid, uuid) to service_role;
grant execute on function public.marcar_entregada(uuid, uuid, text) to service_role;
grant execute on function public.cerrar_ordenes() to service_role;
grant execute on function public.crear_resena(uuid, uuid, integer, text) to service_role;
grant execute on function public.abrir_disputa(uuid, uuid, text, text) to service_role;
grant execute on function public.resolver_disputa(uuid, uuid, public.resultado_disputa, text) to service_role;
grant execute on function public.marcar_reembolso(uuid, uuid) to service_role;
grant execute on function public.confirmar_reembolso(uuid, uuid) to service_role;
grant execute on function public.enviar_mensaje(uuid, uuid, text) to service_role;
grant execute on function public.solicitar_negocio(uuid, text, text, text, text) to service_role;
grant execute on function public.actualizar_negocio(uuid, text, text, text, text, boolean) to service_role;
grant execute on function public.cambiar_estado_negocio(uuid, uuid, public.estado_negocio) to service_role;
grant execute on function public.guardar_producto(uuid, uuid, integer, text, text, text, integer, integer, boolean, text[]) to service_role;
grant execute on function public.actualizar_perfil(uuid, text) to service_role;
grant execute on function public.marcar_avisos_leidos(uuid) to service_role;
grant execute on function public.circularidad_red() to service_role;

-- Helpers: no one but the owner runs them, not even the service role.
revoke execute on function public._exigir_admin(uuid) from public, anon, authenticated, service_role;
revoke execute on function public._rol_en_orden(public.ordenes, uuid) from public, anon, authenticated, service_role;
revoke execute on function public._codigo_entrega() from public, anon, authenticated, service_role;
revoke execute on function public._texto_valido(text, integer, integer, text) from public, anon, authenticated, service_role;
revoke execute on function public._correo_lightning(text) from public, anon, authenticated, service_role;
revoke execute on function public._texto_aviso(public.estado_orden, bigint, text) from public, anon, authenticated, service_role;
revoke execute on function public._transicion_orden(uuid, uuid, public.estado_orden[], public.estado_orden, boolean)
  from public, anon, authenticated, service_role;

-- The view exposes money totals per business: the service role only.
revoke all on public.circularidad_negocios from anon, authenticated;
grant select on public.circularidad_negocios to service_role;
