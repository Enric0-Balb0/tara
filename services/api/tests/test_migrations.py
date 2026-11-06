"""Le migrazioni sono reversibili e descrivono esattamente i modelli ORM."""

from __future__ import annotations

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import Engine, create_engine, inspect, text

from tara_api.db.base import Base
from tests.database import alembic_config, temporary_database

CATALOG_TABLES = {"app_user", "category", "nutrient", "food", "food_name", "nutrient_value"}


def test_upgrade_downgrade_roundtrip() -> None:
    with temporary_database() as url:
        cfg = alembic_config(url)
        engine = create_engine(url)
        try:
            command.upgrade(cfg, "head")
            assert CATALOG_TABLES.issubset(inspect(engine).get_table_names())

            command.downgrade(cfg, "base")
            assert set(inspect(engine).get_table_names()) == {"alembic_version"}

            command.upgrade(cfg, "head")
            assert CATALOG_TABLES.issubset(inspect(engine).get_table_names())
        finally:
            engine.dispose()


def test_every_table_has_row_level_security(engine: Engine) -> None:
    """Su Supabase la chiave pubblica dell'app arriva alle tabelle di `public` tramite la
    Data API: con la sicurezza per riga attiva e nessuna policy non vede né scrive nulla.
    L'API resta proprietaria delle tabelle e non ne è limitata."""
    with engine.connect() as conn:
        unprotected = conn.scalars(
            text(
                "SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace "
                "AND relkind = 'r' AND NOT relrowsecurity ORDER BY relname"
            )
        ).all()

    assert unprotected == []


def test_models_match_migrations(engine: Engine) -> None:
    with engine.connect() as conn:
        context = MigrationContext.configure(conn, opts={"compare_type": True})
        differences = compare_metadata(context, Base.metadata)

    assert differences == []


BEFORE_COOKING = "9618bb40d12b"
FOOD_COOKING = "6794f1e91aaf"


def test_distinct_names_migration_explains_how_to_fix_duplicates() -> None:
    """Un database con il catalogo di prima (nomi uguali) non riceve un errore di vincolo
    grezzo: la migrazione dice come rimediare, e il primo passo del rimedio funziona anche
    se l'upgrade fallito ha annullato pure la colonna della cottura."""
    with temporary_database() as url:
        cfg = alembic_config(url)
        command.upgrade(cfg, BEFORE_COOKING)
        engine = create_engine(url)
        try:
            with engine.begin() as conn:
                for code in ("7099", "7100"):
                    conn.execute(
                        text(
                            "INSERT INTO food (id, name, state, base_unit, source, source_code) "
                            "VALUES (gen_random_uuid(), 'Pane', 'not_applicable', 'g', 'ciqual', "
                            ":code)"
                        ),
                        {"code": code},
                    )

            with pytest.raises(
                RuntimeError,
                match=rf"uguali: 1\..*upgrade {FOOD_COOKING}.*catalog_load.*upgrade head",
            ):
                command.upgrade(cfg, "head")

            command.upgrade(cfg, FOOD_COOKING)
            assert "cooking" in {column["name"] for column in inspect(engine).get_columns("food")}
        finally:
            engine.dispose()


def test_offline_sql_covers_the_distinct_names_migration(
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Senza database i doppioni non si contano: l'SQL per le revisioni si genera lo stesso."""
    with temporary_database() as url:
        command.upgrade(alembic_config(url), f"{FOOD_COOKING}:head", sql=True)

    assert "ex_food_shared_name_state_cooking" in capsys.readouterr().out
