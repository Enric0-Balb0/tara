import csv
from pathlib import Path

import pytest

from tara_catalog.glossary import check_state, load_glossary

DATA = Path(__file__).resolve().parents[1] / "data"


@pytest.fixture(scope="module")
def glossary():
    return load_glossary()


def test_glossary_terms_are_unique_per_language(glossary) -> None:
    for lang in ("en", "fr"):
        seen = [src.casefold() for term in glossary.terms for src in term.sources[lang]]
        assert len(seen) == len(set(seen)), f"termine duplicato in {lang}"


def test_glossary_states_are_valid(glossary) -> None:
    assert {term.state for term in glossary.terms} <= {"crudo", "cotto", None}


def test_italian_hints_from_ciqual_name(glossary) -> None:
    hints = glossary.italian_hints("Poulet, filet, sans peau, cru", "fr")
    assert hints == ["crudo", "senza pelle"]


def test_matches_whole_words_only(glossary) -> None:
    # "crue" è un termine, ma non deve scattare dentro "écrue" o "cruelle".
    assert glossary.matches("Farine écrue", "fr") == []


def test_raw_original_translated_as_cooked_is_flagged(glossary) -> None:
    issues = check_state(
        glossary,
        {"fr": "Poulet, filet, sans peau, cru", "en": "Chicken, breast, skinless, raw"},
        "cotto",
    )
    assert issues


def test_cooked_original_translated_as_raw_is_flagged(glossary) -> None:
    issues = check_state(glossary, {"fr": "Riz blanc, cuit", "en": "Rice, white, cooked"}, "crudo")
    assert issues


def test_consistent_translations_pass(glossary) -> None:
    assert check_state(glossary, {"en": "Egg, white, raw"}, "crudo") == []
    assert check_state(glossary, {"fr": "Thon, appertisé, égoutté"}, "na") == []
    assert check_state(glossary, {"fr": "Riz blanc, cuit à l'eau"}, "cotto") == []


def test_nutrient_table_has_unique_codes() -> None:
    with (DATA / "nutrienti.csv").open(encoding="utf-8") as f:
        codes = [row["codice"] for row in csv.DictReader(f)]
    assert len(codes) == len(set(codes))
    assert {"energy_kcal", "protein_g", "carbs_g", "fat_g", "potassium_mg"} <= set(codes)
