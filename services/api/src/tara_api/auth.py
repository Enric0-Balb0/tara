"""Verifica degli access token di Supabase Auth (RNF-04).

L'API non conosce segreti di Supabase: controlla la firma con le chiavi pubbliche che il
progetto pubblica nella sua JWKS (`/auth/v1/.well-known/jwks.json`), tenute in cache per
10 minuti. Un `kid` sconosciuto (chiave appena ruotata) causa un solo nuovo scaricamento,
poi il token è rifiutato.

Un token mancante o non valido vale 401; una verifica impossibile (JWKS irraggiungibile,
`TARA_SUPABASE_URL` non impostato) vale 503, perché la colpa non è del client.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated, Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import PyJWKClientConnectionError

from tara_api.config import Settings, get_settings

logger = logging.getLogger(__name__)

ALGORITHMS = ["ES256", "RS256"]
"""Solo algoritmi asimmetrici: un token HS256 o senza firma non passa mai."""
AUDIENCE = "authenticated"
LEEWAY_SECONDS = 30
JWKS_LIFESPAN_SECONDS = 600


class TokenRejectedError(Exception):
    """Il token non prova l'identità di un utente registrato."""


class KeysUnavailableError(Exception):
    """Le chiavi pubbliche del progetto non si possono scaricare."""


@dataclass(frozen=True)
class AuthenticatedUser:
    id: uuid.UUID
    """`sub` del token: l'id dell'utente in `auth.users` di Supabase."""
    email: str | None


class TokenVerifier:
    """Verifica i token di un progetto Supabase con la sua JWKS."""

    def __init__(self, supabase_url: str, *, jwks_client: jwt.PyJWKClient | None = None) -> None:
        base = supabase_url.rstrip("/")
        self.issuer = f"{base}/auth/v1"
        self.jwks_client = jwks_client or jwt.PyJWKClient(
            f"{self.issuer}/.well-known/jwks.json",
            cache_jwk_set=True,
            lifespan=JWKS_LIFESPAN_SECONDS,
            timeout=10,
        )

    def verify(self, token: str) -> AuthenticatedUser:
        try:
            signing_key = self.jwks_client.get_signing_key_from_jwt(token)
            claims: dict[str, Any] = jwt.decode(
                token,
                signing_key,
                algorithms=ALGORITHMS,
                audience=AUDIENCE,
                issuer=self.issuer,
                leeway=LEEWAY_SECONDS,
                options={"require": ["exp", "iat", "sub", "aud", "iss"]},
            )
        except PyJWKClientConnectionError as exc:
            raise KeysUnavailableError(str(exc)) from exc
        except jwt.PyJWTError as exc:
            raise TokenRejectedError(type(exc).__name__) from exc

        if claims.get("role") != "authenticated":
            raise TokenRejectedError("role")
        if claims.get("is_anonymous", False) is not False:
            raise TokenRejectedError("is_anonymous")
        try:
            user_id = uuid.UUID(claims["sub"])
        except (TypeError, ValueError) as exc:
            raise TokenRejectedError("sub") from exc
        email = claims.get("email")
        return AuthenticatedUser(id=user_id, email=email if isinstance(email, str) else None)


@lru_cache
def _verifier_for(supabase_url: str) -> TokenVerifier:
    """Un verificatore per indirizzo: la cache della JWKS sopravvive tra le richieste."""
    return TokenVerifier(supabase_url)


def get_token_verifier(
    settings: Annotated[Settings, Depends(get_settings)],
) -> TokenVerifier | None:
    """Dipendenza FastAPI; `None` se `TARA_SUPABASE_URL` non è impostato. I test la
    sostituiscono con un verificatore su una JWKS statica."""
    if not settings.supabase_url:
        return None
    return _verifier_for(settings.supabase_url)


_bearer = HTTPBearer(auto_error=False)


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="accesso richiesto: token mancante o non valido",
        headers={"WWW-Authenticate": "Bearer"},
    )


def current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    verifier: Annotated[TokenVerifier | None, Depends(get_token_verifier)],
) -> AuthenticatedUser:
    """Dipendenza FastAPI degli endpoint autenticati: l'utente del token Bearer."""
    if credentials is None:
        raise _unauthorized()
    if verifier is None:
        logger.error("Autenticazione non configurata: manca TARA_SUPABASE_URL")
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "autenticazione non disponibile")
    try:
        return verifier.verify(credentials.credentials)
    except KeysUnavailableError as exc:
        logger.warning("JWKS di Supabase non raggiungibile: %s", exc)
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "autenticazione non disponibile"
        ) from exc
    except TokenRejectedError as exc:
        logger.info("Token rifiutato: %s", exc)
        raise _unauthorized() from exc


CurrentUser = Annotated[AuthenticatedUser, Depends(current_user)]
