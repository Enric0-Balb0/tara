from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

import pytest
from pydantic_ai.messages import ModelMessage, ModelResponse, ToolCallPart, UserPromptPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from tara_catalog import translate
from tara_catalog.build import build_ciqual
from tara_catalog.translation import PROMPT_VERSION, load_eval_cases

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "ciqual"
GOOD = {
    "22001": {"name_it": "Albume d'uovo", "state": "raw"},
    "36017": {"name_it": "Petto di pollo senza pelle", "state": "raw"},
    "9104": {"name_it": "Riso bianco", "state": "cooked", "cooking": "lessato"},
    "11017": {"name_it": "Sale bianco non iodato", "state": "not_applicable"},
}


def echo_model(answers: dict[str, dict[str, Any]] = GOOD) -> FunctionModel:
    def respond(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        prompt = next(
            p.content
            for m in messages
            for p in getattr(m, "parts", [])
            if isinstance(p, UserPromptPart)
        )
        assert isinstance(prompt, str)
        codes = [line.split(" | ")[0] for line in prompt.splitlines()]
        items = [{"code": c, **answers[c]} for c in codes if c in answers]
        return ModelResponse(parts=[ToolCallPart(info.output_tools[0].name, {"items": items})])

    return FunctionModel(respond)


@pytest.fixture
def snapshot(tmp_path: Path) -> Path:
    raw = tmp_path / "raw"
    raw.mkdir()
    for name in ("alim", "alim_grp", "const", "compo"):
        shutil.copy(FIXTURES / f"{name}.xml", raw / f"{name}_2025_11_03.xml")
    build_ciqual(raw, tmp_path / "build")
    return tmp_path / "build" / "alimenti.jsonl"


def test_snapshot_foods_reads_original_names(snapshot: Path) -> None:
    foods = translate.snapshot_foods(snapshot)

    assert [food.code for food in foods] == ["9104", "11017", "22001", "36017"]
    assert foods[2].name_en == "Egg white, raw"


def test_missing_snapshot_explains_how_to_build_it(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError, match="tara_catalog.build ciqual"):
        translate.snapshot_foods(tmp_path / "alimenti.jsonl")


def test_eval_scores_the_cases_found_in_the_snapshot(snapshot: Path, tmp_path: Path) -> None:
    report, path = translate.run_eval(
        echo_model(), "test:fake", snapshot=snapshot, out_dir=tmp_path / "eval"
    )

    assert report["cases"] == len(load_eval_cases())
    assert report["translated"] == 4
    saved = json.loads(path.read_text(encoding="utf-8"))
    assert saved["model"] == "test:fake"
    assert path.name == f"{PROMPT_VERSION}__test_fake.json"
    text = translate.format_eval(report, "test:fake")
    assert "stato corretto" in text and "non tradotto" in text


def test_cli_translates_with_the_configured_model(
    snapshot: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setenv("TARA_AI_MODEL", "test:fake")
    monkeypatch.setenv("TARA_AI_MIN_INTERVAL_S", "0")
    monkeypatch.setattr(translate, "SNAPSHOT", snapshot)
    monkeypatch.setattr(translate, "TRANSLATIONS", tmp_path / "traduzioni.jsonl")
    monkeypatch.setattr(translate, "USAGE_LOG", tmp_path / "uso-ai.jsonl")

    translate.main(["ciqual"], model=echo_model())

    assert "tradotti 4" in capsys.readouterr().out
    lines = (tmp_path / "traduzioni.jsonl").read_text(encoding="utf-8").splitlines()
    assert len(lines) == 4
    assert (tmp_path / "uso-ai.jsonl").exists()


def test_cli_eval_prints_the_report(
    snapshot: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setenv("TARA_AI_MODEL", "test:fake")
    monkeypatch.setenv("TARA_AI_MIN_INTERVAL_S", "0")
    monkeypatch.setattr(translate, "SNAPSHOT", snapshot)
    monkeypatch.setattr(translate, "EVAL_DIR", tmp_path / "eval")

    translate.main(["eval"], model=echo_model())

    assert "modello test:fake" in capsys.readouterr().out


def test_cli_writes_the_review_file_for_the_configured_model(
    snapshot: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setenv("TARA_AI_MODEL", "test:fake")
    monkeypatch.setenv("TARA_AI_MIN_INTERVAL_S", "0")
    monkeypatch.setattr(translate, "SNAPSHOT", snapshot)
    monkeypatch.setattr(translate, "TRANSLATIONS", tmp_path / "traduzioni.jsonl")
    monkeypatch.setattr(translate, "USAGE_LOG", tmp_path / "uso-ai.jsonl")
    monkeypatch.setattr(translate, "REVIEW", tmp_path / "revisione.csv")
    translate.main(["ciqual"], model=echo_model())
    other = {
        **json.loads((tmp_path / "traduzioni.jsonl").read_text(encoding="utf-8").splitlines()[0])
    }
    other["model"] = "test:altro"
    with (tmp_path / "traduzioni.jsonl").open("a", encoding="utf-8") as f:
        f.write(json.dumps(other) + "\n")

    translate.main(["revisione"])

    lines = (tmp_path / "revisione.csv").read_text(encoding="utf-8-sig").splitlines()
    assert lines[0].startswith("codice;motivo;")
    # gli alimenti delle fixture che sono nel set di valutazione, una riga ciascuno
    assert len(lines) - 1 == 4
    assert "righe da rivedere: 4" in capsys.readouterr().out
