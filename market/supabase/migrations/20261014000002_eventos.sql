-- Shared funnel analytics for Cacao Media, CacaoMarket and Cacao Pay.
--
-- Same rules as the other migrations: the browser never writes here. The server records events with
-- registrar_evento (service role) and reads the funnel with embudo. No grant reaches anon or
-- authenticated, and row-level security is on with no policy.

create table public.eventos_permitidos (
  sitio text not null check (sitio in ('media', 'market', 'pay')),
  nombre text not null check (char_length(nombre) between 1 and 60),
  orden smallint not null check (orden > 0),
  etiqueta text not null check (char_length(etiqueta) between 1 and 80),
  primary key (sitio, nombre),
  unique (sitio, orden)
);

insert into public.eventos_permitidos (sitio, nombre, orden, etiqueta) values
  ('media', 'vista_historia', 1, 'Abrió una historia de pago'),
  ('media', 'vio_muro', 2, 'Llegó al muro de pago'),
  ('media', 'creo_cobro', 3, 'Pidió la factura'),
  ('media', 'pago', 4, 'Pagó'),
  ('media', 'leyo_completa', 5, 'Leyó hasta el final'),
  ('market', 'vista_producto', 1, 'Vio un producto'),
  ('market', 'agrego_carrito', 2, 'Agregó al carrito'),
  ('market', 'inicio_pedido', 3, 'Hizo el pedido'),
  ('market', 'vio_pago', 4, 'Abrió la pantalla de pago'),
  ('market', 'pago', 5, 'Pagó'),
  ('pay', 'vio_cotizacion', 1, 'Cotizó un envío'),
  ('pay', 'inicio_envio', 2, 'Empezó un envío'),
  ('pay', 'creo_envio', 3, 'Confirmó el envío'),
  ('pay', 'envio_completado', 4, 'El envío se completó')
on conflict do nothing;

create table public.eventos (
  id bigint primary key generated always as identity,
  sitio text not null,
  nombre text not null,
  -- Random id kept by the browser for one visit.
  sesion text not null check (char_length(sesion) between 8 and 64),
  usuario_id uuid references public.usuarios (id) on delete set null,
  ruta text not null default '' check (char_length(ruta) <= 200),
  objeto text check (char_length(objeto) <= 80),
  valor_usd_centavos integer check (valor_usd_centavos is null or valor_usd_centavos >= 0),
  creado_en timestamptz not null default now(),
  -- The start of the hour the event happened in. Stored because date_trunc on timestamptz is not
  -- immutable, so it cannot be used inside the unique index below.
  hora timestamptz not null default date_trunc('hour', now()),
  foreign key (sitio, nombre) references public.eventos_permitidos (sitio, nombre)
);
create index eventos_sitio_fecha on public.eventos (sitio, creado_en);

-- One row per event, session and object per hour. A refresh inside the hour inserts nothing.
create unique index eventos_una_vez_por_hora
  on public.eventos (sitio, nombre, sesion, coalesce(objeto, ''), hora);

alter table public.eventos_permitidos enable row level security;
alter table public.eventos enable row level security;

revoke all on public.eventos_permitidos, public.eventos from anon, authenticated;
grant all on public.eventos_permitidos, public.eventos to service_role;

-- ---------------------------------------------------------------------------------------------
-- Functions

create function public.registrar_evento(
  p_sitio text,
  p_nombre text,
  p_sesion text,
  p_usuario uuid,
  p_ruta text,
  p_objeto text,
  p_valor integer
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ahora timestamptz := now();
  v_objeto text := nullif(btrim(coalesce(p_objeto, '')), '');
  v_ruta text := coalesce(p_ruta, '');
begin
  if not exists (select 1 from public.eventos_permitidos e where e.sitio = p_sitio and e.nombre = p_nombre) then
    raise exception '%', 'DATOS_INVALIDOS: Ese evento no está permitido.' using errcode = 'P0001';
  end if;
  if p_sesion is null or char_length(p_sesion) not between 8 and 64 then
    raise exception '%', 'DATOS_INVALIDOS: La sesión del evento no es válida.' using errcode = 'P0001';
  end if;
  if char_length(v_ruta) > 200 then
    raise exception '%', 'DATOS_INVALIDOS: La ruta no puede pasar de 200 caracteres.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(v_objeto, '')) > 80 then
    raise exception '%', 'DATOS_INVALIDOS: El objeto no puede pasar de 80 caracteres.' using errcode = 'P0001';
  end if;
  if p_valor is not null and p_valor < 0 then
    raise exception '%', 'DATOS_INVALIDOS: El valor no puede ser negativo.' using errcode = 'P0001';
  end if;

  -- A user id the database does not know (a session that was deleted) is stored as no user.
  insert into public.eventos (sitio, nombre, sesion, usuario_id, ruta, objeto, valor_usd_centavos, creado_en, hora)
  values (p_sitio, p_nombre, p_sesion,
    (select u.id from public.usuarios u where u.id = p_usuario),
    v_ruta, v_objeto, p_valor, v_ahora, date_trunc('hour', v_ahora))
  on conflict do nothing;
end;
$$;

-- One row per allowed event of the site, in funnel order. Counts only events in [desde, hasta).
create function public.embudo(p_sitio text, p_desde timestamptz, p_hasta timestamptz)
returns table (
  nombre text,
  etiqueta text,
  orden smallint,
  sesiones bigint,
  eventos bigint,
  valor_usd_centavos bigint
)
language sql stable security definer set search_path = public as $$
  select
    p.nombre,
    p.etiqueta,
    p.orden,
    count(distinct e.sesion)::bigint,
    count(e.id)::bigint,
    coalesce(sum(e.valor_usd_centavos), 0)::bigint
  from public.eventos_permitidos p
  left join public.eventos e
    on e.sitio = p.sitio
   and e.nombre = p.nombre
   and e.creado_en >= p_desde
   and e.creado_en < p_hasta
  where p.sitio = p_sitio
  group by p.nombre, p.etiqueta, p.orden
  order by p.orden;
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants: only the server (service role) runs these.

revoke execute on function public.registrar_evento(text, text, text, uuid, text, text, integer)
  from public, anon, authenticated;
revoke execute on function public.embudo(text, timestamptz, timestamptz) from public, anon, authenticated;

grant execute on function public.registrar_evento(text, text, text, uuid, text, text, integer) to service_role;
grant execute on function public.embudo(text, timestamptz, timestamptz) to service_role;
