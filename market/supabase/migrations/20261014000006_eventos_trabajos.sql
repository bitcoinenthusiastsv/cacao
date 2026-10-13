-- Job funnel steps for CacaoMarket (orders 6–10). Product steps 1–5 stay unchanged.

insert into public.eventos_permitidos (sitio, nombre, orden, etiqueta) values
  ('market', 'vista_servicio', 6, 'Vio un servicio'),
  ('market', 'acordo_trabajo', 7, 'Acordó o contrató el trabajo'),
  ('market', 'trabajo_hecho', 8, 'Marcó el trabajo hecho'),
  ('market', 'vio_pago_trabajo', 9, 'Abrió la pantalla de pago del trabajo'),
  ('market', 'pago_trabajo', 10, 'Pagó el trabajo')
on conflict do nothing;
