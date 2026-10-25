"""Caricamento del catalogo dei generici dal file della pipeline (RF-01, RF-03)."""

from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest
from alembic import command
from sqlalchemy import create_engine, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from tara_api import catalog_load
from tara_api.catalog_load import CatalogEntry, CatalogFileError, load_catalog, read_catalog
from tara_api.db.models import Food, FoodName, NutrientValue
from tara_api.enums import FoodSource, FoodState, Language, NameOrigin, Provenance
from tests.database import alembic_config, temporary_database


def entry(code: str = "22001", **fields: Any) -> dict[str, Any]:
    values: dict[str, Any] = {
        "source": "ciqual",
        "source_code": code,
        "name": "Albume d'uovo",
        "state": "raw",
        "names": [
            {"lang": "it", "name": "Albume d'uovo", "origin": "llm"},
            {"lang": "it", "name": "Chiara d'uovo", "origin": "llm"},
            {"lang": "fr", "name": "Oeuf, blanc (blanc d'oeuf), cru", "origin": "source"},
        ],
        "nutrients": {
            "protein_g": {"amount": "10.9", "provenance": "reference", "confidence": 0.85},
            "energy_kcal": {"amount": "45", "provenance": "reference", "confidence": 1.0},
        },
    }
    values.update(fields)
    return values


def parse(*rows: dict[str, Any]) -> list[CatalogEntry]:
    return [CatalogEntry.model_validate(row) for row in rows]


def shared_food(session: Session, code: str) -> Food:
    return session.scalars(
        select(Food).where(Food.user_id.is_(None), Food.source_code == code)
    ).one()


def test_load_inserts_foods_with_names_and_values(session: Session) -> None:
    summary = load_catalog(session, parse(entry(), entry("9104", name="Riso bianco")))

    assert summary == {"inserted": 2, "updated": 0, "missing_from_file": 0}
    egg = shared_food(session, "22001")
    assert (egg.name, egg.state, egg.source) == ("Albume d'uovo", FoodState.RAW, FoodSource.CIQUAL)
    assert {(n.lang, n.name, n.origin) for n in egg.names} == {
        (Language.IT, "Albume d'uovo", NameOrigin.LLM),
        (Language.IT, "Chiara d'uovo", NameOrigin.LLM),
        (Language.FR, "Oeuf, blanc (blanc d'oeuf), cru", NameOrigin.SOURCE),
    }
    protein = next(v for v in egg.nutrient_values if v.nutrient_code == "protein_g")
    assert protein.amount_per_100 == Decimal("10.9")
    assert (protein.provenance, protein.confidence) == (Provenance.REFERENCE, 0.85)


def test_reload_updates_in_place_without_duplicates(session: Session) -> None:
    load_catalog(session, parse(entry()))
    first_id = shared_food(session, "22001").id

    reviewed = entry(
        name="Albume",
        names=[{"lang": "it", "name": "Albume", "origin": "reviewed"}],
        nutrients={"protein_g": {"amount": "11", "provenance": "reference", "confidence": 1}},
    )
    summary = load_catalog(session, parse(reviewed))
    session.expire_all()

    assert summary == {"inserted": 0, "updated": 1, "missing_from_file": 0}
    egg = shared_food(session, "22001")
    assert egg.id == first_id
    assert egg.name == "Albume"
    assert [(n.name, n.origin) for n in egg.names] == [("Albume", NameOrigin.REVIEWED)]
    assert [(v.nutrient_code, v.amount_per_100) for v in egg.nutrient_values] == [
        ("protein_g", Decimal("11"))
    ]
    assert session.scalar(select(func.count()).select_from(FoodName)) == 1
    assert session.scalar(select(func.count()).select_from(NutrientValue)) == 1


def test_foods_no_longer_in_the_file_stay_and_are_counted(session: Session) -> None:
    load_catalog(session, parse(entry(), entry("9104")))

    summary = load_catalog(session, parse(entry()))

    assert summary["missing_from_file"] == 1
    assert shared_food(session, "9104").name == "Albume d'uovo"


def test_unknown_nutrient_is_rejected_by_the_database(session: Session) -> None:
    bad = entry(
        nutrients={"omega_3_g": {"amount": "1", "provenance": "reference", "confidence": 1}}
    )

    with pytest.raises(IntegrityError, match="fk_nutrient_value_nutrient_code_nutrient"):
        load_catalog(session, parse(bad))


@pytest.mark.parametrize(
    ("change", "problem"),
    [
        ({"source": "label"}, "catalogo condiviso"),
        ({"name": "  "}, "name"),
        ({"state": "crudo"}, "state"),
        ({"cooking": "lessato"}, "cooking"),
    ],
)
def test_invalid_lines_name_the_file_line(
    tmp_path: Path, change: dict[str, Any], problem: str
) -> None:
    path = tmp_path / "catalogo.jsonl"
    path.write_text(
        json.dumps(entry()) + "\n" + json.dumps(entry(**change)) + "\n", encoding="utf-8"
    )

    with pytest.raises(CatalogFileError, match=f"riga 2(.|\\n)*{problem}"):
        read_catalog(path)


def test_cli_loads_the_file_and_commits(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    path = tmp_path / "catalogo.jsonl"
    path.write_text(json.dumps(entry()) + "\n\n", encoding="utf-8")
    with temporary_database() as url:
        command.upgrade(alembic_config(url), "head")
        engine = create_engine(url)
        try:
            catalog_load.main([str(path)], engine=engine)
            catalog_load.main([str(path)], engine=engine)

            with Session(engine) as session:
                assert session.scalar(select(func.count()).select_from(Food)) == 1
        finally:
            engine.dispose()

    out = capsys.readouterr().out
    assert "alimenti inseriti 1, aggiornati 0" in out
    assert "alimenti inseriti 0, aggiornati 1" in out
