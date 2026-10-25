"""Caricamento del catalogo condiviso dei generici (RF-01, RF-03).

    uv run python -m tara_api.catalog_load <catalogo.jsonl>

Il file arriva da `tara_catalog.export`: un alimento per riga, validato qui prima di
toccare il database. Il caricamento è idempotente: un alimento già presente (stessa fonte
e stesso codice) viene aggiornato, nomi e valori vengono sostituiti. Tutto avviene in una
transazione: un errore a metà non lascia un catalogo parziale.

Gli alimenti che spariscono dalla fonte restano nel database: potrebbero essere
riferimento di prodotti o ricette. Il caricatore li conta e basta.
"""

from __future__ import annotations

import argparse
import sys
import uuid
from collections.abc import Iterable, Sequence
from decimal import Decimal
from pathlib import Path
from typing import Annotated, TypedDict

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator
from sqlalchemy import Engine, create_engine, delete, insert, select, update
from sqlalchemy.orm import Session

from tara_api.config import get_settings
from tara_api.db.base import new_id
from tara_api.db.models import Food, FoodName, NutrientValue
from tara_api.enums import (
    REFERENCE_SOURCES,
    FoodSource,
    FoodState,
    Language,
    NameOrigin,
    Provenance,
)

DESCRIPTION = "Carica nel database il catalogo dei generici scritto da tara_catalog.export."
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class CatalogName(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    lang: Language
    name: Text
    origin: NameOrigin


class CatalogValue(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    amount: Decimal = Field(ge=0)
    provenance: Provenance
    confidence: float = Field(ge=0, le=1)


class CatalogEntry(BaseModel):
    """Una riga di catalogo.jsonl: il contratto con la pipeline del catalogo."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    source: FoodSource
    source_code: Text
    name: Text
    state: FoodState
    names: list[CatalogName]
    nutrients: dict[str, CatalogValue]

    @field_validator("source")
    @classmethod
    def _reference_only(cls, source: FoodSource) -> FoodSource:
        if source not in REFERENCE_SOURCES:
            raise ValueError(f"il catalogo condiviso accetta solo {REFERENCE_SOURCES}")
        return source


class LoadSummary(TypedDict):
    inserted: int
    updated: int
    missing_from_file: int


class CatalogFileError(ValueError):
    """Riga non valida: si indica la riga, così si corregge la pipeline e non il database."""


def read_catalog(path: Path) -> list[CatalogEntry]:
    entries = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            entries.append(CatalogEntry.model_validate_json(line))
        except ValueError as exc:
            raise CatalogFileError(f"{path}, riga {number}: {exc}") from exc
    return entries


def load_catalog(session: Session, entries: Iterable[CatalogEntry]) -> LoadSummary:
    """Inserisce o aggiorna gli alimenti condivisi; il commit spetta al chiamante."""
    entries = list(entries)
    sources = {entry.source for entry in entries}
    existing: dict[tuple[str, str], uuid.UUID] = {
        (source, code): food_id
        for source, code, food_id in session.execute(
            select(Food.source, Food.source_code, Food.id).where(
                Food.user_id.is_(None), Food.source.in_(sources)
            )
        )
        if code is not None
    }

    new_foods, changed, names, values = [], [], [], []
    for entry in entries:
        key = (entry.source.value, entry.source_code)
        food_id = existing.pop(key, None)
        row = {"name": entry.name, "state": entry.state}
        if food_id is None:
            food_id = new_id()
            new_foods.append(
                {"id": food_id, "source": entry.source, "source_code": entry.source_code, **row}
            )
        else:
            changed.append({"id": food_id, **row})
        names += [{"id": new_id(), "food_id": food_id, **name.model_dump()} for name in entry.names]
        values += [
            {"food_id": food_id, "nutrient_code": code, **value.model_dump()}
            for code, value in entry.nutrients.items()
        ]
    for value in values:
        value["amount_per_100"] = value.pop("amount")

    changed_ids = [row["id"] for row in changed]
    if changed_ids:
        session.execute(delete(FoodName).where(FoodName.food_id.in_(changed_ids)))
        session.execute(delete(NutrientValue).where(NutrientValue.food_id.in_(changed_ids)))
        session.execute(update(Food), changed)
    if new_foods:
        session.execute(insert(Food), new_foods)
    if names:
        session.execute(insert(FoodName), names)
    if values:
        session.execute(insert(NutrientValue), values)
    session.flush()
    return {
        "inserted": len(new_foods),
        "updated": len(changed),
        "missing_from_file": len(existing),
    }


def run(path: Path, engine: Engine) -> LoadSummary:
    entries = read_catalog(path)
    with Session(engine) as session, session.begin():
        return load_catalog(session, entries)


def main(argv: Sequence[str] | None = None, engine: Engine | None = None) -> None:
    parser = argparse.ArgumentParser(description=DESCRIPTION)
    parser.add_argument("path", type=Path, help="catalogo.jsonl scritto da tara_catalog.export")
    args = parser.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    engine = engine or create_engine(get_settings().sqlalchemy_database_url)
    summary = run(args.path, engine)
    print(
        f"alimenti inseriti {summary['inserted']}, aggiornati {summary['updated']}, "
        f"nel database ma non nel file {summary['missing_from_file']}"
    )


if __name__ == "__main__":
    main()
