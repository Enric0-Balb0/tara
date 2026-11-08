-- Preparazione di un progetto Supabase nuovo, da eseguire una volta come postgres prima
-- della prima migrazione (SQL editor di Supabase o MCP). Idempotente.
--
-- Le migrazioni creano unaccent e pg_trgm con CREATE EXTENSION IF NOT EXISTS: senza questo
-- passo finirebbero in `public` (avviso di sicurezza di Supabase). Già presenti qui, le
-- migrazioni non fanno nulla, e il search_path del ruolo tara le trova lo stesso.

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Ruolo di backend e migrazioni, proprietario degli oggetti di Tara (come nel
-- docker-compose locale). postgres è membro di supabase_privileged_role: la sua password
-- la cambia solo Supabase, quindi Tara non lo usa. La password di tara la imposta
-- `python -m tara_api.db_role` (services/api), che salva anche il segreto TARA_DATABASE_URL.
-- createrole_self_grant dà a postgres SET su tara, che serve qui sotto per SET ROLE.
set createrole_self_grant to 'set';
do $$
begin
  if not exists (select from pg_roles where rolname = 'tara') then
    create role tara login;
  end if;
end
$$;
reset createrole_self_grant;

alter role tara set search_path = "$user", public, extensions;
grant usage, create on schema public to tara;
-- Senza USAGE sullo schema, similarity() di pg_trgm non si risolve e la ricerca dà 500.
grant usage on schema extensions to tara;

-- Le tabelle create dalle migrazioni restano leggibili da postgres (pannello, MCP).
set role tara;
alter default privileges in schema public grant all on tables to postgres;
alter default privileges in schema public grant all on sequences to postgres;
reset role;
