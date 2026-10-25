"""Regole del catalogo garantite dallo schema del database (RF-03, RNF-04).

Le violazioni sono provate anche con SQL diretto: i vincoli devono valere per qualsiasi
client del database, non solo per l'ORM.
"""

from __future__ import annotations

import csv
import uuid
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from tara_api.db.models import AppUser, Category, Food, FoodName, Nutrient, NutrientValue
from tara_api.enums import BaseUnit, FoodSource, FoodState, Language, NameOrigin, Provenance

NUTRIENT_TABLE = Path(__file__).resolve().parents[3] / "pipelines/catalog/data/nutrienti.csv"


def add_user(session: Session) -> AppUser:
    user = AppUser()
    session.add(user)
    session.flush()
    return user


def add_food(session: Session, **fields: Any) -> Food:
    values: dict[str, Any] = {
        "name": "Albume d'uovo",
        "source": FoodSource.CIQUAL,
        "source_code": uuid.uuid4().hex[:8],
    }
    values.update(fields)
    food = Food(**values)
    session.add(food)
    session.flush()
    return food


def add_value(
    session: Session,
    food: Food,
    code: str = "protein_g",
    amount: str = "10.9",
    provenance: Provenance = Provenance.REFERENCE,
    confidence: float = 1.0,
) -> NutrientValue:
    value = NutrientValue(
        food_id=food.id,
        nutrient_code=code,
        amount_per_100=Decimal(amount),
        provenance=provenance,
        confidence=confidence,
    )
    session.add(value)
    session.flush()
    return value


def violates(constraint: str) -> pytest.RaisesExc[IntegrityError]:
    """L'errore deve nominare il vincolo atteso: un test non passa per il motivo sbagliato."""
    return pytest.raises(IntegrityError, match=constraint)


def expect_violation(session: Session, constraint: str, sql: str, **params: Any) -> None:
    with violates(constraint):
        session.execute(text(sql), params)
        session.flush()


# --- Identificativi -----------------------------------------------------------------------


def test_ids_are_time_ordered_uuid7(session: Session) -> None:
    first, second = add_user(session), add_user(session)

    assert first.id.version == 7
    assert first.id < second.id


# --- Alimenti -----------------------------------------------------------------------------


def test_food_defaults_to_raw_weight_in_grams(session: Session) -> None:
    food = add_food(session)
    session.refresh(food)

    assert food.state is FoodState.RAW
    assert food.base_unit is BaseUnit.G
    assert food.created_at is not None
    assert food.updated_at is not None


def test_shared_catalog_accepts_only_reference_tables(session: Session) -> None:
    with violates("ck_food_shared_only_reference_sources"):
        add_food(session, user_id=None, source=FoodSource.LABEL)


def test_shared_food_needs_its_source_code(session: Session) -> None:
    """Senza codice un ricaricamento dalla fonte creerebbe un doppione."""
    with violates("ck_food_shared_has_source_code"):
        add_food(session, source_code=None)


def test_source_code_cannot_be_blank(session: Session) -> None:
    with violates("ck_food_source_code_not_blank"):
        add_food(session, source_code="  ")


def test_source_code_is_unique_per_source_within_a_catalog(session: Session) -> None:
    add_food(session, source_code="22001")
    add_food(session, source=FoodSource.USDA, source_code="22001")

    with violates("uq_food_user_id_source_source_code"):
        add_food(session, source_code="22001")


def test_personal_foods_may_reuse_a_shared_source_code(session: Session) -> None:
    add_food(session, source_code="22001")
    user = add_user(session)

    copy = add_food(session, user_id=user.id, source_code="22001")
    personal = add_food(session, user_id=user.id, source=FoodSource.MANUAL, source_code=None)

    assert copy.id != personal.id


def test_personal_catalog_accepts_any_source(session: Session) -> None:
    user = add_user(session)

    food = add_food(session, user_id=user.id, source=FoodSource.LABEL, brand="Eurovo")

    assert food.user_id == user.id


@pytest.mark.parametrize(
    ("column", "value"),
    [("state", "crudo"), ("base_unit", "kg"), ("source", "fatsecret")],
)
def test_food_rejects_values_outside_the_allowed_sets(
    session: Session, column: str, value: str
) -> None:
    # Alimento personale: nel catalogo condiviso una fonte sconosciuta violerebbe prima
    # il vincolo sulle fonti di riferimento, e il test passerebbe per il motivo sbagliato.
    user = add_user(session)
    row = {"id": uuid.uuid4(), "user_id": user.id, "name": "Riso", "source": "manual"}
    row[column] = value

    expect_violation(
        session,
        f"ck_food_{column}",
        f"INSERT INTO food ({', '.join(row)}) VALUES ({', '.join(f':{c}' for c in row)})",
        **row,
    )


def test_food_name_cannot_be_blank(session: Session) -> None:
    with violates("ck_food_name_not_blank"):
        add_food(session, name="   ")


@pytest.mark.parametrize("barcode", ["1234567", "123456789012345", "80012345abc"])
def test_barcode_must_be_8_to_14_digits(session: Session, barcode: str) -> None:
    user = add_user(session)
    with violates("ck_food_barcode_format"):
        add_food(session, user_id=user.id, source=FoodSource.LABEL, barcode=barcode)


def test_barcode_is_unique_within_a_catalog(session: Session) -> None:
    user = add_user(session)
    add_food(session, user_id=user.id, source=FoodSource.LABEL, barcode="8001234567890")

    with violates("uq_food_user_id_barcode"):
        add_food(session, user_id=user.id, source=FoodSource.LABEL, barcode="8001234567890")


def test_same_barcode_in_different_personal_catalogs(session: Session) -> None:
    first, second = add_user(session), add_user(session)

    add_food(session, user_id=first.id, source=FoodSource.LABEL, barcode="8001234567890")
    add_food(session, user_id=second.id, source=FoodSource.LABEL, barcode="8001234567890")


@pytest.mark.parametrize(
    ("field", "constraint"),
    [
        ("density_g_ml", "ck_food_density_positive"),
        ("serving_size", "ck_food_serving_size_positive"),
    ],
)
def test_density_and_serving_must_be_positive(
    session: Session, field: str, constraint: str
) -> None:
    with violates(constraint):
        add_food(session, **{field: Decimal("0")})


def test_food_cannot_be_its_own_parent(session: Session) -> None:
    food = add_food(session)
    food.parent_food_id = food.id

    with violates("ck_food_not_own_parent"):
        session.flush()


def test_branded_product_keeps_working_when_its_generic_is_removed(session: Session) -> None:
    user = add_user(session)
    generic = add_food(session, name="Albume d'uovo, crudo")
    branded = add_food(
        session,
        user_id=user.id,
        source=FoodSource.LABEL,
        name="Albume in brick",
        brand="Eurovo",
        parent_food_id=generic.id,
    )

    session.delete(generic)
    session.flush()
    session.refresh(branded)

    assert branded.parent_food_id is None


def test_deleting_a_user_removes_the_personal_catalog(session: Session) -> None:
    user = add_user(session)
    food = add_food(session, user_id=user.id, source=FoodSource.MANUAL)
    add_value(session, food, provenance=Provenance.MANUAL)
    session.add(FoodName(food_id=food.id, lang=Language.IT, name="albume", origin=NameOrigin.USER))
    session.flush()

    session.delete(user)
    session.flush()
    session.expunge_all()

    assert session.scalar(select(func.count()).select_from(Food)) == 0
    assert session.scalar(select(func.count()).select_from(NutrientValue)) == 0
    assert session.scalar(select(func.count()).select_from(FoodName)) == 0


# --- Valori nutrizionali ------------------------------------------------------------------


def test_value_is_stored_per_100_with_provenance_and_confidence(session: Session) -> None:
    food = add_food(session)
    add_value(session, food, "potassium_mg", "163", Provenance.REFERENCE, 0.9)
    session.expunge_all()

    stored = session.get_one(NutrientValue, (food.id, "potassium_mg"))

    assert stored.amount_per_100 == Decimal("163")
    assert stored.provenance is Provenance.REFERENCE
    assert stored.confidence == pytest.approx(0.9)


def test_missing_nutrient_is_absent_not_zero(session: Session) -> None:
    food = add_food(session)
    add_value(session, food, "protein_g", "10.9")

    potassium = session.get(NutrientValue, (food.id, "potassium_mg"))

    assert potassium is None


@pytest.mark.parametrize("missing", ["amount_per_100", "provenance", "confidence"])
def test_value_requires_amount_provenance_and_confidence(session: Session, missing: str) -> None:
    food = add_food(session)
    columns = {"amount_per_100": "10", "provenance": "'reference'", "confidence": "1"}
    del columns[missing]

    expect_violation(
        session,
        f'null value in column "{missing}"',
        f"INSERT INTO nutrient_value (food_id, nutrient_code, {', '.join(columns)}) "
        f"VALUES (:food_id, 'protein_g', {', '.join(columns.values())})",
        food_id=food.id,
    )


def test_amount_cannot_be_negative(session: Session) -> None:
    food = add_food(session)
    with violates("ck_nutrient_value_amount_not_negative"):
        add_value(session, food, amount="-0.1")


@pytest.mark.parametrize("confidence", [-0.01, 1.01])
def test_confidence_is_between_0_and_1(session: Session, confidence: float) -> None:
    food = add_food(session)
    with violates("ck_nutrient_value_confidence_range"):
        add_value(session, food, confidence=confidence)


@pytest.mark.parametrize("confidence", [0.0, 1.0])
def test_confidence_bounds_are_allowed(session: Session, confidence: float) -> None:
    food = add_food(session)
    add_value(session, food, confidence=confidence)


def test_provenance_must_be_known(session: Session) -> None:
    food = add_food(session)
    expect_violation(
        session,
        "ck_nutrient_value_provenance",
        "INSERT INTO nutrient_value (food_id, nutrient_code, amount_per_100, provenance, "
        "confidence) VALUES (:food_id, 'protein_g', 10, 'llm', 1)",
        food_id=food.id,
    )


def test_one_value_per_food_and_nutrient(session: Session) -> None:
    food = add_food(session)
    add_value(session, food, "protein_g")

    with violates("pk_nutrient_value"):
        add_value(session, food, "protein_g")


def test_value_must_reference_a_known_nutrient(session: Session) -> None:
    food = add_food(session)
    with violates("fk_nutrient_value_nutrient_code_nutrient"):
        add_value(session, food, "omega3_g")


# --- Nutrienti e categorie ----------------------------------------------------------------


def test_nutrients_match_the_reference_table(session: Session) -> None:
    with NUTRIENT_TABLE.open(encoding="utf-8") as f:
        expected = [(row["codice"], row["nome_it"], row["unita"]) for row in csv.DictReader(f)]

    stored = session.scalars(select(Nutrient).order_by(Nutrient.display_order)).all()

    assert [(n.code, n.name_it, n.unit.value) for n in stored] == expected


def test_category_tree(session: Session) -> None:
    session.add(Category(code="dairy", name_it="Latte e derivati"))
    session.add(Category(code="dairy_yogurt", name_it="Yogurt", parent_code="dairy"))
    session.flush()

    food = add_food(session, name="Yogurt greco 0%", category_code="dairy_yogurt")

    assert food.category_code == "dairy_yogurt"


@pytest.mark.parametrize("code", ["Latticini", "dairy-yogurt", "1dairy"])
def test_category_code_is_lowercase_snake_case(session: Session, code: str) -> None:
    session.add(Category(code=code, name_it="Latticini"))
    with violates("ck_category_code_format"):
        session.flush()


# --- Nomi degli alimenti ------------------------------------------------------------------


def test_names_are_unique_per_language_ignoring_case(session: Session) -> None:
    food = add_food(session)
    session.add(FoodName(food_id=food.id, lang=Language.IT, name="Albume", origin=NameOrigin.LLM))
    session.add(
        FoodName(food_id=food.id, lang=Language.FR, name="Albume", origin=NameOrigin.SOURCE)
    )
    session.flush()

    session.add(FoodName(food_id=food.id, lang=Language.IT, name="albume", origin=NameOrigin.USER))
    with violates("uq_food_name_food_id_lang_lower_name"):
        session.flush()


def test_name_language_and_origin_are_checked(session: Session) -> None:
    food = add_food(session)
    expect_violation(
        session,
        "ck_food_name_lang",
        "INSERT INTO food_name (id, food_id, lang, name, origin) "
        "VALUES (:id, :food_id, 'de', 'Eiweiß', 'source')",
        id=uuid.uuid4(),
        food_id=food.id,
    )
