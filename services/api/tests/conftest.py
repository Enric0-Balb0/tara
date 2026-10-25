"""Fixture comuni: database Postgres temporaneo, migrato con Alembic, isolato per test.

I test girano su un Postgres vero (lo stesso di `infra/docker-compose.yml`, o il service
container in CI): i vincoli dello schema sono il punto e un database finto non li verifica.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from alembic import command
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

from tara_api.db.session import get_session
from tara_api.main import app
from tests.database import alembic_config, temporary_database


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    """Database della sessione di test, portato all'ultima migrazione."""
    with temporary_database() as url:
        command.upgrade(alembic_config(url), "head")
        db_engine = create_engine(url)
        yield db_engine
        db_engine.dispose()


@pytest.fixture
def session(engine: Engine) -> Iterator[Session]:
    """Sessione dentro una transazione annullata alla fine del test.

    Gli errori di vincolo annullano solo il savepoint: il test può verificarli con
    `pytest.raises(IntegrityError)` senza sporcare gli altri test.
    """
    with engine.connect() as conn:
        outer = conn.begin()
        db_session = Session(bind=conn, join_transaction_mode="create_savepoint")
        try:
            yield db_session
        finally:
            db_session.close()
            outer.rollback()


@pytest.fixture
def client(session: Session) -> Iterator[TestClient]:
    """Client HTTP che usa la sessione del test: i dati scritti dal test sono visibili."""
    app.dependency_overrides[get_session] = lambda: session
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
