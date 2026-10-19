-- Cacao Media: the locked text of the paid stories.
--
-- One row per story. The html is the part after the gate marker, already rendered to HTML, so the
-- repository no longer holds it. Only server code reads it, with the service role, and only after it
-- checks a valid pass or paid access. scripts/subir-cerrado.mjs fills the table from src/data/cerrado.json.

create table public.media_cerrado (
  slug text primary key,
  html text not null,
  actualizado_en timestamptz not null default now()
);

alter table public.media_cerrado enable row level security;

-- No policies: with row-level security on and no grants to the browser roles, nothing else can read it.
revoke all on table public.media_cerrado from public, anon, authenticated;
grant select, insert, update, delete on table public.media_cerrado to service_role;
