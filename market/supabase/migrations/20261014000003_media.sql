-- Cacao Media: anonymous readers, paid-story invoices and access.
--
-- A reader is an anonymous browser. An invoice is a simulated Lightning request for one story; paying
-- it gives permanent access to that story. Payments are simulated: nothing here moves money.
-- Same rules as the other migrations: the browser never writes here, and every grant is explicit.

create table public.media_lectores (
  id uuid primary key default gen_random_uuid(),
  creado_en timestamptz not null default now(),
  visto_en timestamptz not null default now()
);

create table public.media_cobros (
  id uuid primary key default gen_random_uuid(),
  lector_id uuid not null references public.media_lectores (id) on delete cascade,
  slug text not null check (char_length(slug) between 1 and 120),
  titulo text not null check (char_length(titulo) <= 200),
  precio_sats integer not null check (precio_sats > 0),
  cotizacion_usd_btc numeric(14, 2) not null check (cotizacion_usd_btc > 0),
  precio_usd_centavos integer not null check (precio_usd_centavos > 0),
  -- Simulated invoice: "lnsim1" and 40 lower-case hex characters.
  factura text not null unique check (factura ~ '^lnsim1[0-9a-f]{40}$'),
  estado public.media_estado_cobro not null default 'pendiente',
  expira_en timestamptz not null,
  creado_en timestamptz not null default now(),
  pagada_en timestamptz,
  cerrada_en timestamptz,
  motivo text check (motivo is null or char_length(motivo) <= 200)
);
create index media_cobros_lector_historia on public.media_cobros (lector_id, slug, estado);
create index media_cobros_creado on public.media_cobros (creado_en);

-- Permanent access to one story. One per reader and story; the invoice that paid it is unique too.
create table public.media_accesos (
  id uuid primary key default gen_random_uuid(),
  lector_id uuid not null references public.media_lectores (id) on delete cascade,
  slug text not null check (char_length(slug) between 1 and 120),
  cobro_id uuid not null unique references public.media_cobros (id),
  creado_en timestamptz not null default now(),
  unique (lector_id, slug)
);

alter table public.media_lectores enable row level security;
alter table public.media_cobros enable row level security;
alter table public.media_accesos enable row level security;

revoke all on public.media_lectores, public.media_cobros, public.media_accesos from anon, authenticated;
grant all on public.media_lectores, public.media_cobros, public.media_accesos to service_role;

-- ---------------------------------------------------------------------------------------------
-- Readers

-- Null creates a reader. An unknown id creates a new one (the browser keeps the id it gets back).
-- A known id only updates visto_en.
create function public.media_lector(p_lector uuid) returns public.media_lectores
language plpgsql security definer set search_path = public as $$
declare
  v_lector public.media_lectores;
begin
  if p_lector is not null then
    update public.media_lectores set visto_en = now() where id = p_lector
    returning * into v_lector;
    if found then
      return v_lector;
    end if;
  end if;

  insert into public.media_lectores default values returning * into v_lector;
  return v_lector;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Invoices

-- Returns the live invoice for this reader and story, or makes a new one. Locks the reader so two
-- requests at once cannot make two live invoices.
create function public.media_crear_cobro(
  p_lector uuid,
  p_slug text,
  p_titulo text,
  p_precio_sats integer,
  p_cotizacion numeric,
  p_segundos integer default 300
) returns public.media_cobros
language plpgsql security definer set search_path = public as $$
declare
  v_slug text := btrim(coalesce(p_slug, ''));
  v_titulo text;
  v_cotizacion numeric := round(coalesce(p_cotizacion, 0), 2);
  v_cobro public.media_cobros;
begin
  if p_lector is null then
    raise exception '%', 'NO_ENCONTRADA: No encontramos ese lector.' using errcode = 'P0001';
  end if;
  perform 1 from public.media_lectores where id = p_lector for update;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos ese lector.' using errcode = 'P0001';
  end if;

  if char_length(v_slug) not between 1 and 120 then
    raise exception '%', 'DATOS_INVALIDOS: La historia no es válida.' using errcode = 'P0001';
  end if;
  v_titulo := public._texto_valido(p_titulo, 1, 200, 'El título de la historia tiene que tener entre 1 y 200 caracteres.');
  if p_precio_sats is null or p_precio_sats <= 0 then
    raise exception '%', 'DATOS_INVALIDOS: El precio tiene que ser mayor que cero.' using errcode = 'P0001';
  end if;
  if v_cotizacion <= 0 then
    raise exception '%', 'DATOS_INVALIDOS: La cotización tiene que ser mayor que cero.' using errcode = 'P0001';
  end if;
  if p_segundos is null or p_segundos not between 1 and 86400 then
    raise exception '%', 'DATOS_INVALIDOS: El plazo de la factura no es válido.' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.media_accesos a where a.lector_id = p_lector and a.slug = v_slug) then
    raise exception '%', 'ESTADO_INVALIDO: Ya tenés acceso a esta historia.' using errcode = 'P0001';
  end if;

  select * into v_cobro from public.media_cobros
  where lector_id = p_lector and slug = v_slug and estado = 'pendiente' and expira_en > now()
  order by creado_en desc
  limit 1;
  if found then
    return v_cobro;
  end if;

  -- Any invoice still pending here is past its deadline: close it before the new one.
  update public.media_cobros set estado = 'vencida', cerrada_en = now(), motivo = 'Venció el plazo para pagar.'
  where lector_id = p_lector and slug = v_slug and estado = 'pendiente';

  -- Sats to cents, rounded up: the reader pays, so the cents shown are never short.
  insert into public.media_cobros (lector_id, slug, titulo, precio_sats, cotizacion_usd_btc,
    precio_usd_centavos, factura, estado, expira_en)
  values (p_lector, v_slug, v_titulo, p_precio_sats, v_cotizacion,
    ceil(p_precio_sats::numeric * v_cotizacion / 1000000)::integer,
    'lnsim1' || left(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 40),
    'pendiente', now() + make_interval(secs => p_segundos))
  returning * into v_cobro;

  return v_cobro;
end;
$$;

-- Pays an invoice: the reader gets access to the story. Paying a paid invoice again returns it unchanged.
-- A pending invoice past its deadline is refused. It stays pending here: a refusal raises, and a raise
-- rolls back any change, so media_vencer_cobros marks it instead.
create function public.media_pagar_cobro(p_cobro uuid) returns public.media_cobros
language plpgsql security definer set search_path = public as $$
declare
  v_cobro public.media_cobros;
begin
  select * into v_cobro from public.media_cobros where id = p_cobro for update;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa factura.' using errcode = 'P0001';
  end if;
  if v_cobro.estado = 'pagada' then
    return v_cobro;
  end if;
  if v_cobro.estado <> 'pendiente' then
    raise exception '%', 'ESTADO_INVALIDO: Esta factura ya no se puede pagar.' using errcode = 'P0001';
  end if;
  if v_cobro.expira_en <= now() then
    raise exception '%', 'FUERA_DE_PLAZO: Se venció el plazo para pagar esta factura.' using errcode = 'P0001';
  end if;

  update public.media_cobros set estado = 'pagada', pagada_en = now() where id = p_cobro
  returning * into v_cobro;

  insert into public.media_accesos (lector_id, slug, cobro_id) values (v_cobro.lector_id, v_cobro.slug, v_cobro.id);

  return v_cobro;
end;
$$;

-- The payment failed (the simulator says so). Only a pending invoice can fail.
create function public.media_fallar_cobro(p_cobro uuid, p_motivo text) returns public.media_cobros
language plpgsql security definer set search_path = public as $$
declare
  v_motivo text := public._texto_valido(p_motivo, 4, 200, 'El motivo tiene que tener entre 4 y 200 caracteres.');
  v_cobro public.media_cobros;
begin
  select * into v_cobro from public.media_cobros where id = p_cobro for update;
  if not found then
    raise exception '%', 'NO_ENCONTRADA: No encontramos esa factura.' using errcode = 'P0001';
  end if;
  if v_cobro.estado <> 'pendiente' then
    raise exception '%', 'ESTADO_INVALIDO: Solo se puede marcar fallida una factura pendiente.' using errcode = 'P0001';
  end if;

  update public.media_cobros set estado = 'fallida', cerrada_en = now(), motivo = v_motivo where id = p_cobro
  returning * into v_cobro;

  return v_cobro;
end;
$$;

-- Marks every pending invoice past its deadline as vencida. Returns how many. Run it on a schedule
-- and after a refused late payment.
create function public.media_vencer_cobros() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_total integer;
begin
  update public.media_cobros set estado = 'vencida', cerrada_en = now(), motivo = 'Venció el plazo para pagar.'
  where estado = 'pendiente' and expira_en <= now();
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

-- Per story, for the administrator. Counts invoices created in [desde, hasta); money is paid invoices only.
create function public.media_resumen(p_desde timestamptz, p_hasta timestamptz)
returns table (
  slug text,
  titulo text,
  cobros bigint,
  pagadas bigint,
  vencidas bigint,
  fallidas bigint,
  sats bigint,
  usd_centavos bigint
)
language sql stable security definer set search_path = public as $$
  select
    c.slug,
    max(c.titulo),
    count(*)::bigint,
    (count(*) filter (where c.estado = 'pagada'))::bigint,
    (count(*) filter (where c.estado = 'vencida'))::bigint,
    (count(*) filter (where c.estado = 'fallida'))::bigint,
    (coalesce(sum(c.precio_sats) filter (where c.estado = 'pagada'), 0))::bigint,
    (coalesce(sum(c.precio_usd_centavos) filter (where c.estado = 'pagada'), 0))::bigint
  from public.media_cobros c
  where c.creado_en >= p_desde and c.creado_en < p_hasta
  group by c.slug
  order by c.slug;
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants: only the server (service role) runs these. _texto_valido is called from inside them.

revoke execute on function public.media_lector(uuid) from public, anon, authenticated;
revoke execute on function public.media_crear_cobro(uuid, text, text, integer, numeric, integer)
  from public, anon, authenticated;
revoke execute on function public.media_pagar_cobro(uuid) from public, anon, authenticated;
revoke execute on function public.media_fallar_cobro(uuid, text) from public, anon, authenticated;
revoke execute on function public.media_vencer_cobros() from public, anon, authenticated;
revoke execute on function public.media_resumen(timestamptz, timestamptz) from public, anon, authenticated;

grant execute on function public.media_lector(uuid) to service_role;
grant execute on function public.media_crear_cobro(uuid, text, text, integer, numeric, integer) to service_role;
grant execute on function public.media_pagar_cobro(uuid) to service_role;
grant execute on function public.media_fallar_cobro(uuid, text) to service_role;
grant execute on function public.media_vencer_cobros() to service_role;
grant execute on function public.media_resumen(timestamptz, timestamptz) to service_role;
