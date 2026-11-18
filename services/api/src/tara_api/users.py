"""L'utente autenticato (RNF-04): primo endpoint che richiede un token."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from tara_api.auth import CurrentUser
from tara_api.db.models import AppUser
from tara_api.db.session import get_session

router = APIRouter(prefix="/v1", tags=["utente"])


class Me(BaseModel):
    id: uuid.UUID
    email: str | None


@router.get(
    "/me",
    responses={
        401: {"description": "Token mancante o non valido"},
        503: {"description": "Verifica del token non disponibile"},
    },
)
def me(user: CurrentUser, session: Annotated[Session, Depends(get_session)]) -> Me:
    """L'utente del token. Al primo accesso crea la sua riga in `app_user`, proprietaria
    dei dati personali; le chiamate successive non cambiano niente."""
    session.execute(insert(AppUser).values(id=user.id).on_conflict_do_nothing())
    session.commit()
    return Me(id=user.id, email=user.email)
