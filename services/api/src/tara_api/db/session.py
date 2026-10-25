from __future__ import annotations

from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

from tara_api.config import get_settings


@lru_cache
def get_engine() -> Engine:
    # pre_ping: i database gratuiti chiudono le connessioni inattive.
    return create_engine(get_settings().sqlalchemy_database_url, pool_pre_ping=True)


def get_session() -> Iterator[Session]:
    """Dipendenza FastAPI: una sessione per richiesta."""
    with Session(get_engine()) as session:
        yield session
