"""Verifica dei token di Supabase Auth con la JWKS del progetto (RNF-04).

Nessuna rete: la chiave P-256 nasce nel test e la JWKS è statica, servita da un
`PyJWKClient` che sostituisce solo lo scaricamento.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
import uuid
from collections.abc import Iterator
from typing import Any

import httpx2
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from jwt.algorithms import ECAlgorithm
from jwt.exceptions import PyJWKClientConnectionError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from tara_api.auth import TokenVerifier, get_token_verifier
from tara_api.config import Settings, get_settings
from tara_api.db.models import AppUser
from tara_api.main import app

SUPABASE_URL = "https://progetto-di-prova.supabase.co"
ISSUER = f"{SUPABASE_URL}/auth/v1"
KID = "chiave-di-prova"
USER_ID = uuid.UUID("0190a6e2-7c1e-7b3a-9f00-000000000001")
PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())


def public_jwk() -> dict[str, Any]:
    jwk = ECAlgorithm.to_jwk(PRIVATE_KEY.public_key(), as_dict=True)
    return {**jwk, "kid": KID, "alg": "ES256", "use": "sig"}


class StaticJwksClient(jwt.PyJWKClient):
    """JWKS fissa: conta gli scaricamenti e può simulare un endpoint irraggiungibile."""

    def __init__(self, keys: list[dict[str, Any]], *, reachable: bool = True) -> None:
        super().__init__(f"{ISSUER}/.well-known/jwks.json", cache_jwk_set=True, lifespan=600)
        self.keys = keys
        self.reachable = reachable
        self.fetches = 0

    def fetch_data(self) -> Any:
        self.fetches += 1
        if not self.reachable:
            raise PyJWKClientConnectionError("JWKS non raggiungibile (simulato)")
        return {"keys": self.keys}


def claims(**overrides: Any) -> dict[str, Any]:
    """Claim di un access token di Supabase; `None` toglie il claim."""
    now = int(time.time())
    base: dict[str, Any] = {
        "iss": ISSUER,
        "aud": "authenticated",
        "sub": str(USER_ID),
        "email": "enrico@example.com",
        "role": "authenticated",
        "is_anonymous": False,
        "iat": now,
        "exp": now + 3600,
    }
    base.update(overrides)
    return {key: value for key, value in base.items() if value is not None}


def es256_token(payload: dict[str, Any] | None = None, *, kid: str = KID) -> str:
    return jwt.encode(payload or claims(), PRIVATE_KEY, algorithm="ES256", headers={"kid": kid})


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def hs256_forged_with_public_key() -> str:
    """Confusione dell'algoritmo: HMAC con la chiave pubblica usata come segreto."""
    secret = PRIVATE_KEY.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT", "kid": KID}).encode())
    body = b64url(json.dumps(claims()).encode())
    signature = hmac.new(secret, f"{header}.{body}".encode(), hashlib.sha256).digest()
    return f"{header}.{body}.{b64url(signature)}"


def unsigned_token() -> str:
    header = b64url(json.dumps({"alg": "none", "typ": "JWT", "kid": KID}).encode())
    return f"{header}.{b64url(json.dumps(claims()).encode())}."


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def without_supabase_url() -> Settings:
    return Settings(_env_file=None, supabase_url=None)


@pytest.fixture
def jwks() -> StaticJwksClient:
    return StaticJwksClient([public_jwk()])


@pytest.fixture
def auth_client(client: TestClient, jwks: StaticJwksClient) -> TestClient:
    """Client con il verificatore puntato alla JWKS statica (il fixture `client` pulisce)."""
    verifier = TokenVerifier(SUPABASE_URL, jwks_client=jwks)
    app.dependency_overrides[get_token_verifier] = lambda: verifier
    return client


@pytest.fixture
def unconfigured_client(client: TestClient) -> Iterator[TestClient]:
    app.dependency_overrides[get_settings] = without_supabase_url
    yield client


def assert_unauthorized(response: httpx2.Response) -> None:
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


# --- Token accettati -----------------------------------------------------------------------


def test_a_valid_token_identifies_the_user(auth_client: TestClient) -> None:
    response = auth_client.get("/v1/me", headers=bearer(es256_token()))

    assert response.status_code == 200
    assert response.json() == {"id": str(USER_ID), "email": "enrico@example.com"}


def test_me_creates_the_user_once(auth_client: TestClient, session: Session) -> None:
    for _ in range(2):
        assert auth_client.get("/v1/me", headers=bearer(es256_token())).status_code == 200

    count = session.scalar(select(func.count()).select_from(AppUser).where(AppUser.id == USER_ID))
    assert count == 1


def test_a_token_without_email_has_a_null_email(auth_client: TestClient) -> None:
    response = auth_client.get("/v1/me", headers=bearer(es256_token(claims(email=None))))

    assert response.json() == {"id": str(USER_ID), "email": None}


def test_a_token_just_expired_is_within_the_leeway(auth_client: TestClient) -> None:
    """30 s di tolleranza: l'orologio del telefono e quello del server non coincidono."""
    now = int(time.time())
    token = es256_token(claims(iat=now - 3600, exp=now - 10))

    assert auth_client.get("/v1/me", headers=bearer(token)).status_code == 200


# --- Token rifiutati -----------------------------------------------------------------------


def test_a_missing_token_is_rejected(auth_client: TestClient) -> None:
    assert_unauthorized(auth_client.get("/v1/me"))


def test_a_non_bearer_authorization_is_rejected(auth_client: TestClient) -> None:
    assert_unauthorized(auth_client.get("/v1/me", headers={"Authorization": "Basic dXRlbnRl"}))


@pytest.mark.parametrize(
    "payload",
    [
        pytest.param(claims(exp=int(time.time()) - 120), id="scaduto"),
        pytest.param(claims(aud="altro-pubblico"), id="aud-sbagliato"),
        pytest.param(claims(aud=None), id="aud-mancante"),
        pytest.param(claims(iss="https://altro-progetto.supabase.co/auth/v1"), id="iss-sbagliato"),
        pytest.param(claims(sub=None), id="sub-mancante"),
        pytest.param(claims(sub="non-un-uuid"), id="sub-non-uuid"),
        pytest.param(claims(iat=None), id="iat-mancante"),
        pytest.param(claims(exp=None), id="exp-mancante"),
        pytest.param(claims(role="anon"), id="ruolo-anon"),
        pytest.param(claims(role=None), id="ruolo-mancante"),
        pytest.param(claims(is_anonymous=True), id="utente-anonimo"),
        pytest.param(claims(is_anonymous="true"), id="utente-anonimo-testo"),
    ],
)
def test_tokens_with_invalid_claims_are_rejected(
    auth_client: TestClient, payload: dict[str, Any]
) -> None:
    assert_unauthorized(auth_client.get("/v1/me", headers=bearer(es256_token(payload))))


def test_a_token_signed_by_another_key_is_rejected(auth_client: TestClient) -> None:
    other = ec.generate_private_key(ec.SECP256R1())
    token = jwt.encode(claims(), other, algorithm="ES256", headers={"kid": KID})

    assert_unauthorized(auth_client.get("/v1/me", headers=bearer(token)))


def test_hs256_forged_with_the_public_key_is_rejected(auth_client: TestClient) -> None:
    assert_unauthorized(auth_client.get("/v1/me", headers=bearer(hs256_forged_with_public_key())))


def test_an_unsigned_token_is_rejected(auth_client: TestClient) -> None:
    assert_unauthorized(auth_client.get("/v1/me", headers=bearer(unsigned_token())))


def test_a_malformed_token_is_rejected(auth_client: TestClient) -> None:
    assert_unauthorized(auth_client.get("/v1/me", headers=bearer("non.un.jwt")))


def test_an_unknown_kid_refetches_the_jwks_once_then_is_rejected(
    auth_client: TestClient, jwks: StaticJwksClient
) -> None:
    response = auth_client.get("/v1/me", headers=bearer(es256_token(kid="chiave-ignota")))

    assert_unauthorized(response)
    assert jwks.fetches == 2


def test_the_jwks_is_cached_between_requests(
    auth_client: TestClient, jwks: StaticJwksClient
) -> None:
    for _ in range(3):
        auth_client.get("/v1/me", headers=bearer(es256_token()))

    assert jwks.fetches == 1


# --- Verifica non disponibile --------------------------------------------------------------


def test_an_unreachable_jwks_is_a_service_error(
    auth_client: TestClient, jwks: StaticJwksClient
) -> None:
    jwks.reachable = False

    response = auth_client.get("/v1/me", headers=bearer(es256_token()))

    assert response.status_code == 503


def test_without_a_supabase_url_authentication_is_unavailable(
    unconfigured_client: TestClient,
) -> None:
    response = unconfigured_client.get("/v1/me", headers=bearer(es256_token()))

    assert response.status_code == 503


def test_without_a_supabase_url_a_missing_token_is_still_unauthorized(
    unconfigured_client: TestClient,
) -> None:
    """Il 401 non dipende dalla configurazione: la collezione Postman lo verifica online."""
    assert_unauthorized(unconfigured_client.get("/v1/me"))


def test_the_verifier_uses_the_project_jwks_and_issuer() -> None:
    settings = Settings(_env_file=None, supabase_url=f"{SUPABASE_URL}/")

    verifier = get_token_verifier(settings)

    assert verifier is not None
    assert verifier.issuer == ISSUER
    assert verifier.jwks_client.uri == f"{ISSUER}/.well-known/jwks.json"
    assert get_token_verifier(settings) is verifier


def test_without_a_supabase_url_there_is_no_verifier() -> None:
    assert get_token_verifier(without_supabase_url()) is None


# --- Endpoint pubblici ---------------------------------------------------------------------


@pytest.mark.parametrize("path", ["/health", "/v1/foods/search?q=albume", "/v1/catalog"])
def test_public_endpoints_need_no_token(unconfigured_client: TestClient, path: str) -> None:
    assert unconfigured_client.get(path).status_code == 200
