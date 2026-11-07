from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from tara_api import __version__
from tara_api.config import get_settings
from tara_api.db.session import get_session
from tara_api.main import app

client = TestClient(app)


def test_health_returns_ok() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["version"] == __version__


def test_health_names_the_running_release(monkeypatch: pytest.MonkeyPatch) -> None:
    """Il deploy aspetta che risponda l'immagine appena pubblicata: la riconosce dallo SHA."""
    monkeypatch.setenv("TARA_RELEASE", "69b2df2")
    get_settings.cache_clear()
    try:
        assert client.get("/health").json()["release"] == "69b2df2"
    finally:
        get_settings.cache_clear()


def test_ready_answers_when_the_database_does(client: TestClient) -> None:
    response = client.get("/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.fixture
def unreachable_database() -> Iterator[None]:
    engine = create_engine(
        "postgresql+psycopg://tara:tara@127.0.0.1:1/tara", connect_args={"connect_timeout": 2}
    )

    def session() -> Iterator[Session]:
        with Session(engine) as db_session:
            yield db_session

    app.dependency_overrides[get_session] = session
    try:
        yield
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


@pytest.mark.usefixtures("unreachable_database")
def test_ready_fails_when_the_database_does_not_answer() -> None:
    """/health resta ok (il processo è vivo); /ready dice che senza database non si lavora."""
    response = client.get("/ready")

    assert response.status_code == 503
    assert response.json() == {"detail": "database non raggiungibile"}
    assert client.get("/health").status_code == 200
