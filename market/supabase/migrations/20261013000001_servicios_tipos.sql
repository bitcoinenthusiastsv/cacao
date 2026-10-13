-- CacaoMarket, services: new enum values and new enums, and nothing else.
--
-- A value added with `alter type ... add value` cannot be used in the transaction that adds it, so
-- the tables and functions that use these values live in the next migration.

alter type public.estado_orden add value 'acordada';
alter type public.estado_orden add value 'hecha';
alter type public.estado_orden add value 'cancelada';

alter type public.resultado_disputa add value 'corresponde_pagar';
alter type public.resultado_disputa add value 'no_corresponde_pagar';

-- A job is an order of type 'servicio'; product orders are 'productos' (the default).
create type public.tipo_orden as enum ('productos', 'servicio');
create type public.tipo_precio as enum ('fijo', 'cotizar');
create type public.estado_necesidad as enum ('abierta', 'asignada', 'cancelada', 'vencida');
create type public.estado_cotizacion as enum ('solicitada', 'ofrecida', 'aceptada', 'rechazada', 'retirada', 'vencida');
