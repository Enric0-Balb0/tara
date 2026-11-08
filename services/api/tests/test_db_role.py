"""Rotazione della password del ruolo tara (RNF-14): nessun segreto in chiaro, mai."""

from __future__ import annotations

import io
import subprocess
import urllib.error
import uuid
from email.message import Message
from typing import Any

import psycopg
import pytest
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url

from tara_api import db_role
from tara_api.db_role import (
    Project,
    RotationError,
    Steps,
    new_password,
    redact,
    rotate,
    rotation_sql,
    scram_verifier,
)
from tests.database import ADMIN_URL

PASSWORD = "provaprovaprovaprova2024"  # finta: lettere e cifre come quelle vere
TOKEN = "sbp_" + "0" * 40  # finto, nel formato degli access token


def libpq_url(engine: Engine, **changes: Any) -> str:
    """URL per psycopg (senza `+psycopg`) del database di un engine di test."""
    url = engine.url.set(drivername="postgresql", **changes)
    return url.render_as_string(hide_password=False)


@pytest.fixture
def scratch_role() -> Any:
    """Ruolo con login e nome casuale, eliminato alla fine: i ruoli valgono per tutto il server."""
    admin = create_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
    name = f"tara_role_{uuid.uuid4().hex[:8]}"
    try:
        yield admin, name
    finally:
        with admin.connect() as conn:
            conn.execute(text(f'DROP ROLE IF EXISTS "{name}"'))
        admin.dispose()


def test_postgres_accepts_the_verifier_and_only_the_right_password(scratch_role: Any) -> None:
    _, name = scratch_role
    server = make_url(ADMIN_URL)
    admin_url = server.set(drivername="postgresql").render_as_string(hide_password=False)
    # psycopg e non text() di SQLAlchemy: i ":" dell'impronta sembrerebbero parametri.
    with psycopg.connect(admin_url, autocommit=True) as conn:
        conn.execute(f"CREATE ROLE \"{name}\" LOGIN PASSWORD '{scram_verifier(PASSWORD)}'")
        query = "SELECT rolpassword FROM pg_authid WHERE rolname = %s"
        row = conn.execute(query, [name]).fetchone()
    assert row is not None
    assert row[0].startswith("SCRAM-SHA-256$4096:")
    assert PASSWORD not in row[0]

    common = {"host": server.host, "port": server.port, "dbname": server.database, "user": name}
    with psycopg.connect(password=PASSWORD, **common) as conn:
        assert conn.execute("SELECT current_user").fetchone() == (name,)
    with pytest.raises(psycopg.OperationalError):
        psycopg.connect(password=PASSWORD[:-1] + "2", **common)


def test_verifier_uses_a_new_salt_each_time() -> None:
    assert scram_verifier(PASSWORD) != scram_verifier(PASSWORD)
    salt = bytes(16)
    assert scram_verifier(PASSWORD, salt) == scram_verifier(PASSWORD, salt)


def test_new_password_is_long_alphanumeric_and_random() -> None:
    first, second = new_password(), new_password()
    assert len(first) == 24 and first.isascii() and first.isalnum()
    assert first != second


def test_database_url_points_to_the_session_pooler_with_tls() -> None:
    url = make_url(Project().database_url(PASSWORD))
    assert url.username == "tara.fbwlepzrrvtngvbyktiv"
    assert url.password == PASSWORD
    assert (url.host, url.port, url.database) == (
        "aws-1-eu-central-1.pooler.supabase.com",
        5432,
        "postgres",
    )
    assert url.query == {"sslmode": "require"}


def test_rotation_sql_carries_only_the_verifier() -> None:
    sql = rotation_sql(scram_verifier(PASSWORD))
    assert sql.startswith("alter role tara with password 'SCRAM-SHA-256$")
    assert PASSWORD not in sql


def test_redact_hides_secrets_and_verifiers() -> None:
    message = f"{PASSWORD} {TOKEN} {rotation_sql(scram_verifier(PASSWORD))}"
    cleaned = redact(message, PASSWORD, TOKEN, "")
    assert PASSWORD not in cleaned and TOKEN not in cleaned and "4096:" not in cleaned


class Recorder:
    def __init__(self, fail_at: str | None = None) -> None:
        self.calls: list[str] = []
        self.fail_at = fail_at

    def step(self, name: str, result: Any = None) -> Any:
        def run(value: str) -> Any:
            self.calls.append(name)
            if name == self.fail_at:
                raise RotationError(f"{name} fallito con {value}")
            return result

        return run

    def steps(self) -> Steps:
        return Steps(
            run_sql=self.step("sql"),
            store_secret=self.step("secret"),
            copy=self.step("copy"),
            check=self.step("check", 3484),
        )


def test_rotate_saves_the_new_password_before_testing_it() -> None:
    recorder = Recorder(fail_at="check")
    with pytest.raises(RotationError):
        rotate(Project(), recorder.steps(), PASSWORD)
    assert recorder.calls == ["sql", "secret", "copy", "check"]


def test_rotate_stops_before_saving_if_the_database_refuses() -> None:
    recorder = Recorder(fail_at="sql")
    with pytest.raises(RotationError):
        rotate(Project(), recorder.steps(), PASSWORD)
    assert recorder.calls == ["sql"]


def test_rotate_returns_the_visible_foods() -> None:
    assert rotate(Project(), Recorder().steps(), PASSWORD) == 3484


def test_wait_for_pooler_counts_foods(engine: Engine) -> None:
    assert db_role.wait_for_pooler(libpq_url(engine), attempts=1) == 0


def test_wait_for_pooler_gives_up_without_showing_the_password(engine: Engine) -> None:
    url = libpq_url(engine, username="tara_role_missing", password=PASSWORD)
    with pytest.raises(RotationError, match="rifiuta ancora") as error:
        db_role.wait_for_pooler(url, attempts=2, delay=0)
    assert PASSWORD not in str(error.value)


def test_management_api_sends_the_query_with_the_token(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[Any] = []

    class Response(io.BytesIO):
        def __enter__(self) -> Response:
            return self

        def __exit__(self, *exc: object) -> None:
            return None

    def urlopen(request: Any, timeout: float) -> Response:
        sent.append(request)
        return Response(b"[]")

    monkeypatch.setattr("urllib.request.urlopen", urlopen)
    db_role.management_api_query(Project(), TOKEN, "select 1")
    (request,) = sent
    assert request.full_url.endswith("/v1/projects/fbwlepzrrvtngvbyktiv/database/query")
    assert request.get_header("Authorization") == f"Bearer {TOKEN}"
    assert request.data == b'{"query": "select 1"}'


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        (
            urllib.error.HTTPError("u", 400, "Bad Request", Message(), io.BytesIO(b"denied")),
            "HTTP 400: denied",
        ),
        (urllib.error.URLError("dns"), "irraggiungibile: dns"),
    ],
)
def test_management_api_errors_become_rotation_errors(
    monkeypatch: pytest.MonkeyPatch, error: Exception, expected: str
) -> None:
    def urlopen(request: Any, timeout: float) -> None:
        raise error

    monkeypatch.setattr("urllib.request.urlopen", urlopen)
    with pytest.raises(RotationError, match=expected):
        db_role.management_api_query(Project(), TOKEN, "select 1")


def test_github_secret_goes_through_stdin(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[list[str], dict[str, Any]]] = []

    def run(args: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        calls.append((args, kwargs))
        return subprocess.CompletedProcess(args, 1 if len(calls) > 1 else 0, "", "no auth")

    monkeypatch.setattr("subprocess.run", run)
    db_role.store_github_secret("postgresql://secret")
    with pytest.raises(RotationError, match="no auth"):
        db_role.store_github_secret("postgresql://secret")
    args, kwargs = calls[0]
    assert args == ["gh", "secret", "set", "TARA_DATABASE_URL"]
    assert kwargs["input"] == "postgresql://secret"


def test_clipboard_receives_the_value(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[list[str], dict[str, Any]]] = []
    monkeypatch.setattr("subprocess.run", lambda args, **kw: calls.append((args, kw)))
    db_role.copy_to_clipboard("postgresql://secret")
    assert calls == [(["clip.exe"], {"input": "postgresql://secret", "text": True, "check": True})]


@pytest.fixture
def offline(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """main() con rete, gh e appunti finti; la password generata è PASSWORD."""
    calls: list[str] = []
    monkeypatch.delenv("SUPABASE_ACCESS_TOKEN", raising=False)
    monkeypatch.setattr("getpass.getpass", lambda prompt: f"  {TOKEN}\n")
    monkeypatch.setattr(db_role, "new_password", lambda: PASSWORD)
    monkeypatch.setattr(
        db_role, "management_api_query", lambda project, token, sql: calls.append(sql)
    )
    monkeypatch.setattr(db_role, "store_github_secret", lambda url: calls.append("secret"))
    monkeypatch.setattr(db_role, "copy_to_clipboard", lambda url: calls.append("copy"))
    monkeypatch.setattr(db_role, "wait_for_pooler", lambda url: 3484)
    return calls


def test_main_rotates_without_printing_secrets(
    offline: list[str], capsys: pytest.CaptureFixture[str]
) -> None:
    db_role.main([])
    output = capsys.readouterr().out
    assert "3484 alimenti" in output
    assert PASSWORD not in output and TOKEN not in output
    assert offline[0].startswith("alter role tara with password 'SCRAM-SHA-256$")
    assert offline[1:] == ["secret", "copy"]


def test_main_hides_secrets_in_errors(offline: list[str], monkeypatch: pytest.MonkeyPatch) -> None:
    def leak(url: str) -> int:
        raise RotationError(f"errore con {url} e {TOKEN}")

    monkeypatch.setattr(db_role, "wait_for_pooler", leak)
    with pytest.raises(SystemExit) as stop:
        db_role.main([])
    message = str(stop.value)
    assert "***" in message
    assert PASSWORD not in message and TOKEN not in message


def test_main_rejects_something_that_is_not_a_token(
    offline: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("SUPABASE_ACCESS_TOKEN", "postgresql://x y")
    with pytest.raises(SystemExit, match="non è un access token") as stop:
        db_role.main([])
    assert "postgresql" not in str(stop.value)
    assert offline == []
