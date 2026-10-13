-- A hosted Supabase project grants every privilege on new tables in `public` to `anon` and
-- `authenticated` by default; the local stack grants nothing. The schema migration only added
-- grants, so on a hosted project the default ones stayed underneath: a signed-in seller could read
-- `ordenes.codigo_entrega`, and sessions held write privileges that only row-level security stopped.
-- Start from nothing on both kinds of project, then give back exactly the reads the app needs.

revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

grant select on public.categorias, public.productos, public.resenas to anon, authenticated;
grant select on public.lineas_orden, public.mensajes, public.disputas, public.avisos,
  public.auditoria to authenticated;

-- Orders: every column except `codigo_entrega` (only the server hands it out, and only to the buyer).
grant select (id, numero, comprador_id, negocio_id, estado, total_usd_centavos, total_sats,
  cotizacion_usd_btc, modo_entrega, comision_teorica_sats, creada_en, pagada_en, lista_en, entregada_en,
  cerrada_en, expirada_en, disputada_en, resuelta_en) on public.ordenes to authenticated;

-- Shops: never the encrypted payment credential.
grant select (id, usuario_id, nombre, descripcion, ubicacion, estado, abierto, tipo_proveedor_pago,
  lightning_address, creado_en) on public.negocios to anon, authenticated;

-- Payment requests: never the provider reference or the verify URL.
grant select (id, orden_id, proveedor, bolt11, destino, estado, expira_en, pagado_en)
  on public.cobros to authenticated;

-- Profiles: never the phone or email.
grant select (id, nombre, es_admin, creado_en) on public.usuarios to authenticated;
