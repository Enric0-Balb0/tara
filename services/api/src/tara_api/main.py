import logging
import re
from typing import Annotated
from urllib.parse import quote, quote_plus

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from tara_api import __version__, foods, users
from tara_api.config import get_settings
from tara_api.db.session import get_session

logger = logging.getLogger(__name__)

# Userinfo of any URL ("scheme://user:password@"): stripped from logs even when the
# password is not the configured one.
_URL_CREDENTIALS = re.compile(r"([A-Za-z][A-Za-z0-9+.-]*://)[^\s/@]*:\S*@")

app = FastAPI(title="Tara API", version=__version__)
# Lo snapshot del catalogo pesa qualche MB in JSON: compresso si scarica anche in 4G.
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.include_router(foods.router)
app.include_router(users.router)


@app.get("/health")
def health() -> dict[str, str]:
    """Il processo risponde. Non tocca il database: un database in pausa non deve far
    riavviare il servizio a ogni controllo dell'hosting."""
    settings = get_settings()
    return {
        "status": "ok",
        "version": __version__,
        "release": settings.release,
        "environment": settings.environment,
    }


@app.get("/ready", responses={503: {"description": "Database non raggiungibile"}})
def ready(session: Annotated[Session, Depends(get_session)]) -> dict[str, str]:
    """Il backend può lavorare: risponde anche il database. Lo usano il deploy, per
    verificare la release, e il ping che tiene attivo il database gratuito."""
    try:
        session.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        logger.warning(
            "/ready: database non raggiungibile: %s: %s", type(exc).__name__, _redact(str(exc))
        )
        raise HTTPException(status_code=503, detail="database non raggiungibile") from exc
    return {"status": "ok"}


def _redact(message: str) -> str:
    """Il messaggio di un errore del database, su una riga e senza credenziali.

    psycopg e SQLAlchemy possono riportare l'intera stringa di connessione: la password
    configurata va tolta ovunque compaia, anche codificata come nell'URL.
    """
    password = make_url(get_settings().sqlalchemy_database_url).password
    if password:
        for secret in {password, quote(password, safe=""), quote_plus(password)}:
            message = message.replace(secret, "***")
    message = _URL_CREDENTIALS.sub(r"\1***@", message)
    return " ".join(message.split())
