"""Ambiente Alembic: usa i metadati dei modelli e l'URL da TARA_DATABASE_URL.

Se `sqlalchemy.url` è impostato nella configurazione (lo fanno i test), ha la precedenza.
"""

from alembic import context
from sqlalchemy import create_engine, pool

from tara_api.config import get_settings, to_sqlalchemy_url
from tara_api.db import models  # noqa: F401  (registra le tabelle nei metadati)
from tara_api.db.base import Base

target_metadata = Base.metadata


def database_url() -> str:
    configured = context.config.get_main_option("sqlalchemy.url")
    return to_sqlalchemy_url(configured) if configured else get_settings().sqlalchemy_database_url


def run_migrations_offline() -> None:
    """Genera lo SQL senza connettersi (`alembic upgrade head --sql`), utile per le revisioni."""
    context.configure(
        url=database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(database_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
