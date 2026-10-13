-- CacaoMarket: the buyer can cancel a product order before it is paid.
--
-- Service orders keep their behaviour: cancelar_orden still cancels an agreed job, by either party.
-- A product order in 'creada' or 'esperando_pago' is cancelled by its buyer; the stock goes back to the
-- shelf the same way expirar_ordenes returns it, and its payment request is closed. Once paid, a
-- product order is a dispute, not a cancellation.

-- Notice text for a cancelled product order. Same signature as before; the product sentence needs the
-- order type, so it lives here and not in _texto_aviso. Every other notice is unchanged.
create or replace function public._texto_aviso_servicio(p_tipo public.tipo_orden, p_estado public.estado_orden,
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
  if p_tipo = 'productos' and p_estado = 'cancelada' then
    if p_para = 'comprador' then
      return 'Cancelaste la orden ' || n || '. Los productos volvieron al stock.';
    end if;
    return 'El comprador canceló la orden ' || n || '. Los productos volvieron al stock.';
  end if;
  return public._texto_aviso(p_estado, p_numero, p_para);
end;
$$;

-- Same signature as in 20261013000002_servicios.sql. Either party cancels an agreed job with a reason;
-- the buyer cancels a product order before it is paid.
create or replace function public.cancelar_orden(p_orden uuid, p_actor uuid, p_motivo text) returns public.ordenes
language plpgsql security definer set search_path = public as $$
declare
  v_orden public.ordenes;
  v_rol text;
  v_motivo text;
  v_cotizacion public.cotizaciones;
  v_necesidad public.necesidades;
  v_linea public.lineas_orden;
begin
  v_motivo := public._texto_valido(p_motivo, 4, 300, 'El motivo tiene que tener entre 4 y 300 caracteres.');

  -- The order is locked first, so a payment arriving at the same moment waits for this cancel (or the
  -- other way round): confirmar_pago locks the order the same way.
  select * into v_orden from public.ordenes where id = p_orden for update;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa orden.' using errcode = 'P0001';
  end if;
  v_rol := public._rol_en_orden(v_orden, p_actor);
  if v_rol is null then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa orden.' using errcode = 'P0001';
  end if;

  if v_orden.tipo = 'productos' then
    if v_rol <> 'comprador' then
      raise exception '%', 'NO_PERMITIDO: Solo el comprador puede cancelar un pedido de productos.' using errcode = 'P0001';
    end if;
    if v_orden.estado not in ('creada', 'esperando_pago') then
      raise exception '%', 'ESTADO_INVALIDO: Esta orden ya no se puede cancelar. Si ya pagaste, abrí una disputa.' using errcode = 'P0001';
    end if;

    -- A payment that arrives later finds no pending request, so confirmar_pago refuses it.
    update public.cobros set estado = 'cancelado' where orden_id = p_orden and estado = 'pendiente';

    -- Same stock return as expirar_ordenes.
    for v_linea in select * from public.lineas_orden where orden_id = p_orden loop
      update public.productos set stock = stock + v_linea.cantidad where id = v_linea.producto_id;
    end loop;

    -- The notice to the shop owner comes from the transition.
    v_orden := public._transicion_orden(p_orden, p_actor,
      array['creada', 'esperando_pago']::public.estado_orden[], 'cancelada', false);
    update public.ordenes set motivo_cancelacion = v_motivo where id = p_orden
    returning * into v_orden;

    return v_orden;
  end if;

  if v_orden.estado <> 'acordada' then
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

-- Grants stay as they were; repeated so this file reads on its own.
revoke execute on function public.cancelar_orden(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.cancelar_orden(uuid, uuid, text) to service_role;
revoke execute on function public._texto_aviso_servicio(public.tipo_orden, public.estado_orden, bigint, text)
  from public, anon, authenticated, service_role;
