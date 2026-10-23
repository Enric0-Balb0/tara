"""Import di CIQUAL 2025 su un estratto reale di 4 alimenti (tests/fixtures/ciqual)."""

from __future__ import annotations

import csv
from decimal import Decimal
from pathlib import Path

import pytest

from tara_catalog.ciqual import (
    Amount,
    CiqualFiles,
    CiqualFormatError,
    FoodRecord,
    NutrientEntry,
    apply_derived_confidence,
    load_mapping,
    normalize,
    parse_amount,
    read_ciqual,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "ciqual"
NUTRIENT_TABLE = Path(__file__).resolve().parents[1] / "data" / "nutrienti.csv"
EGG_WHITE, CHICKEN, RICE, SALT = "22001", "36017", "9104", "11017"


@pytest.fixture(scope="module")
def foods() -> dict[str, FoodRecord]:
    files = CiqualFiles(
        foods=FIXTURES / "alim.xml",
        groups=FIXTURES / "alim_grp.xml",
        constituents=FIXTURES / "const.xml",
        composition=FIXTURES / "compo.xml",
    )
    result = normalize(read_ciqual(files), load_mapping())
    return {food.source_code: food.to_json() for food in result.foods}


# --- Valori ---------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("59,7", Amount(Decimal("59.7"), "measured")),
        ("1140", Amount(Decimal("1140"), "measured")),
        ("0", Amount(Decimal("0"), "measured")),
        ("traces", Amount(Decimal("0"), "trace")),
        ("< 2,2", Amount(Decimal("0"), "below_limit")),
        ("< 50", Amount(Decimal("0"), "below_limit")),
    ],
)
def test_parse_amount(raw: str, expected: Amount) -> None:
    assert parse_amount(raw) == expected


def test_dash_means_missing() -> None:
    assert parse_amount("-") is None


@pytest.mark.parametrize("raw", ["", "n.d.", "-3", "< abc", "1.2.3"])
def test_unknown_formats_stop_the_import(raw: str) -> None:
    with pytest.raises(CiqualFormatError):
        parse_amount(raw)


# --- Mappatura ------------------------------------------------------------------------------


def test_mapping_targets_only_known_nutrients() -> None:
    with NUTRIENT_TABLE.open(encoding="utf-8") as f:
        known = {row["codice"] for row in csv.DictReader(f)}

    assert set(load_mapping().nutrients) <= known


def test_mapping_confidence_scale_is_valid() -> None:
    mapping = load_mapping()

    assert set(mapping.confidence_by_code) == {"A", "B", "C", "D"}
    assert all(0 < value <= 1 for value in mapping.confidence_by_code.values())
    assert 0 < mapping.limit_factor < 1
    assert 0 < mapping.fallback_factor < 1


# --- Alimenti normalizzati ------------------------------------------------------------------


def test_names_in_french_and_english(foods: dict[str, FoodRecord]) -> None:
    assert foods[EGG_WHITE]["names"] == {
        "fr": "Oeuf, blanc (blanc d'oeuf), cru",
        "en": "Egg white, raw",
    }


def test_group_codes_are_kept(foods: dict[str, FoodRecord]) -> None:
    assert foods[EGG_WHITE]["groups"] == ["04", "0410", "041002"]
    assert foods[SALT]["groups"] == ["10", "1004"]


def test_egg_white_potassium_comes_from_the_reference_table(
    foods: dict[str, FoodRecord],
) -> None:
    """Esempio guida dell'handoff: l'etichetta dell'albume non ha il potassio, CIQUAL sì."""
    potassium = foods[EGG_WHITE]["nutrients"]["potassium_mg"]

    assert potassium == {
        "amount": "163",
        "provenance": "reference",
        "confidence": 0.85,
        "ciqual_code": 10190,
        "kind": "measured",
    }


def test_protein_and_energy_follow_the_eu_label_rules(
    foods: dict[str, FoodRecord],
) -> None:
    nutrients = foods[EGG_WHITE]["nutrients"]

    assert nutrients["protein_g"]["ciqual_code"] == 25003
    assert nutrients["energy_kcal"]["ciqual_code"] == 328


def test_traces_and_below_limit_are_zero_with_reduced_confidence(
    foods: dict[str, FoodRecord],
) -> None:
    rice = foods[RICE]["nutrients"]

    assert rice["sugars_g"] == {
        "amount": "0",
        "provenance": "reference",
        "confidence": 0.5,
        "ciqual_code": 32000,
        "kind": "trace",
    }
    assert rice["vit_c_mg"]["kind"] == "below_limit"
    assert rice["vit_c_mg"]["amount"] == "0"


def test_fallback_code_is_used_when_the_preferred_one_is_missing(
    foods: dict[str, FoodRecord],
) -> None:
    chicken_folate = foods[CHICKEN]["nutrients"]["folate_ug"]
    rice_folate = foods[RICE]["nutrients"]["folate_ug"]

    assert rice_folate["ciqual_code"] == 56702
    assert rice_folate["confidence"] == 1.0
    assert chicken_folate["ciqual_code"] == 56700
    assert chicken_folate["confidence"] == pytest.approx(0.9)


def test_missing_values_produce_no_entry(foods: dict[str, FoodRecord]) -> None:
    """CIQUAL non ha la caffeina: il nutriente manca, non vale zero."""
    for food in foods.values():
        assert "caffeine_mg" not in food["nutrients"]


def test_measured_zero_is_kept(foods: dict[str, FoodRecord]) -> None:
    salt_protein = foods[SALT]["nutrients"]["protein_g"]

    assert salt_protein["amount"] == "0"
    assert salt_protein["kind"] == "measured"
    assert salt_protein["confidence"] == 0.7


def test_amounts_keep_the_source_precision(foods: dict[str, FoodRecord]) -> None:
    assert foods[CHICKEN]["nutrients"]["protein_g"]["amount"] == "23.4"
    assert foods[SALT]["nutrients"]["sodium_mg"]["amount"] == "39100"


# --- Coerenza con la tabella di riferimento ------------------------------------------------


def test_unit_mismatch_between_mapping_and_ciqual_stops_the_import(tmp_path: Path) -> None:
    const = (FIXTURES / "const.xml").read_text(encoding="utf-8")
    broken = tmp_path / "const.xml"
    broken.write_text(const.replace("Sodium (mg/100 g)", "Sodium (g/100 g)"), encoding="utf-8")
    files = CiqualFiles(
        foods=FIXTURES / "alim.xml",
        groups=FIXTURES / "alim_grp.xml",
        constituents=broken,
        composition=FIXTURES / "compo.xml",
    )

    with pytest.raises(CiqualFormatError, match="sodium_mg"):
        normalize(read_ciqual(files), load_mapping())


def test_mapped_code_missing_from_ciqual_stops_the_import(tmp_path: Path) -> None:
    const = (FIXTURES / "const.xml").read_text(encoding="utf-8")
    broken = tmp_path / "const.xml"
    renamed = const.replace("<const_code> 10190 </const_code>", "<const_code> 99999 </const_code>")
    broken.write_text(renamed, encoding="utf-8")
    files = CiqualFiles(
        foods=FIXTURES / "alim.xml",
        groups=FIXTURES / "alim_grp.xml",
        constituents=broken,
        composition=FIXTURES / "compo.xml",
    )

    with pytest.raises(CiqualFormatError, match="10190"):
        normalize(read_ciqual(files), load_mapping())


def test_value_without_confidence_code_stops_the_import(tmp_path: Path) -> None:
    compo = (FIXTURES / "compo.xml").read_text(encoding="utf-8")
    broken = tmp_path / "compo.xml"
    broken.write_text(
        compo.replace("<code_confiance> B </code_confiance>", '<code_confiance missing=" " />', 1),
        encoding="utf-8",
    )
    files = CiqualFiles(
        foods=FIXTURES / "alim.xml",
        groups=FIXTURES / "alim_grp.xml",
        constituents=FIXTURES / "const.xml",
        composition=broken,
    )

    with pytest.raises(CiqualFormatError, match="code_confiance"):
        normalize(read_ciqual(files), load_mapping())


def test_report_counts_coverage() -> None:
    files = CiqualFiles(
        foods=FIXTURES / "alim.xml",
        groups=FIXTURES / "alim_grp.xml",
        constituents=FIXTURES / "const.xml",
        composition=FIXTURES / "compo.xml",
    )
    report = normalize(read_ciqual(files), load_mapping()).report

    assert report["foods"] == 4
    assert report["coverage"]["protein_g"] == {"foods": 4, "share": 1.0}
    assert report["kinds"]["trace"] >= 1
    assert report["fallbacks"]["folate_ug"] >= 1


# --- File della fonte -----------------------------------------------------------------------


def test_files_are_found_by_their_dated_names(tmp_path: Path) -> None:
    for name in ("alim", "alim_grp", "const", "compo", "sources"):
        (tmp_path / f"{name}_2025_11_03.xml").touch()

    files = CiqualFiles.in_folder(tmp_path)

    assert files.foods.name == "alim_2025_11_03.xml"
    assert files.groups.name == "alim_grp_2025_11_03.xml"
    assert files.constituents.name == "const_2025_11_03.xml"
    assert files.composition.name == "compo_2025_11_03.xml"


def test_missing_file_is_reported(tmp_path: Path) -> None:
    (tmp_path / "alim_2025_11_03.xml").touch()

    with pytest.raises(CiqualFormatError, match="alim_grp"):
        CiqualFiles.in_folder(tmp_path)


def test_energy_confidence_comes_from_its_contributors(foods: dict[str, FoodRecord]) -> None:
    """CIQUAL calcola l'energia e le assegna sempre il codice D (§3.3.6): la sua confidenza
    è quella del macronutriente meno affidabile, non quella del codice D."""
    egg_white = foods[EGG_WHITE]["nutrients"]
    contributors = ("protein_g", "carbs_g", "fat_g", "fiber_g", "alcohol_g")

    expected = min(egg_white[c]["confidence"] for c in contributors)

    assert egg_white["energy_kcal"]["confidence"] == expected
    assert egg_white["energy_kj"]["confidence"] == expected
    assert expected > load_mapping().confidence_by_code["D"]


def test_mapping_derived_nutrients_use_mapped_contributors() -> None:
    mapping = load_mapping()

    for nutrient, contributors in mapping.derived.items():
        assert nutrient in mapping.nutrients
        assert set(contributors) <= set(mapping.nutrients)


def test_negligible_contributors_do_not_lower_energy_confidence() -> None:
    """Grassi "< 0,5" in un frutto valgono ~0 kcal: non devono dimezzare la confidenza."""

    def entry(confidence: float, kind: str = "measured") -> NutrientEntry:
        return {
            "amount": "1",
            "provenance": "reference",
            "confidence": confidence,
            "ciqual_code": 1,
            "kind": kind,  # type: ignore[typeddict-item]
        }

    nutrients = {
        "energy_kcal": entry(0.55),
        "protein_g": entry(1.0),
        "carbs_g": entry(0.85),
        "fat_g": entry(0.5, "below_limit"),
    }

    apply_derived_confidence(nutrients, load_mapping())

    assert nutrients["energy_kcal"]["confidence"] == 0.85
