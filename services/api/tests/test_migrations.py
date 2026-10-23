"""Le migrazioni sono reversibili e descrivono esattamente i modelli ORM."""

from __future__ import annotations

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import Engine, create_engine, inspect

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


def test_models_match_migrations(engine: Engine) -> None:
    with engine.connect() as conn:
        context = MigrationContext.configure(conn, opts={"compare_type": True})
        differences = compare_metadata(context, Base.metadata)

    assert differences == []
