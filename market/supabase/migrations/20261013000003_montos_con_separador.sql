-- Amounts inside notices read "$2100.00". People read "$2,100.00", as on every screen.
create or replace function public._usd_texto(p_centavos integer) returns text
language plpgsql immutable security definer set search_path = public as $$
begin
  return '$' || trim(to_char(p_centavos / 100.0, 'FM999,999,990.00'));
end;
$$;
