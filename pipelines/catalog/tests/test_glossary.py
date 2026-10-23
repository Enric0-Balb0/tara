import csv
from pathlib import Path

import pytest

from tara_catalog.glossary import Glossary, check_state, load_glossary

DATA = Path(__file__).resolve().parents[1] / "data"


@pytest.fixture(scope="module")
def glossary() -> Glossary:
    return load_glossary()


def test_glossary_terms_are_unique_per_language(glossary: Glossary) -> None:
    for lang in ("en", "fr"):
        seen = [src.casefold() for term in glossary.terms for src in term.sources[lang]]
        assert len(seen) == len(set(seen)), f"termine duplicato in {lang}"


def test_glossary_states_are_valid(glossary: Glossary) -> None:
    assert {term.state for term in glossary.terms} <= {"raw", "cooked", None}


def test_italian_hints_from_ciqual_name(glossary: Glossary) -> None:
    hints = glossary.italian_hints("Poulet, filet, sans peau, cru", "fr")
    assert hints == ["crudo", "senza pelle"]


def test_matches_whole_words_only(glossary: Glossary) -> None:
    # "crue" è un termine, ma non deve scattare dentro "écrue" o "cruelle".
    assert glossary.matches("Farine écrue", "fr") == []


def test_raw_original_translated_as_cooked_is_flagged(glossary: Glossary) -> None:
    issues = check_state(
        glossary,
        {"fr": "Poulet, filet, sans peau, cru", "en": "Chicken, breast, skinless, raw"},
        "cooked",
    )
    assert issues


def test_cooked_original_translated_as_raw_is_flagged(glossary: Glossary) -> None:
    issues = check_state(glossary, {"fr": "Riz blanc, cuit", "en": "Rice, white, cooked"}, "raw")
    assert issues


def test_consistent_translations_pass(glossary: Glossary) -> None:
    assert check_state(glossary, {"en": "Egg, white, raw"}, "raw") == []
    assert check_state(glossary, {"fr": "Thon, appertisé, égoutté"}, "not_applicable") == []
    assert check_state(glossary, {"fr": "Riz blanc, cuit à l'eau"}, "cooked") == []


def test_nutrient_table_has_unique_codes() -> None:
    with (DATA / "nutrienti.csv").open(encoding="utf-8") as f:
        codes = [row["codice"] for row in csv.DictReader(f)]
    assert len(codes) == len(set(codes))
    assert {"energy_kcal", "protein_g", "carbs_g", "fat_g", "potassium_mg"} <= set(codes)


def test_cooked_original_translated_as_not_applicable_is_flagged(glossary: Glossary) -> None:
    issues = check_state(glossary, {"fr": "Poulet, filet sans peau grillé/poêlé"}, "not_applicable")
    assert issues


def test_original_with_both_states_goes_to_review(glossary: Glossary) -> None:
    issues = check_state(glossary, {"fr": "Banane plantain, crue puis cuite"}, "cooked")
    assert issues
