"""Revisione manuale delle traduzioni: CSV per Excel in uscita."""

from __future__ import annotations

import csv
from pathlib import Path

import pytest

from tara_catalog.review import COLUMNS, STATE_LABELS, ReviewInProgressError, export_review
from tara_catalog.translation import PROMPT_VERSION, SourceFood, TranslationRecord

FOODS = [
    SourceFood("22001", "Oeuf, blanc (blanc d'oeuf), cru", "Egg white, raw"),
    SourceFood("19644", "Fromage blanc, nature, 0% MG", "Quark, plain, 0% fat"),
    SourceFood("4032", "Frites de pommes de terre, surgelées, cuites", "Chips, frozen, cooked"),
    SourceFood("9100", "Riz blanc, cru", "Rice, white, raw"),
]


def record(code: str, name: str, state: str, issues: list[str] | None = None) -> TranslationRecord:
    return {
        "source_code": code,
        "name_it": name,
        "aliases_it": ["alias uno", "alias due"] if code == "22001" else [],
        "state": state,  # type: ignore[typeddict-item]
        "cooking": "fritto" if code == "4032" else None,
        "part": None,
        "issues": issues or [],
        "model": "google:test",
        "prompt_version": PROMPT_VERSION,
    }


RECORDS = [
    record("22001", "Albume d'uovo", "raw"),
    record("19644", "Formaggio bianco, 0% grassi", "not_applicable"),
    record("4032", "Patatine fritte, surgelate", "cooked", ["cottura nel nome: 'Patatine fritte'"]),
    record("9100", "Riso bianco", "raw"),
]


def rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f, delimiter=";"))


def test_review_lists_diet_foods_first_then_flagged(tmp_path: Path) -> None:
    out = tmp_path / "revisione.csv"

    count = export_review(RECORDS, FOODS, out, diet_codes={"22001", "19644"})

    exported = rows(out)
    assert count == 3
    assert [(r["codice"], r["motivo"]) for r in exported] == [
        ("22001", "dieta"),
        ("19644", "dieta"),
        ("4032", "segnalato"),
    ]


def test_review_row_shows_the_proposal_in_italian_and_empty_corrections(tmp_path: Path) -> None:
    out = tmp_path / "revisione.csv"

    export_review(RECORDS, FOODS, out, diet_codes={"22001"})

    egg = rows(out)[0]
    assert egg["originale"] == "Oeuf, blanc (blanc d'oeuf), cru"
    assert egg["inglese"] == "Egg white, raw"
    assert egg["nome_proposto"] == "Albume d'uovo"
    assert egg["stato_proposto"] == "crudo"
    assert egg["alias_proposti"] == "alias uno | alias due"
    assert all(egg[column] == "" for column in ("ok", "nome", "stato", "cottura", "alias", "note"))


def test_flagged_rows_carry_their_problems(tmp_path: Path) -> None:
    out = tmp_path / "revisione.csv"

    export_review(RECORDS, FOODS, out, diet_codes=set())

    fries = rows(out)[0]
    assert fries["motivo"] == "segnalato"
    assert fries["cottura_proposta"] == "fritto"
    assert "cottura nel nome" in fries["problemi"]


def test_file_opens_in_italian_excel(tmp_path: Path) -> None:
    """Excel italiano: separatore ";" e BOM UTF-8, altrimenti accenti e colonne si rompono."""
    out = tmp_path / "revisione.csv"

    export_review(RECORDS, FOODS, out, diet_codes={"22001"})

    raw = out.read_bytes()
    assert raw.startswith(b"\xef\xbb\xbf")
    assert raw.decode("utf-8-sig").splitlines()[0].startswith("codice;motivo;")


def test_state_labels_cover_every_state() -> None:
    assert set(STATE_LABELS) == {"raw", "cooked", "not_applicable"}


def test_cooking_columns_come_last(tmp_path: Path) -> None:
    """La cottura è secondaria: le sue colonne stanno in fondo al file."""
    out = tmp_path / "revisione.csv"

    export_review(RECORDS, FOODS, out, diet_codes={"22001"})

    header = out.read_text(encoding="utf-8-sig").splitlines()[0].split(";")
    assert header[-2:] == ["cottura_proposta", "cottura"]


def test_a_review_with_corrections_is_never_overwritten(tmp_path: Path) -> None:
    out = tmp_path / "revisione.csv"
    export_review(RECORDS, FOODS, out, diet_codes={"22001"})
    lines = out.read_text(encoding="utf-8-sig").splitlines()
    cells = lines[1].split(";")
    cells[COLUMNS.index("ok")] = "x"
    lines[1] = ";".join(cells)
    out.write_text("\n".join(lines) + "\n", encoding="utf-8-sig")

    with pytest.raises(ReviewInProgressError, match="1 righe"):
        export_review(RECORDS, FOODS, out, diet_codes={"22001"})


def test_an_untouched_review_can_be_regenerated(tmp_path: Path) -> None:
    out = tmp_path / "revisione.csv"
    export_review(RECORDS, FOODS, out, diet_codes={"22001"})

    assert export_review(RECORDS, FOODS, out, diet_codes={"22001", "9100"}) == 3
