from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from tara_api import __version__, foods
from tara_api.config import get_settings
from tara_api.db.session import get_session

app = FastAPI(title="Tara API", version=__version__)
# Lo snapshot del catalogo pesa qualche MB in JSON: compresso si scarica anche in 4G.
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.include_router(foods.router)


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
        raise HTTPException(status_code=503, detail="database non raggiungibile") from exc
    return {"status": "ok"}
