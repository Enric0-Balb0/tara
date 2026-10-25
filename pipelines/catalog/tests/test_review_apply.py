"""Applicazione delle correzioni del CSV di revisione al file versionato data/revisioni.csv."""

from __future__ import annotations

import csv
from pathlib import Path

import pytest

from tara_catalog.review import (
    COLUMNS,
    ReviewError,
    apply_review,
    export_review,
    load_reviewed,
)
from tara_catalog.translation import PROMPT_VERSION, SourceFood, TranslationRecord

FOODS = [
    SourceFood("22001", "Oeuf, blanc (blanc d'oeuf), cru", "Egg white, raw"),
    SourceFood("19644", "Fromage blanc, nature, 0% MG", "Quark, plain, 0% fat"),
    SourceFood("36017", "Poulet, filet sans peau cru", "Chicken, breast, raw"),
    SourceFood("9100", "Riz blanc, cru", "Rice, white, raw"),
]


def record(code: str, name: str, state: str = "raw") -> TranslationRecord:
    return {
        "source_code": code,
        "name_it": name,
        "aliases_it": ["chiara d'uovo"] if code == "22001" else [],
        "state": state,  # type: ignore[typeddict-item]
        "cooking": None,
        "part": None,
        "issues": [],
        "model": "google:test",
        "prompt_version": PROMPT_VERSION,
    }


RECORDS = [
    record("22001", "Albume d'uovo"),
    record("19644", "Formaggio bianco, 0% grassi", "not_applicable"),
    record("36017", "Pollo, petto senza pelle"),
    record("9100", "Riso bianco"),
]
DIET = {"22001", "19644", "36017", "9100"}


@pytest.fixture
def review(tmp_path: Path) -> Path:
    path = tmp_path / "revisione.csv"
    export_review(RECORDS, FOODS, path, diet_codes=DIET)
    return path


def fill(path: Path, code: str, **values: str) -> None:
    """Simula Excel: compila le colonne indicate nella riga dell'alimento."""
    with path.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f, delimiter=";"))
    for row in rows:
        if row["codice"] == code:
            row.update(values)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS, delimiter=";")
        writer.writeheader()
        writer.writerows(rows)


def test_ok_confirms_the_proposal(review: Path, tmp_path: Path) -> None:
    reviewed = tmp_path / "revisioni.csv"
    fill(review, "22001", ok="x")

    summary = apply_review(review, reviewed)

    entries = load_reviewed(reviewed)
    assert summary == {"applied": 1, "total": 1}
    assert entries["22001"].name == "Albume d'uovo"
    assert entries["22001"].state == "raw"
    assert entries["22001"].aliases == ("chiara d'uovo",)


def test_corrections_replace_only_the_filled_fields(review: Path, tmp_path: Path) -> None:
    reviewed = tmp_path / "revisioni.csv"
    fill(review, "19644", nome="Quark magro, 0% di grassi", alias="quark | fromage blanc")
    fill(review, "36017", nome="Petto di pollo senza pelle", note="nome più naturale")

    apply_review(review, reviewed)

    entries = load_reviewed(reviewed)
    assert entries["19644"].name == "Quark magro, 0% di grassi"
    assert entries["19644"].state == "not_applicable"
    assert entries["19644"].aliases == ("quark", "fromage blanc")
    assert entries["36017"].name == "Petto di pollo senza pelle"
    assert entries["36017"].note == "nome più naturale"


def test_untouched_rows_are_ignored(review: Path, tmp_path: Path) -> None:
    reviewed = tmp_path / "revisioni.csv"
    fill(review, "22001", ok="x")

    apply_review(review, reviewed)

    assert set(load_reviewed(reviewed)) == {"22001"}


@pytest.mark.parametrize(
    ("label", "state"),
    [("crudo", "raw"), ("Cotto", "cooked"), ("n.a.", "not_applicable"), ("na", "not_applicable")],
)
def test_state_labels_in_italian_are_understood(
    review: Path, tmp_path: Path, label: str, state: str
) -> None:
    reviewed = tmp_path / "revisioni.csv"
    fill(review, "9100", stato=label)

    apply_review(review, reviewed)

    assert load_reviewed(reviewed)["9100"].state == state


def test_cooking_is_kept_only_for_cooked_foods(review: Path, tmp_path: Path) -> None:
    reviewed = tmp_path / "revisioni.csv"
    fill(review, "9100", stato="cotto", cottura="lessato")
    fill(review, "22001", cottura="lessato")

    apply_review(review, reviewed)

    entries = load_reviewed(reviewed)
    assert entries["9100"].cooking == "lessato"
    assert entries["22001"].cooking is None


@pytest.mark.parametrize(
    ("fields", "message"),
    [
        ({"stato": "bollito"}, "stato"),
        ({"nome": "Riso bianco crudo"}, "crudo"),
        ({"nome": "  ", "ok": ""}, None),
    ],
)
def test_invalid_corrections_stop_everything(
    review: Path, tmp_path: Path, fields: dict[str, str], message: str | None
) -> None:
    reviewed = tmp_path / "revisioni.csv"
    fill(review, "22001", ok="x")
    fill(review, "9100", **fields)

    if message is None:  # nome vuoto = nessuna correzione: la riga resta non toccata
        apply_review(review, reviewed)
        assert set(load_reviewed(reviewed)) == {"22001"}
        return
    with pytest.raises(ReviewError, match=message) as error:
        apply_review(review, reviewed)
    assert "9100" in str(error.value)
    assert not reviewed.exists()


def test_new_reviews_merge_with_previous_ones(review: Path, tmp_path: Path) -> None:
    reviewed = tmp_path / "revisioni.csv"
    fill(review, "22001", ok="x")
    fill(review, "9100", ok="x")
    apply_review(review, reviewed)

    second = tmp_path / "revisione-2.csv"
    export_review(RECORDS, FOODS, second, diet_codes=DIET)
    fill(second, "9100", nome="Riso bianco comune")
    fill(second, "36017", ok="x")
    summary = apply_review(second, reviewed)

    entries = load_reviewed(reviewed)
    assert summary == {"applied": 2, "total": 3}
    assert entries["9100"].name == "Riso bianco comune"
    assert set(entries) == {"22001", "9100", "36017"}


def test_reviewed_file_is_sorted_by_code_number(review: Path, tmp_path: Path) -> None:
    reviewed = tmp_path / "revisioni.csv"
    fill(review, "9100", ok="x")
    fill(review, "22001", ok="x")

    apply_review(review, reviewed)

    codes = [line.split(",")[0] for line in reviewed.read_text(encoding="utf-8").splitlines()[1:]]
    assert codes == ["9100", "22001"]  # ordine numerico dei codici CIQUAL


def test_applied_review_is_archived_so_a_new_one_can_be_generated(
    review: Path, tmp_path: Path
) -> None:
    reviewed = tmp_path / "revisioni.csv"
    fill(review, "22001", ok="x")

    apply_review(review, reviewed)

    assert not review.exists()
    assert len(list(tmp_path.glob("revisione-applicata-*.csv"))) == 1
    export_review(RECORDS, FOODS, review, diet_codes=DIET, reviewed_codes={"22001"})
    with review.open(encoding="utf-8-sig", newline="") as f:
        codes = [row["codice"] for row in csv.DictReader(f, delimiter=";")]
    assert "22001" not in codes
