-- ── Fix: backfill_enriched_names_to_tables() GRANT ────────────────────────────
-- Die Funktion darf nur über die Management-API (postgres-Superuser) aufgerufen
-- werden. Ein GRANT TO authenticated ermöglicht es jedem eingeloggten User,
-- alle Tabellen-Namen zu überschreiben — das ist unbeabsichtigt.

REVOKE EXECUTE ON FUNCTION public.backfill_enriched_names_to_tables() FROM authenticated;
