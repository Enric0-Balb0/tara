-- Preparazione di un progetto Supabase nuovo, da eseguire una volta prima della prima
-- migrazione (SQL editor di Supabase). Idempotente.
--
-- Le migrazioni creano unaccent e pg_trgm con CREATE EXTENSION IF NOT EXISTS: senza questo
-- passo finirebbero in `public` (avviso di sicurezza di Supabase). Già presenti qui, le
-- migrazioni non fanno nulla, e il search_path del ruolo postgres ("$user", public,
-- extensions) le trova lo stesso.

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;
