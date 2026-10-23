"""Database Postgres temporanei e configurazione Alembic per i test."""

from __future__ import annotations

import os
import uuid
from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import OperationalError

from tara_api.config import to_sqlalchemy_url

API_ROOT = Path(__file__).resolve().parents[1]
ADMIN_URL = to_sqlalchemy_url(
    os.environ.get("TARA_TEST_ADMIN_URL", "postgresql://tara:tara@localhost:55432/postgres")
)


@contextmanager
def temporary_database() -> Generator[str]:
    """Crea un database vuoto con nome casuale e lo elimina all'uscita."""
    admin = create_engine(
        ADMIN_URL, isolation_level="AUTOCOMMIT", connect_args={"connect_timeout": 3}
    )
    name = f"tara_test_{uuid.uuid4().hex[:12]}"
    try:
        with admin.connect() as conn:
            conn.execute(text(f'CREATE DATABASE "{name}"'))
    except OperationalError as exc:
        admin.dispose()
        # Interrompe tutta la sessione: senza database ogni test ripeterebbe il tentativo
        # aspettando il timeout, per minuti.
        pytest.exit(
            "Postgres non raggiungibile per i test del backend. Avvialo con "
            "`docker compose -f infra/docker-compose.yml up -d --wait db` (in VS Code: task "
            f"'Database: avvia Postgres') oppure imposta TARA_TEST_ADMIN_URL.\n{exc}",
            returncode=pytest.ExitCode.USAGE_ERROR,
        )
    try:
        yield make_url(ADMIN_URL).set(database=name).render_as_string(hide_password=False)
    finally:
        with admin.connect() as conn:
            conn.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        admin.dispose()


def alembic_config(database_url: str) -> Config:
    cfg = Config(str(API_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(API_ROOT / "migrations"))
    cfg.set_main_option("sqlalchemy.url", database_url)
    return cfg
