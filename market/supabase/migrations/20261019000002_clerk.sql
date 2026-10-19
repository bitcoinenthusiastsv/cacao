-- Sign-in with Clerk for CacaoMarket and Cacao Pay.
--
-- Clerk issues the session JWT and Supabase accepts it through third-party auth. Its `sub` claim is the
-- Clerk user id ('user_...'), which is not a uuid. So the uuid of every usuarios row stays as it is, and
-- clerk_id links the row to its Clerk user. Rows no longer need an auth.users row behind them.
-- Every helper and policy that used auth.uid() now calls public.usuario_actual() instead.

-- The link to Clerk. Null for rows created before the switch, until they sign in once.
alter table public.usuarios add column clerk_id text unique;

-- The uuid is no longer tied to auth.users. New rows get their own uuid.
alter table public.usuarios drop constraint if exists usuarios_id_fkey;
alter table public.usuarios alter column id set default gen_random_uuid();

-- The usuarios row of the Clerk user in this session, or null when there is no session.
create or replace function public.usuario_actual() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.usuarios where clerk_id = (auth.jwt() ->> 'sub');
$$;

-- Helpers used by the policies. Same definitions as before, with usuario_actual() for auth.uid().
create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select es_admin from public.usuarios where id = public.usuario_actual()), false);
$$;

create or replace function public.mi_negocio_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.negocios where usuario_id = public.usuario_actual();
$$;

-- Buyer of the order, owner of the business that sells it, or an administrator.
create or replace function public.puede_ver_orden(p_orden_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.ordenes o
    where o.id = p_orden_id
      and (o.comprador_id = public.usuario_actual() or o.negocio_id = public.mi_negocio_id() or public.es_admin())
  );
$$;

-- Policies that compared with auth.uid(). Each one is recreated with the same visibility rule.
drop policy if exists usuarios_leer on public.usuarios;
create policy usuarios_leer on public.usuarios for select to authenticated
  using (
    id = public.usuario_actual()
    or public.es_admin()
    or exists (
      select 1 from public.ordenes o join public.negocios n on n.id = o.negocio_id
      where (o.comprador_id = usuarios.id and n.usuario_id = public.usuario_actual())
         or (n.usuario_id = usuarios.id and o.comprador_id = public.usuario_actual())
    )
  );

drop policy if exists negocios_leer on public.negocios;
create policy negocios_leer on public.negocios for select to anon, authenticated
  using (estado = 'aprobado' or usuario_id = public.usuario_actual() or public.es_admin());

drop policy if exists ordenes_leer on public.ordenes;
create policy ordenes_leer on public.ordenes for select to authenticated
  using (comprador_id = public.usuario_actual() or negocio_id = public.mi_negocio_id() or public.es_admin());

drop policy if exists avisos_leer on public.avisos;
create policy avisos_leer on public.avisos for select to authenticated
  using (usuario_id = public.usuario_actual());

drop policy if exists necesidades_leer on public.necesidades;
create policy necesidades_leer on public.necesidades for select to anon, authenticated
  using ((estado = 'abierta' and not oculta) or usuario_id = public.usuario_actual() or public.es_admin());

-- Quotes are private: the client, the shop that made them, and admins.
drop policy if exists cotizaciones_leer on public.cotizaciones;
create policy cotizaciones_leer on public.cotizaciones for select to authenticated
  using (cliente_id = public.usuario_actual() or negocio_id = public.mi_negocio_id() or public.es_admin());

-- Links a Clerk user to its usuarios row, creating the row when none matches. Called by the server
-- with the service role after Clerk sign-in. The phone is kept as digits only, and the email in lower case.
create function public.vincular_clerk(p_clerk_id text, p_telefono text, p_correo text, p_nombre text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_digitos text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_correo text := lower(btrim(coalesce(p_correo, '')));
  v_nombre text := left(btrim(coalesce(p_nombre, '')), 80);
  v_telefono text;
begin
  if btrim(coalesce(p_clerk_id, '')) = '' then
    raise exception '%', 'DATOS_INVALIDOS: Falta el identificador de la cuenta.' using errcode = 'P0001';
  end if;

  -- 1. The Clerk user already has a row: return it, and fill the name if it is still empty.
  select u.id into v_id from public.usuarios u where u.clerk_id = p_clerk_id;
  if found then
    if v_nombre <> '' then
      update public.usuarios set nombre = v_nombre where id = v_id and nombre = '';
    end if;
    return v_id;
  end if;

  -- 2. A row created before Clerk, with the same phone or email, that no Clerk user owns yet.
  -- The lock keeps two sign-ins from linking the same row.
  select u.id into v_id from public.usuarios u
  where u.clerk_id is null
    and ((v_digitos <> '' and regexp_replace(u.telefono, '\D', '', 'g') = v_digitos)
      or (v_correo <> '' and lower(u.telefono) = v_correo))
  order by u.creado_en, u.id
  limit 1
  for update;
  if found then
    update public.usuarios
      set clerk_id = p_clerk_id,
          nombre = case when nombre = '' then v_nombre else nombre end
      where id = v_id;
    return v_id;
  end if;

  -- 3. No row matches: create one. The contact column is unique, so another row may hold the
  -- first choice already; then the Clerk id stands in for it.
  v_telefono := coalesce(nullif(v_digitos, ''), nullif(v_correo, ''), p_clerk_id);
  if exists (select 1 from public.usuarios u where u.telefono = v_telefono) then
    v_telefono := p_clerk_id;
  end if;

  -- A concurrent sign-in with the same Clerk id may insert first; then the row is read back.
  insert into public.usuarios (clerk_id, telefono, nombre)
  values (p_clerk_id, v_telefono, v_nombre)
  on conflict (clerk_id) do nothing
  returning id into v_id;

  if v_id is null then
    select u.id into v_id from public.usuarios u where u.clerk_id = p_clerk_id;
  end if;

  return v_id;
end;
$$;

-- Grants. The helper can be called by the browser's policies (anon and authenticated included), so
-- it is open to them. The linking function is for the server only.
revoke execute on function public.usuario_actual() from public;
grant execute on function public.usuario_actual() to anon, authenticated, service_role;

revoke all on function public.vincular_clerk(text, text, text, text) from public, anon, authenticated;
grant execute on function public.vincular_clerk(text, text, text, text) to service_role;
