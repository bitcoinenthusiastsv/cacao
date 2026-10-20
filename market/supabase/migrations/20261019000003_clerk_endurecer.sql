-- Hardens the Clerk link. Applied after 20261019000002_clerk.sql, which is already in production.
--
-- The server passes a phone or an email to vincular_clerk only when Clerk has verified it. Still, the
-- link by contact must not take a row that does not belong to that person: an administrator row, or a
-- row whose contact has another shape. Also, two first sign-ins with the same new phone must not fail.

-- Links a Clerk user to its usuarios row, creating the row when none matches. Called by the server
-- with the service role after Clerk sign-in. The phone is kept as digits only, and the email in lower case.
create or replace function public.vincular_clerk(p_clerk_id text, p_telefono text, p_correo text, p_nombre text)
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
  -- Administrator rows are never linked this way. A phone matches only a row whose contact looks like a
  -- phone, and an email only a row whose contact holds an @, so a uuid or an email never matches digits.
  -- The lock keeps two sign-ins from linking the same row.
  select u.id into v_id from public.usuarios u
  where u.clerk_id is null
    and u.es_admin = false
    and ((v_digitos <> '' and u.telefono ~ '^\+?[0-9 ()-]+$' and regexp_replace(u.telefono, '\D', '', 'g') = v_digitos)
      or (v_correo <> '' and u.telefono like '%@%' and lower(u.telefono) = v_correo))
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

  -- A concurrent sign-in may take the same Clerk id or the same contact after the check above. Any
  -- unique violation then does nothing, so no error is raised; the insert returns no row instead.
  insert into public.usuarios (clerk_id, telefono, nombre)
  values (p_clerk_id, v_telefono, v_nombre)
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    -- Same Clerk id inserted first: read it back. Otherwise the contact was taken: use the Clerk id.
    select u.id into v_id from public.usuarios u where u.clerk_id = p_clerk_id;
  end if;

  if v_id is null then
    insert into public.usuarios (clerk_id, telefono, nombre)
    values (p_clerk_id, p_clerk_id, v_nombre)
    on conflict do nothing
    returning id into v_id;
  end if;

  if v_id is null then
    raise exception '%', 'DATOS_INVALIDOS: No se pudo crear la cuenta.' using errcode = 'P0001';
  end if;

  return v_id;
end;
$$;

-- Same grants as before: the helper is for the server only.
revoke all on function public.vincular_clerk(text, text, text, text) from public, anon, authenticated;
grant execute on function public.vincular_clerk(text, text, text, text) to service_role;

-- Sign-in no longer goes through Supabase Auth, so no auth.users row is created. The trigger that
-- gave every new auth user a usuarios row, with the auth phone or email, is removed with its function.
drop trigger if exists al_crear_usuario on auth.users;
drop function if exists public.crear_usuario();
