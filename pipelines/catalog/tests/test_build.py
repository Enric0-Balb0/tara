from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from tara_catalog import build

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "ciqual"
DATED = ("alim", "alim_grp", "const", "compo")


@pytest.fixture
def raw_folder(tmp_path: Path) -> Path:
    """Le fixture con i nomi datati dei file pubblicati da Anses."""
    folder = tmp_path / "raw"
    folder.mkdir()
    for name in DATED:
        shutil.copy(FIXTURES / f"{name}.xml", folder / f"{name}_2025_11_03.xml")
    return folder


def test_build_writes_one_food_per_line_and_a_report(raw_folder: Path, tmp_path: Path) -> None:
    out = tmp_path / "build"

    build.build_ciqual(raw_folder, out)

    lines = (out / "alimenti.jsonl").read_text(encoding="utf-8").splitlines()
    foods = [json.loads(line) for line in lines]
    report = json.loads((out / "report.json").read_text(encoding="utf-8"))
    assert [food["source_code"] for food in foods] == ["9104", "11017", "22001", "36017"]
    assert foods[2]["names"]["fr"] == "Oeuf, blanc (blanc d'oeuf), cru"
    assert report["foods"] == 4


def test_summary_lists_coverage_and_fallbacks(raw_folder: Path, tmp_path: Path) -> None:
    table = build.build_ciqual(raw_folder, tmp_path / "build")

    text = build.summary(table)

    assert "alimenti: 4" in text
    assert "folate_ug" in text and "da codice di ripiego" in text
    assert "trace:" in text


def test_cli_builds_into_the_source_folder(
    raw_folder: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    raw_root = raw_folder.parent / "raw-root"
    shutil.copytree(raw_folder, raw_root / "ciqual-2025")
    monkeypatch.setattr(build, "RAW_DIR", raw_root)
    monkeypatch.setattr(build, "BUILD_DIR", tmp_path / "out")

    build.main(["ciqual"])

    assert (tmp_path / "out" / "ciqual-2025" / "alimenti.jsonl").exists()
    assert "alimenti: 4" in capsys.readouterr().out
