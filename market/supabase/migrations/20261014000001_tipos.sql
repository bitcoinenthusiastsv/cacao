-- CacaoMarket, Cacao Media and Cacao Pay: new enum values and new enums, and nothing else.
--
-- A value added with `alter type ... add value` cannot be used in the transaction that adds it, so
-- the tables and functions that use these values live in the next migrations.

alter type public.estado_cobro add value 'cancelado';

create type public.media_estado_cobro as enum ('pendiente', 'pagada', 'vencida', 'fallida');

create type public.pay_estado as enum ('creada', 'procesando', 'completada', 'fallida', 'cancelada');
create type public.pay_moneda as enum ('USD', 'EUR', 'SATS');
create type public.pay_entrega as enum ('lightning', 'efectivo', 'cuenta');
