import logging
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
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


FAKE_PASSWORD = "s3gr3t0-f4ls0"
FAKE_DATABASE_URL = f"postgresql://tara:{FAKE_PASSWORD}@db.example.invalid:5432/tara"


class FailingSession:
    """Sessione che fallisce come psycopg quando la password è sbagliata: l'errore
    contiene l'intera stringa di connessione, password compresa."""

    def execute(self, *_: object) -> None:
        raise OperationalError(
            "SELECT 1",
            None,
            Exception(
                f'connection to "{FAKE_DATABASE_URL}" failed:\n'
                'FATAL:  password authentication failed for user "tara"\n'
                f"retry with postgres://other:{FAKE_PASSWORD}x@host/db"
            ),
        )


@pytest.fixture
def wrong_password(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("TARA_DATABASE_URL", FAKE_DATABASE_URL)
    get_settings.cache_clear()
    app.dependency_overrides[get_session] = FailingSession
    try:
        yield
    finally:
        app.dependency_overrides.clear()
        get_settings.cache_clear()


def ready_warnings(caplog: pytest.LogCaptureFixture) -> list[logging.LogRecord]:
    return [r for r in caplog.records if r.levelno >= logging.WARNING]


@pytest.mark.usefixtures("unreachable_database")
def test_ready_logs_why_the_database_does_not_answer(caplog: pytest.LogCaptureFixture) -> None:
    """Il 503 da solo non dice niente nei log di Render: la causa va scritta in una riga."""
    with caplog.at_level(logging.WARNING):
        response = client.get("/ready")

    assert response.status_code == 503
    assert response.json() == {"detail": "database non raggiungibile"}
    [record] = ready_warnings(caplog)
    assert record.levelno == logging.WARNING
    line = record.getMessage()
    assert "OperationalError" in line
    assert "psycopg" in line
    assert "\n" not in line


@pytest.mark.usefixtures("wrong_password")
def test_ready_log_never_contains_the_password(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.WARNING):
        response = client.get("/ready")

    assert response.status_code == 503
    assert response.json() == {"detail": "database non raggiungibile"}
    [record] = ready_warnings(caplog)
    line = record.getMessage()
    assert "password authentication failed" in line
    assert FAKE_PASSWORD not in line
    assert "tara:" not in line
    assert "other:" not in line
    assert FAKE_PASSWORD not in caplog.text
    assert "postgresql://***@db.example.invalid:5432/tara" in line
    assert "postgres://***@host/db" in line
    assert "\n" not in line


def test_ready_logs_nothing_when_the_database_answers(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.WARNING):
        response = client.get("/ready")

    assert response.status_code == 200
    assert ready_warnings(caplog) == []
