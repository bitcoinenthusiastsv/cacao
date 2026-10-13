-- Cacao Pay: remittance simulator. Transfers, their history, the rates and the fees.
--
-- Nothing here moves money. The server calls these functions with the service role; the money is
-- recomputed here, in integers, and a request whose amounts differ from that is refused.
-- Same rules as the other migrations: the browser never writes or reads these tables.

-- ---------------------------------------------------------------------------------------------
-- Rates and fees

-- Units of the second currency per one of the first. USD/USD is always 1 and is not stored.
create table public.pay_tasas (
  par text primary key check (par in ('EUR/USD')),
  tasa numeric(18, 8) not null check (tasa > 0),
  fuente text not null check (char_length(fuente) between 1 and 120),
  actualizada_en timestamptz not null default now()
);

-- Fee per delivery method: a fixed amount in cents plus basis points of the amount sent.
create table public.pay_tarifas (
  entrega public.pay_entrega primary key,
  fijo_centavos integer not null check (fijo_centavos >= 0),
  porcentaje_bps integer not null check (porcentaje_bps >= 0),
  minutos_estimados integer not null check (minutos_estimados > 0),
  descripcion text not null check (char_length(descripcion) between 1 and 200)
);

insert into public.pay_tasas (par, tasa, fuente) values
  ('EUR/USD', 1.08, 'Tasa fija de demostración')
on conflict do nothing;

insert into public.pay_tarifas (entrega, fijo_centavos, porcentaje_bps, minutos_estimados, descripcion) values
  ('lightning', 0, 50, 1, 'Lightning. Llega en un minuto.'),
  ('cuenta', 99, 100, 60, 'Depósito a cuenta bancaria. Llega en una hora.'),
  ('efectivo', 199, 150, 30, 'Retiro en efectivo en un punto de pago. Listo en media hora.')
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------
-- Transfers

create table public.pay_transferencias (
  id uuid primary key default gen_random_uuid(),
  -- Short code people read out: "CP-XXXX-XXXX", without look-alike characters.
  codigo text not null unique check (codigo ~ '^CP-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}$'),
  remitente_id uuid not null references public.usuarios (id),
  destinatario_nombre text not null check (char_length(destinatario_nombre) between 2 and 80),
  -- Private: a phone or an email, as the sender typed it.
  destinatario_contacto text not null check (char_length(destinatario_contacto) between 3 and 120),
  -- Set when the contact matches a registered phone or email.
  destinatario_id uuid references public.usuarios (id),
  moneda_origen public.pay_moneda not null check (moneda_origen in ('USD', 'EUR')),
  monto_origen_centavos integer not null check (monto_origen_centavos > 0),
  comision_centavos integer not null check (comision_centavos >= 0),
  neto_centavos integer not null check (neto_centavos > 0),
  check (neto_centavos = monto_origen_centavos - comision_centavos),
  -- Destination units per origin unit. For SATS: sats per one whole origin unit.
  tasa numeric(18, 8) not null check (tasa > 0),
  tasa_fuente text not null check (char_length(tasa_fuente) between 1 and 80),
  moneda_destino public.pay_moneda not null check (moneda_destino in ('USD', 'SATS')),
  -- Cents for USD, sats for SATS.
  monto_destino bigint not null check (monto_destino > 0),
  entrega public.pay_entrega not null,
  estado public.pay_estado not null default 'creada',
  nota text not null default '' check (char_length(nota) <= 200),
  clave_idempotencia text not null check (char_length(clave_idempotencia) between 1 and 100),
  creada_en timestamptz not null default now(),
  procesando_en timestamptz,
  completada_en timestamptz,
  fallida_en timestamptz,
  cancelada_en timestamptz,
  motivo text check (motivo is null or char_length(motivo) <= 200),
  unique (remitente_id, clave_idempotencia),
  check (moneda_destino <> 'SATS' or entrega = 'lightning'),
  check (moneda_destino <> 'USD' or entrega in ('efectivo', 'cuenta'))
);
create index pay_transferencias_remitente on public.pay_transferencias (remitente_id, creada_en desc);
create index pay_transferencias_destinatario on public.pay_transferencias (destinatario_id);
create index pay_transferencias_creada on public.pay_transferencias (creada_en);

create table public.pay_historial (
  id bigint primary key generated always as identity,
  transferencia_id uuid not null references public.pay_transferencias (id) on delete cascade,
  estado public.pay_estado not null,
  detalle text not null default '' check (char_length(detalle) <= 300),
  creado_en timestamptz not null default now()
);
create index pay_historial_transferencia on public.pay_historial (transferencia_id, id);

alter table public.pay_tasas enable row level security;
alter table public.pay_tarifas enable row level security;
alter table public.pay_transferencias enable row level security;
alter table public.pay_historial enable row level security;

revoke all on public.pay_tasas, public.pay_tarifas, public.pay_transferencias, public.pay_historial
  from anon, authenticated;
grant all on public.pay_tasas, public.pay_tarifas, public.pay_transferencias, public.pay_historial
  to service_role;

-- ---------------------------------------------------------------------------------------------
-- Private helpers

-- A transfer code: "CP-" and eight characters from an alphabet with no 0, 1, I or O.
-- pay_crear_transferencia retries until the code is new.
create function public._pay_codigo() returns text
language plpgsql security definer set search_path = public as $$
declare
  v_alfabeto constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_codigo text := 'CP-';
  v_i integer;
begin
  for v_i in 1 .. 8 loop
    if v_i = 5 then
      v_codigo := v_codigo || '-';
    end if;
    -- 256 is a multiple of 32, so taking a byte modulo 32 is not biased.
    v_codigo := v_codigo || substr(v_alfabeto,
      1 + (('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 2))::bit(8)::bigint % 32)::integer, 1);
  end loop;
  return v_codigo;
end;
$$;

-- The money of a transfer, in integers. The only place these formulas are written.
--   comision = fijo + ceil(monto * bps / 10000)        (origin currency, cents)
--   neto     = monto - comision                         (must be > 0)
--   USD      = floor(neto * tasa)                       (cents out, tasa is the plain rate)
--   SATS     = floor(neto / 100 * tasa)                 (tasa is sats per one whole unit)
-- The rate is numeric, so the arithmetic is exact.
create function public._pay_calcular(p_monto integer, p_entrega public.pay_entrega, p_tasa numeric,
  p_moneda_destino public.pay_moneda)
returns table (comision integer, neto integer, monto_destino bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_fijo integer;
  v_bps integer;
  v_comision bigint;
  v_neto bigint;
  v_destino numeric;
begin
  select t.fijo_centavos, t.porcentaje_bps into v_fijo, v_bps
  from public.pay_tarifas t where t.entrega = p_entrega;
  if not found then
    raise exception '%', 'DATOS_INVALIDOS: Esa forma de entrega no tiene tarifa.' using errcode = 'P0001';
  end if;

  -- Integer ceiling division: (x + 9999) / 10000 rounds x / 10000 up.
  v_comision := v_fijo + (p_monto::bigint * v_bps + 9999) / 10000;
  v_neto := p_monto - v_comision;
  if v_neto <= 0 then
    raise exception '%', 'DATOS_INVALIDOS: La comisión deja un monto neto de cero o menos.' using errcode = 'P0001';
  end if;

  if p_moneda_destino = 'SATS' then
    v_destino := floor(v_neto * p_tasa / 100);
  else
    v_destino := floor(v_neto * p_tasa);
  end if;

  return query select v_comision::integer, v_neto::integer, v_destino::bigint;
end;
$$;

-- Writes one state change: the new state, its timestamp, the history row and the audit row.
create function public._pay_avanzar(p_transferencia uuid, p_actor uuid, p_hacia public.pay_estado,
  p_detalle text, p_motivo text)
returns public.pay_transferencias
language plpgsql security definer set search_path = public as $$
declare
  v_transferencia public.pay_transferencias;
begin
  update public.pay_transferencias set
    estado = p_hacia,
    procesando_en = case when p_hacia = 'procesando' then now() else procesando_en end,
    completada_en = case when p_hacia = 'completada' then now() else completada_en end,
    fallida_en = case when p_hacia = 'fallida' then now() else fallida_en end,
    cancelada_en = case when p_hacia = 'cancelada' then now() else cancelada_en end,
    motivo = coalesce(p_motivo, motivo)
  where id = p_transferencia
  returning * into v_transferencia;

  insert into public.pay_historial (transferencia_id, estado, detalle) values (p_transferencia, p_hacia, p_detalle);

  insert into public.auditoria (actor_id, accion, entidad, entidad_id, detalle)
  values (p_actor, 'transferencia.' || p_hacia, 'transferencia', p_transferencia::text,
          jsonb_build_object('hacia', p_hacia));

  return v_transferencia;
end;
$$;

-- True for an administrator. A null actor is never one.
create function public._pay_es_admin(p_actor uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select u.es_admin from public.usuarios u where u.id = p_actor), false);
$$;

-- ---------------------------------------------------------------------------------------------
-- Transfers: creation

-- Idempotent on (remitente, clave): the same key returns the transfer it made, whatever the amounts.
-- The amounts are recomputed here; a commission or destination amount that differs is refused.
create function public.pay_crear_transferencia(
  p_remitente uuid,
  p_destinatario_nombre text,
  p_destinatario_contacto text,
  p_moneda_origen public.pay_moneda,
  p_monto_origen integer,
  p_moneda_destino public.pay_moneda,
  p_entrega public.pay_entrega,
  p_tasa numeric,
  p_tasa_fuente text,
  p_comision integer,
  p_monto_destino bigint,
  p_nota text,
  p_clave text
) returns public.pay_transferencias
language plpgsql security definer set search_path = public as $$
declare
  v_transferencia public.pay_transferencias;
  v_existente public.pay_transferencias;
  v_nombre text;
  v_contacto text;
  v_clave_contacto text;
  v_nota text;
  v_fuente text;
  v_tasa numeric;
  v_comision integer;
  v_neto integer;
  v_destino bigint;
  v_destinatario uuid;
  v_codigo text;
  v_i integer;
begin
  if p_remitente is null or p_clave is null or char_length(btrim(p_clave)) = 0 or char_length(p_clave) > 100 then
    raise exception '%', 'DATOS_INVALIDOS: Faltan datos para crear la transferencia.' using errcode = 'P0001';
  end if;

  -- Locks the sender, so two sends with one key run one after the other.
  perform 1 from public.usuarios u where u.id = p_remitente for update;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos tu cuenta.' using errcode = 'P0001';
  end if;

  select * into v_existente from public.pay_transferencias
  where remitente_id = p_remitente and clave_idempotencia = p_clave;
  if found then
    return v_existente;
  end if;

  if p_monto_origen is null or p_monto_origen not between 100 and 300000 then
    raise exception '%', 'DATOS_INVALIDOS: El monto tiene que estar entre $1.00 y $3,000.00.' using errcode = 'P0001';
  end if;
  if p_moneda_origen is null or p_moneda_origen not in ('USD', 'EUR') then
    raise exception '%', 'DATOS_INVALIDOS: La moneda de origen tiene que ser USD o EUR.' using errcode = 'P0001';
  end if;
  if p_moneda_destino is null or p_moneda_destino not in ('USD', 'SATS') then
    raise exception '%', 'DATOS_INVALIDOS: La moneda de destino tiene que ser USD o SATS.' using errcode = 'P0001';
  end if;
  if p_entrega is null then
    raise exception '%', 'DATOS_INVALIDOS: Elegí cómo se entrega el dinero.' using errcode = 'P0001';
  end if;
  if p_moneda_destino = 'SATS' and p_entrega <> 'lightning' then
    raise exception '%', 'DATOS_INVALIDOS: Los sats solo se entregan por Lightning.' using errcode = 'P0001';
  end if;
  if p_moneda_destino = 'USD' and p_entrega = 'lightning' then
    raise exception '%', 'DATOS_INVALIDOS: Los dólares no se entregan por Lightning. Elegí efectivo o cuenta.' using errcode = 'P0001';
  end if;

  v_nombre := public._texto_valido(p_destinatario_nombre, 2, 80, 'El nombre del destinatario tiene que tener entre 2 y 80 caracteres.');
  v_contacto := public._texto_valido(p_destinatario_contacto, 3, 120, 'El contacto del destinatario tiene que tener entre 3 y 120 caracteres.');
  v_nota := public._texto_valido(p_nota, 0, 200, 'La nota no puede pasar de 200 caracteres.');
  v_fuente := public._texto_valido(p_tasa_fuente, 1, 80, 'Indicá de dónde sale la tasa.');

  -- An email is compared in lower case; a phone is compared as its digits only.
  if position('@' in v_contacto) > 0 then
    v_clave_contacto := lower(v_contacto);
    if v_clave_contacto !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then
      raise exception '%', 'DATOS_INVALIDOS: El correo del destinatario no es válido.' using errcode = 'P0001';
    end if;
  else
    v_clave_contacto := regexp_replace(v_contacto, '\D', '', 'g');
    if char_length(v_clave_contacto) not between 8 and 15 then
      raise exception '%', 'DATOS_INVALIDOS: El teléfono del destinatario no es válido.' using errcode = 'P0001';
    end if;
  end if;

  if p_tasa is null or round(p_tasa, 8) <= 0 then
    raise exception '%', 'DATOS_INVALIDOS: La tasa tiene que ser mayor que cero.' using errcode = 'P0001';
  end if;
  v_tasa := round(p_tasa, 8);
  -- USD to USD is always 1; EUR to USD is the stored rate.
  if p_moneda_origen = 'USD' and p_moneda_destino = 'USD' and v_tasa <> 1 then
    raise exception '%', 'DATOS_INVALIDOS: La tasa no coincide con la tasa vigente.' using errcode = 'P0001';
  end if;
  if p_moneda_origen = 'EUR' and p_moneda_destino = 'USD'
     and v_tasa is distinct from (select t.tasa from public.pay_tasas t where t.par = 'EUR/USD') then
    raise exception '%', 'DATOS_INVALIDOS: La tasa no coincide con la tasa vigente.' using errcode = 'P0001';
  end if;

  select c.comision, c.neto, c.monto_destino into v_comision, v_neto, v_destino
  from public._pay_calcular(p_monto_origen, p_entrega, v_tasa, p_moneda_destino) c;

  if v_destino <= 0 then
    raise exception '%', 'DATOS_INVALIDOS: Con estos montos el destinatario recibiría cero.' using errcode = 'P0001';
  end if;
  if p_comision is null or p_monto_destino is null
     or p_comision <> v_comision or p_monto_destino <> v_destino then
    raise exception '%', 'DATOS_INVALIDOS: Los montos no coinciden con el cálculo del servidor.' using errcode = 'P0001';
  end if;

  select u.id into v_destinatario from public.usuarios u where lower(u.telefono) = v_clave_contacto limit 1;
  if v_destinatario = p_remitente then
    raise exception '%', 'NO_PERMITIDO: No podés enviarte dinero a vos mismo.' using errcode = 'P0001';
  end if;

  for v_i in 1 .. 20 loop
    v_codigo := public._pay_codigo();
    exit when not exists (select 1 from public.pay_transferencias t where t.codigo = v_codigo);
  end loop;

  insert into public.pay_transferencias (codigo, remitente_id, destinatario_nombre, destinatario_contacto,
    destinatario_id, moneda_origen, monto_origen_centavos, comision_centavos, neto_centavos, tasa, tasa_fuente,
    moneda_destino, monto_destino, entrega, estado, nota, clave_idempotencia)
  values (v_codigo, p_remitente, v_nombre, v_contacto, v_destinatario, p_moneda_origen, p_monto_origen,
    v_comision, v_neto, v_tasa, v_fuente, p_moneda_destino, v_destino, p_entrega, 'creada', v_nota, p_clave)
  returning * into v_transferencia;

  insert into public.pay_historial (transferencia_id, estado, detalle)
  values (v_transferencia.id, 'creada', 'Transferencia creada.');

  insert into public.auditoria (actor_id, accion, entidad, entidad_id, detalle)
  values (p_remitente, 'transferencia.creada', 'transferencia', v_transferencia.id::text,
          jsonb_build_object('hacia', 'creada'));

  return v_transferencia;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Transfers: changes of state. Each one locks the row and checks who asks and what state it is in.

-- The sender, or an administrator, starts processing a transfer that is only created.
create function public.pay_procesar(p_transferencia uuid, p_actor uuid) returns public.pay_transferencias
language plpgsql security definer set search_path = public as $$
declare
  v_transferencia public.pay_transferencias;
begin
  select * into v_transferencia from public.pay_transferencias where id = p_transferencia for update;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa transferencia.' using errcode = 'P0001';
  end if;
  if p_actor is null or (p_actor is distinct from v_transferencia.remitente_id and not public._pay_es_admin(p_actor)) then
    raise exception '%', 'NO_PERMITIDO: Solo quien envía o un administrador puede procesar la transferencia.' using errcode = 'P0001';
  end if;
  if v_transferencia.estado <> 'creada' then
    raise exception '%', 'ESTADO_INVALIDO: Esta transferencia ya no se puede procesar.' using errcode = 'P0001';
  end if;

  return public._pay_avanzar(p_transferencia, p_actor, 'procesando', 'Transferencia en proceso.', null);
end;
$$;

-- The provider pays out: an administrator, or no actor for the simulator. Only a processing transfer completes.
create function public.pay_completar(p_transferencia uuid, p_actor uuid) returns public.pay_transferencias
language plpgsql security definer set search_path = public as $$
declare
  v_transferencia public.pay_transferencias;
begin
  select * into v_transferencia from public.pay_transferencias where id = p_transferencia for update;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa transferencia.' using errcode = 'P0001';
  end if;
  if p_actor is not null and not public._pay_es_admin(p_actor) then
    raise exception '%', 'NO_PERMITIDO: Solo un administrador puede completar la transferencia.' using errcode = 'P0001';
  end if;
  if v_transferencia.estado <> 'procesando' then
    raise exception '%', 'ESTADO_INVALIDO: Solo se completa una transferencia en proceso.' using errcode = 'P0001';
  end if;

  return public._pay_avanzar(p_transferencia, p_actor, 'completada', 'Transferencia completada.', null);
end;
$$;

-- The provider could not pay out: an administrator, or no actor for the simulator. Needs a reason.
create function public.pay_fallar(p_transferencia uuid, p_actor uuid, p_motivo text) returns public.pay_transferencias
language plpgsql security definer set search_path = public as $$
declare
  v_transferencia public.pay_transferencias;
  v_motivo text;
begin
  select * into v_transferencia from public.pay_transferencias where id = p_transferencia for update;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa transferencia.' using errcode = 'P0001';
  end if;
  if p_actor is not null and not public._pay_es_admin(p_actor) then
    raise exception '%', 'NO_PERMITIDO: Solo un administrador puede marcar la transferencia como fallida.' using errcode = 'P0001';
  end if;
  v_motivo := public._texto_valido(p_motivo, 4, 200, 'El motivo tiene que tener entre 4 y 200 caracteres.');
  if v_transferencia.estado not in ('creada', 'procesando') then
    raise exception '%', 'ESTADO_INVALIDO: Esta transferencia ya no se puede marcar como fallida.' using errcode = 'P0001';
  end if;

  return public._pay_avanzar(p_transferencia, p_actor, 'fallida', 'Transferencia fallida: ' || v_motivo, v_motivo);
end;
$$;

-- The sender cancels, and only before the transfer is processed.
create function public.pay_cancelar(p_transferencia uuid, p_actor uuid) returns public.pay_transferencias
language plpgsql security definer set search_path = public as $$
declare
  v_transferencia public.pay_transferencias;
begin
  select * into v_transferencia from public.pay_transferencias where id = p_transferencia for update;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa transferencia.' using errcode = 'P0001';
  end if;
  if p_actor is null or p_actor is distinct from v_transferencia.remitente_id then
    raise exception '%', 'NO_PERMITIDO: Solo quien envió la transferencia puede cancelarla.' using errcode = 'P0001';
  end if;
  if v_transferencia.estado <> 'creada' then
    raise exception '%', 'ESTADO_INVALIDO: Solo se puede cancelar una transferencia antes de procesarla.' using errcode = 'P0001';
  end if;

  return public._pay_avanzar(p_transferencia, p_actor, 'cancelada', 'Cancelada por quien envió.', null);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Admin view

-- Transfers created in [desde, hasta), per state. EUR amounts are converted with the stored EUR/USD
-- rate, rounded down, as the receiving side is.
create function public.pay_resumen(p_desde timestamptz, p_hasta timestamptz)
returns table (
  estado public.pay_estado,
  cantidad bigint,
  monto_origen_usd_centavos bigint,
  comision_usd_centavos bigint
)
language sql stable security definer set search_path = public as $$
  select
    t.estado,
    count(*)::bigint,
    (coalesce(sum(case when t.moneda_origen = 'EUR' then floor(t.monto_origen_centavos * e.tasa)
                       else t.monto_origen_centavos end), 0))::bigint,
    (coalesce(sum(case when t.moneda_origen = 'EUR' then floor(t.comision_centavos * e.tasa)
                       else t.comision_centavos end), 0))::bigint
  from public.pay_transferencias t
  cross join (select tasa from public.pay_tasas where par = 'EUR/USD') e
  where t.creada_en >= p_desde and t.creada_en < p_hasta
  group by t.estado;
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants: only the server (service role) runs these. Helpers run as the owner only.

revoke execute on function public.pay_crear_transferencia(uuid, text, text, public.pay_moneda, integer,
  public.pay_moneda, public.pay_entrega, numeric, text, integer, bigint, text, text) from public, anon, authenticated;
revoke execute on function public.pay_procesar(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.pay_completar(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.pay_fallar(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.pay_cancelar(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.pay_resumen(timestamptz, timestamptz) from public, anon, authenticated;

grant execute on function public.pay_crear_transferencia(uuid, text, text, public.pay_moneda, integer,
  public.pay_moneda, public.pay_entrega, numeric, text, integer, bigint, text, text) to service_role;
grant execute on function public.pay_procesar(uuid, uuid) to service_role;
grant execute on function public.pay_completar(uuid, uuid) to service_role;
grant execute on function public.pay_fallar(uuid, uuid, text) to service_role;
grant execute on function public.pay_cancelar(uuid, uuid) to service_role;
grant execute on function public.pay_resumen(timestamptz, timestamptz) to service_role;

revoke execute on function public._pay_codigo() from public, anon, authenticated, service_role;
revoke execute on function public._pay_calcular(integer, public.pay_entrega, numeric, public.pay_moneda)
  from public, anon, authenticated, service_role;
revoke execute on function public._pay_avanzar(uuid, uuid, public.pay_estado, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public._pay_es_admin(uuid) from public, anon, authenticated, service_role;
