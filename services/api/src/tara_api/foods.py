"""Catalogo condiviso dei generici: ricerca, scheda e snapshot per l'app (RF-01, RF-03).

Espone solo il catalogo condiviso, che non contiene dati personali; i cataloghi personali
arriveranno con l'autenticazione. I valori sono per 100 g o 100 ml; un nutriente
sconosciuto manca dalla risposta, non vale zero (principio 2).
"""

from __future__ import annotations

import hashlib
import uuid
from collections import defaultdict
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from tara_api.db.models import Food, FoodName, Nutrient, NutrientValue
from tara_api.db.session import get_session
from tara_api.enums import (
    BaseUnit,
    FoodSource,
    FoodState,
    Language,
    NameOrigin,
    NutrientUnit,
    Provenance,
)

router = APIRouter(prefix="/v1", tags=["catalogo"])
SessionDep = Annotated[Session, Depends(get_session)]

MACROS = ("energy_kcal", "protein_g", "carbs_g", "fat_g")
SNAPSHOT_FORMAT = 2
"""Da incrementare quando cambia la forma dello snapshot: cambia anche la sua versione."""

search_text = func.tara_search_text


class Per100(BaseModel):
    energy_kcal: float | None = None
    protein_g: float | None = None
    carbs_g: float | None = None
    fat_g: float | None = None


class FoodHit(BaseModel):
    id: uuid.UUID
    name: str
    state: FoodState
    base_unit: BaseUnit
    per_100: Per100


class SearchResults(BaseModel):
    query: str
    items: list[FoodHit]


class FoodNameOut(BaseModel):
    lang: Language
    name: str
    origin: NameOrigin


class NutrientAmount(BaseModel):
    code: str
    name: str
    unit: NutrientUnit
    amount_per_100: float
    provenance: Provenance
    confidence: float


class FoodDetail(BaseModel):
    id: uuid.UUID
    name: str
    state: FoodState
    base_unit: BaseUnit
    source: FoodSource
    source_code: str | None
    names: list[FoodNameOut]
    nutrients: list[NutrientAmount]


class SnapshotNutrient(BaseModel):
    code: str
    name: str
    unit: NutrientUnit


class SnapshotValue(BaseModel):
    amount: float
    provenance: Provenance
    confidence: float


class SnapshotFood(BaseModel):
    id: uuid.UUID
    name: str
    state: FoodState
    base_unit: BaseUnit
    source: FoodSource
    """Da dove vengono i valori: l'app la mostra nella scheda (RNF-10)."""
    names: list[str]
    """Nomi italiani per la ricerca nell'app, il canonico per primo."""
    values: dict[str, SnapshotValue]


class CatalogSnapshot(BaseModel):
    version: str
    nutrients: list[SnapshotNutrient]
    """Nell'ordine in cui si mostrano."""
    foods: list[SnapshotFood]


def _escape_like(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def search_foods(session: Session, query: str, limit: int) -> list[FoodHit]:
    """Ogni parola della ricerca deve comparire in un nome italiano dell'alimento.

    In testa i nomi che iniziano con la ricerca, poi il crudo (si pesa a crudo, principio 4),
    poi i nomi più simili e i più corti.
    """
    name = search_text(FoodName.name)
    words = [
        name.like(search_text(f"%{_escape_like(word)}%"), escape="\\") for word in query.split()
    ]
    starts = name.like(search_text(f"{_escape_like(query.strip())}%"), escape="\\")
    ranked = (
        select(
            FoodName.food_id,
            func.bool_or(starts).label("starts"),
            func.max(func.similarity(name, search_text(query.strip()))).label("score"),
        )
        .where(FoodName.lang == Language.IT, or_(*words))
        .group_by(FoodName.food_id)
        .having(and_(*(func.bool_or(word) for word in words)))
        .subquery()
    )
    foods = session.scalars(
        select(Food)
        .join(ranked, ranked.c.food_id == Food.id)
        .where(Food.user_id.is_(None))
        .order_by(
            ranked.c.starts.desc(),
            (Food.state == FoodState.RAW).desc(),
            ranked.c.score.desc(),
            func.length(Food.name),
            Food.name,
        )
        .limit(limit)
    ).all()

    per_100: dict[uuid.UUID, dict[str, float]] = defaultdict(dict)
    for food_id, code, amount in session.execute(
        select(NutrientValue.food_id, NutrientValue.nutrient_code, NutrientValue.amount_per_100)
        .where(NutrientValue.food_id.in_([food.id for food in foods]))
        .where(NutrientValue.nutrient_code.in_(MACROS))
    ):
        per_100[food_id][code] = float(amount)
    return [
        FoodHit(
            id=food.id,
            name=food.name,
            state=food.state,
            base_unit=food.base_unit,
            per_100=Per100(**per_100[food.id]),
        )
        for food in foods
    ]


@router.get("/foods/search", summary="Cerca un alimento generico per nome")
def search(
    session: SessionDep,
    q: Annotated[str, Query(min_length=2, max_length=100, description="Es. albume, petto pollo")],
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> SearchResults:
    query = " ".join(q.split())
    return SearchResults(query=query, items=search_foods(session, query, limit))


@router.get(
    "/foods/{food_id}",
    summary="Scheda di un alimento con tutti i valori",
    responses={404: {"description": "Alimento inesistente o non nel catalogo condiviso"}},
)
def food_detail(food_id: uuid.UUID, session: SessionDep) -> FoodDetail:
    food = session.get(Food, food_id)
    if food is None or food.user_id is not None:
        raise HTTPException(status_code=404, detail="alimento non trovato")
    names = session.scalars(
        select(FoodName).where(FoodName.food_id == food.id).order_by(FoodName.id)
    )
    values = session.execute(
        select(NutrientValue, Nutrient)
        .join(Nutrient, Nutrient.code == NutrientValue.nutrient_code)
        .where(NutrientValue.food_id == food.id)
        .order_by(Nutrient.display_order)
    )
    return FoodDetail(
        id=food.id,
        name=food.name,
        state=food.state,
        base_unit=food.base_unit,
        source=food.source,
        source_code=food.source_code,
        names=[FoodNameOut(lang=n.lang, name=n.name, origin=n.origin) for n in names],
        nutrients=[
            NutrientAmount(
                code=nutrient.code,
                name=nutrient.name_it,
                unit=nutrient.unit,
                amount_per_100=float(value.amount_per_100),
                provenance=value.provenance,
                confidence=value.confidence,
            )
            for value, nutrient in values
        ],
    )


def catalog_version(session: Session) -> str:
    """Cambia a ogni caricamento del catalogo: il caricatore aggiorna `updated_at`."""
    count, latest = session.execute(
        select(func.count(Food.id), func.max(Food.updated_at)).where(Food.user_id.is_(None))
    ).one()
    return hashlib.sha256(f"{SNAPSHOT_FORMAT}|{count}|{latest}".encode()).hexdigest()[:16]


def build_snapshot(session: Session, version: str) -> CatalogSnapshot:
    shared = select(Food.id).where(Food.user_id.is_(None))
    names: dict[uuid.UUID, list[str]] = defaultdict(list)
    for food_id, name in session.execute(
        select(FoodName.food_id, FoodName.name)
        .where(FoodName.lang == Language.IT, FoodName.food_id.in_(shared))
        .order_by(FoodName.id)
    ):
        names[food_id].append(name)
    values: dict[uuid.UUID, dict[str, SnapshotValue]] = defaultdict(dict)
    for food_id, code, amount, provenance, confidence in session.execute(
        select(
            NutrientValue.food_id,
            NutrientValue.nutrient_code,
            NutrientValue.amount_per_100,
            NutrientValue.provenance,
            NutrientValue.confidence,
        ).where(NutrientValue.food_id.in_(shared))
    ):
        values[food_id][code] = SnapshotValue(
            amount=float(amount), provenance=provenance, confidence=confidence
        )
    return CatalogSnapshot(
        version=version,
        nutrients=[
            SnapshotNutrient(code=n.code, name=n.name_it, unit=n.unit)
            for n in session.scalars(select(Nutrient).order_by(Nutrient.display_order))
        ],
        foods=[
            SnapshotFood(
                id=food.id,
                name=food.name,
                state=food.state,
                base_unit=food.base_unit,
                source=food.source,
                names=names[food.id],
                values=values[food.id],
            )
            for food in session.scalars(
                select(Food).where(Food.user_id.is_(None)).order_by(Food.name, Food.id)
            )
        ],
    )


@router.get(
    "/catalog",
    summary="Catalogo condiviso completo, per l'uso offline nell'app",
    response_model=CatalogSnapshot,
    responses={304: {"description": "Il catalogo dell'app è già aggiornato (If-None-Match)"}},
)
def catalog(
    request: Request, response: Response, session: SessionDep
) -> CatalogSnapshot | Response:
    version = catalog_version(session)
    etag = f'"{version}"'
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag})
    response.headers["ETag"] = etag
    # L'app può tenere la copia, ma deve chiedere conferma al server prima di usarla.
    response.headers["Cache-Control"] = "no-cache"
    return build_snapshot(session, version)
