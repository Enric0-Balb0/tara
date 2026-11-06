from tara_api.db.session import get_engine


def test_engine_keeps_few_connections() -> None:
    """Il pooler di Supabase Free dà 15 connessioni per utente, da dividere con migrazioni
    e caricamenti del catalogo: l'API ne tiene poche e non aspetta all'infinito."""
    pool = get_engine().pool

    assert pool.size() == 3  # type: ignore[attr-defined]
    assert pool.timeout() == 10  # type: ignore[attr-defined]
