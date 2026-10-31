from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from tara_catalog import export
from tara_catalog.export import DuplicateNamesError, export_catalog
from tara_catalog.translation import PROMPT_VERSION

MODEL = "test:fake"
PROTEIN = {
    "amount": "10.9",
    "ciqual_code": 25003,
    "confidence": 0.85,
    "kind": "measured",
    "provenance": "reference",
}


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> Path:
    path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")
    return path


def food(code: str, fr: str, en: str) -> dict[str, Any]:
    return {
        "groups": ["01"],
        "names": {"fr": fr, "en": en},
        "nutrients": {"protein_g": PROTEIN},
        "source": "ciqual",
        "source_code": code,
    }


def translation(code: str, name: str, state: str, **fields: Any) -> dict[str, Any]:
    return {
        "source_code": code,
        "name_it": name,
        "aliases_it": [],
        "state": state,
        "cooking": None,
        "part": None,
        "issues": [],
        "model": MODEL,
        "prompt_version": PROMPT_VERSION,
        **fields,
    }


@pytest.fixture
def files(tmp_path: Path) -> dict[str, Path]:
    snapshot = write_jsonl(
        tmp_path / "alimenti.jsonl",
        [
            food("22001", "Oeuf, blanc (blanc d'oeuf), cru", "Egg white, raw"),
            food("9104", "Riz blanc, cuit, sans sel ajouté", "Rice, white, cooked"),
            food("11017", "Sel blanc non iodé", "Salt, white, non-iodised"),
        ],
    )
    translations = write_jsonl(
        tmp_path / "traduzioni.jsonl",
        [
            translation(
                "22001", "Albume d'uovo", "raw", aliases_it=["Chiara d'uovo", "ALBUME D'UOVO"]
            ),
            translation("9104", "Riso bianco, cotto", "cooked"),
            # una traduzione di un altro modello non conta
            translation("11017", "Sale", "not_applicable", model="test:altro"),
        ],
    )
    return {
        "snapshot": snapshot,
        "translations": translations,
        "reviewed": tmp_path / "revisioni.csv",
        "out": tmp_path / "catalogo.jsonl",
    }


def run(files: dict[str, Path]) -> tuple[export.ExportSummary, dict[str, dict[str, Any]]]:
    summary = export_catalog(
        MODEL,
        files["out"],
        snapshot=files["snapshot"],
        translations=files["translations"],
        reviewed_path=files["reviewed"],
    )
    lines = files["out"].read_text(encoding="utf-8").splitlines()
    return summary, {entry["source_code"]: entry for entry in map(json.loads, lines)}


def test_catalog_has_italian_name_state_names_and_nutrients(files: dict[str, Path]) -> None:
    _, catalog = run(files)

    egg = catalog["22001"]
    assert egg["name"] == "Albume d'uovo"
    assert egg["state"] == "raw"
    assert egg["names"] == [
        {"lang": "it", "name": "Albume d'uovo", "origin": "llm"},
        {"lang": "it", "name": "Chiara d'uovo", "origin": "llm"},
        {"lang": "fr", "name": "Oeuf, blanc (blanc d'oeuf), cru", "origin": "source"},
        {"lang": "en", "name": "Egg white, raw", "origin": "source"},
    ]
    assert egg["nutrients"] == {
        "protein_g": {"amount": "10.9", "provenance": "reference", "confidence": 0.85}
    }


def test_saved_translations_pass_through_the_current_rules(files: dict[str, Path]) -> None:
    _, catalog = run(files)

    assert catalog["9104"]["name"] == "Riso bianco"


def test_foods_without_translation_are_left_out_and_counted(files: dict[str, Path]) -> None:
    summary, catalog = run(files)

    assert "11017" not in catalog
    assert summary == {"foods": 2, "reviewed": 0, "flagged": 0, "untranslated": 1}


def test_manual_review_wins_over_the_model(files: dict[str, Path]) -> None:
    files["reviewed"].write_text(
        "codice,nome,stato,cottura,alias,note\n"
        "22001,Albume,raw,,Albume d'uovo | albume | Chiara,\n",
        encoding="utf-8",
    )

    summary, catalog = run(files)

    egg = catalog["22001"]
    assert egg["name"] == "Albume"
    assert [n for n in egg["names"] if n["lang"] == "it"] == [
        {"lang": "it", "name": "Albume", "origin": "reviewed"},
        {"lang": "it", "name": "Albume d'uovo", "origin": "reviewed"},
        {"lang": "it", "name": "Chiara", "origin": "reviewed"},
    ]
    assert summary["reviewed"] == 1


def test_catalog_entry_carries_the_cooking_method(files: dict[str, Path]) -> None:
    write_jsonl(
        files["translations"],
        [
            translation("22001", "Albume d'uovo", "raw"),
            translation("9104", "Riso bianco", "cooked", cooking="lessato"),
        ],
    )

    _, catalog = run(files)

    assert catalog["9104"]["cooking"] == "lessato"
    assert catalog["22001"]["cooking"] is None


def test_reviewed_cooking_wins_over_the_model(files: dict[str, Path]) -> None:
    files["reviewed"].write_text(
        "codice,nome,stato,cottura,alias,note\n9104,Riso bianco,cooked,al vapore,,\n",
        encoding="utf-8",
    )

    _, catalog = run(files)

    assert catalog["9104"]["cooking"] == "al vapore"


def test_export_refuses_foods_that_look_the_same(files: dict[str, Path]) -> None:
    """Due alimenti con stesso nome, stato e cottura non si distinguono nell'app."""
    write_jsonl(
        files["translations"],
        [
            translation("22001", "Albume d'uovo", "raw"),
            translation("9104", "albume d'uovo", "raw"),
        ],
    )

    with pytest.raises(DuplicateNamesError, match=r"«Albume d'uovo» \(raw\): 22001, 9104"):
        run(files)
    assert not files["out"].exists()


def test_review_can_resolve_foods_that_look_the_same(files: dict[str, Path]) -> None:
    write_jsonl(
        files["translations"],
        [
            translation("22001", "Albume d'uovo", "raw"),
            translation("9104", "Albume d'uovo", "raw"),
        ],
    )
    files["reviewed"].write_text(
        "codice,nome,stato,cottura,alias,note\n9104,Riso bianco,cooked,,,\n",
        encoding="utf-8",
    )

    _, catalog = run(files)

    assert catalog["9104"]["name"] == "Riso bianco"


def test_cli_exports_with_the_configured_model(
    files: dict[str, Path], monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("TARA_AI_MODEL", MODEL)
    monkeypatch.setattr(export, "CATALOG", files["out"])
    monkeypatch.setattr(
        export,
        "export_catalog",
        lambda model_id, out: export_catalog(
            model_id,
            out,
            snapshot=files["snapshot"],
            translations=files["translations"],
            reviewed_path=files["reviewed"],
        ),
    )

    export.main(["ciqual"])

    out = capsys.readouterr().out
    assert "alimenti nel catalogo: 2" in out
    assert files["out"].exists()


def test_cli_explains_why_it_stops_on_foods_that_look_the_same(
    files: dict[str, Path], monkeypatch: pytest.MonkeyPatch
) -> None:
    write_jsonl(
        files["translations"],
        [
            translation("22001", "Albume d'uovo", "raw"),
            translation("9104", "Albume d'uovo", "raw"),
        ],
    )
    monkeypatch.setenv("TARA_AI_MODEL", MODEL)
    monkeypatch.setattr(
        export,
        "export_catalog",
        lambda model_id, out: export_catalog(
            model_id,
            out,
            snapshot=files["snapshot"],
            translations=files["translations"],
            reviewed_path=files["reviewed"],
        ),
    )

    with pytest.raises(
        SystemExit, match=r"(?s)catalogo non scritto: .*sembrerebbero uguali: 1;.*22001, 9104"
    ):
        export.main(["ciqual"])
