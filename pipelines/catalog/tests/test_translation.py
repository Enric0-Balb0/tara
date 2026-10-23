"""Traduzione dei nomi con un modello finto (FunctionModel): nessuna chiamata reale."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from pydantic_ai.exceptions import ModelHTTPError
from pydantic_ai.messages import ModelMessage, ModelResponse, ToolCallPart, UserPromptPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from tara_catalog import translation
from tara_catalog.glossary import Glossary, load_glossary
from tara_catalog.translation import (
    PROMPT_VERSION,
    SourceFood,
    TranslationRecord,
    format_request,
    load_eval_cases,
    review_issues,
    score_eval,
    translate_batch,
    translate_pending,
)

EGG_WHITE = SourceFood("22001", "Oeuf, blanc (blanc d'oeuf), cru", "Egg white, raw")
RICE_COOKED = SourceFood(
    "9104", "Riz blanc, cuit, sans sel ajouté", "Rice, white, cooked, no added salt"
)
TUNA = SourceFood("26039", "Thon, au naturel, appertisé, égoutté", "Tuna, canned in brine, drained")

ANSWERS: dict[str, dict[str, Any]] = {
    "22001": {
        "name_it": "Albume d'uovo",
        "aliases_it": ["Chiara d'uovo"],
        "state": "raw",
        "part": "albume",
    },
    "9104": {"name_it": "Riso bianco", "state": "cooked", "cooking": "lessato"},
    "26039": {"name_it": "Tonno al naturale in scatola, sgocciolato", "state": "not_applicable"},
}


@pytest.fixture(scope="module")
def glossary() -> Glossary:
    return load_glossary()


def codes_in(messages: list[ModelMessage]) -> list[str]:
    prompt = next(
        part.content
        for message in messages
        for part in getattr(message, "parts", [])
        if isinstance(part, UserPromptPart)
    )
    assert isinstance(prompt, str)
    return [line.split(" | ")[0] for line in prompt.splitlines() if " | " in line]


def fake_model(
    answers: dict[str, dict[str, Any]] = ANSWERS, skip: frozenset[str] = frozenset()
) -> FunctionModel:
    """Risponde con le traduzioni preparate per i codici presenti nella richiesta."""

    def respond(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        items = [{"code": c, **answers[c]} for c in codes_in(messages) if c not in skip]
        return ModelResponse(parts=[ToolCallPart(info.output_tools[0].name, {"items": items})])

    return FunctionModel(respond)


# --- Richiesta ------------------------------------------------------------------------------


def test_request_lists_codes_names_and_glossary_hints(glossary: Glossary) -> None:
    chicken = SourceFood(
        "36018", "Poulet, filet sans peau grillé/poêlé", "Chicken, breast, grilled"
    )

    lines = format_request([EGG_WHITE, chicken], glossary).splitlines()

    assert lines[0] == "22001 | Oeuf, blanc (blanc d'oeuf), cru | Egg white, raw |  | "
    assert lines[1] == (
        "36018 | Poulet, filet sans peau grillé/poêlé | Chicken, breast, grilled"
        " | senza pelle | alla griglia, in padella"
    )


def test_state_words_are_never_suggested_for_the_name(glossary: Glossary) -> None:
    """ "crudo"/"cotto" come suggerimento finivano nel nome: lo stato è un campo a parte."""
    request = format_request([EGG_WHITE, RICE_COOKED], glossary)

    assert "crudo" not in request and "cotto" not in request


def test_prompt_is_versioned_in_the_repository() -> None:
    prompt = translation.load_prompt()

    assert PROMPT_VERSION == "traduzione-v2"
    assert "name_it" in prompt and "not_applicable" in prompt


# --- Controlli sulle risposte ---------------------------------------------------------------


def answer(**fields: Any) -> translation.FoodTranslation:
    values: dict[str, Any] = {"code": "9104", "name_it": "Riso bianco", "state": "cooked"}
    values.update(fields)
    return translation.FoodTranslation(**values)


def test_consistent_answer_has_no_issues(glossary: Glossary) -> None:
    assert review_issues(answer(), RICE_COOKED, glossary) == []


@pytest.mark.parametrize("name", ["Riso bianco cotto", "Riso bianco, crudo", "Pollo cotta"])
def test_state_words_in_the_name_are_flagged(glossary: Glossary, name: str) -> None:
    assert any(
        "stato nel nome" in issue
        for issue in review_issues(answer(name_it=name), RICE_COOKED, glossary)
    )


def test_state_inconsistent_with_the_original_is_flagged(glossary: Glossary) -> None:
    issues = review_issues(answer(state="raw"), RICE_COOKED, glossary)

    assert any("cottura" in issue for issue in issues)


def test_cooking_without_cooked_state_is_flagged(glossary: Glossary) -> None:
    issues = review_issues(
        answer(code="22001", state="raw", cooking="lessato", name_it="Albume"), EGG_WHITE, glossary
    )

    assert any("metodo di cottura" in issue for issue in issues)


def test_aliases_repeating_the_name_are_dropped_without_review(glossary: Glossary) -> None:
    def respond(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        item = {
            "code": "9104",
            "name_it": "Riso bianco",
            "state": "cooked",
            "cooking": "lessato",
            "aliases_it": ["riso bianco", "Riso", "riso"],
        }
        return ModelResponse(parts=[ToolCallPart(info.output_tools[0].name, {"items": [item]})])

    result = run(FunctionModel(respond), [RICE_COOKED], glossary)

    assert result.records[0]["aliases_it"] == ["Riso"]
    assert result.records[0]["issues"] == []


# --- Lotti ----------------------------------------------------------------------------------


def run(
    model: FunctionModel, foods: list[SourceFood], glossary: Glossary, **kwargs: Any
) -> translation.BatchResult:
    return translate_batch(model, "test:fake", foods, glossary, sleep=lambda _: None, **kwargs)


def test_batch_returns_one_record_per_food(glossary: Glossary) -> None:
    result = run(fake_model(), [EGG_WHITE, RICE_COOKED, TUNA], glossary)

    by_code = {record["source_code"]: record for record in result.records}
    assert set(by_code) == {"22001", "9104", "26039"}
    assert by_code["22001"]["name_it"] == "Albume d'uovo"
    assert by_code["22001"]["model"] == "test:fake"
    assert by_code["22001"]["prompt_version"] == PROMPT_VERSION
    assert by_code["9104"]["cooking"] == "lessato"
    assert by_code["26039"]["issues"] == []
    assert result.missing == []


def test_foods_left_out_by_the_model_are_reported(glossary: Glossary) -> None:
    result = run(fake_model(skip=frozenset({"26039"})), [EGG_WHITE, TUNA], glossary)

    assert [r["source_code"] for r in result.records] == ["22001"]
    assert result.missing == ["26039"]


def test_rate_limit_is_retried_after_waiting(glossary: Glossary) -> None:
    calls = 0
    waits: list[float] = []
    inner = fake_model()

    def flaky(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise ModelHTTPError(429, "fake", retry_after=7)
        return inner.function(messages, info)  # type: ignore[misc, return-value]

    result = translate_batch(
        FunctionModel(flaky), "test:fake", [EGG_WHITE], glossary, sleep=waits.append
    )

    assert len(result.records) == 1
    assert waits == [7]


def test_persistent_errors_stop_after_the_last_attempt(glossary: Glossary) -> None:
    def always_down(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        raise ModelHTTPError(503, "fake")

    with pytest.raises(ModelHTTPError):
        run(FunctionModel(always_down), [EGG_WHITE], glossary, max_attempts=3)


def test_client_errors_are_not_retried(glossary: Glossary) -> None:
    calls = 0

    def bad_request(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        nonlocal calls
        calls += 1
        raise ModelHTTPError(400, "fake")

    with pytest.raises(ModelHTTPError):
        run(FunctionModel(bad_request), [EGG_WHITE], glossary)
    assert calls == 1


# --- Esecuzione con ripresa -----------------------------------------------------------------


def records_in(path: Path) -> list[TranslationRecord]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def test_pending_foods_are_translated_and_appended(tmp_path: Path, glossary: Glossary) -> None:
    out = tmp_path / "traduzioni.jsonl"

    translate_pending(
        fake_model(),
        "test:fake",
        [EGG_WHITE, RICE_COOKED],
        out,
        glossary=glossary,
        batch_size=1,
        sleep=lambda _: None,
    )

    assert [r["source_code"] for r in records_in(out)] == ["22001", "9104"]


def test_already_translated_foods_are_skipped(tmp_path: Path, glossary: Glossary) -> None:
    out = tmp_path / "traduzioni.jsonl"
    translate_pending(
        fake_model(), "test:fake", [EGG_WHITE], out, glossary=glossary, sleep=lambda _: None
    )
    requested: list[str] = []
    inner = fake_model()

    def spy(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        requested.extend(codes_in(messages))
        return inner.function(messages, info)  # type: ignore[misc, return-value]

    translate_pending(
        FunctionModel(spy),
        "test:fake",
        [EGG_WHITE, TUNA],
        out,
        glossary=glossary,
        sleep=lambda _: None,
    )

    assert requested == ["26039"]
    assert len(records_in(out)) == 2


def test_a_new_model_or_prompt_translates_again(tmp_path: Path, glossary: Glossary) -> None:
    out = tmp_path / "traduzioni.jsonl"
    translate_pending(
        fake_model(), "test:fake", [EGG_WHITE], out, glossary=glossary, sleep=lambda _: None
    )

    translate_pending(
        fake_model(), "test:other", [EGG_WHITE], out, glossary=glossary, sleep=lambda _: None
    )

    assert [r["model"] for r in records_in(out)] == ["test:fake", "test:other"]


def test_limit_caps_the_foods_translated_in_one_run(tmp_path: Path, glossary: Glossary) -> None:
    out = tmp_path / "traduzioni.jsonl"

    summary = translate_pending(
        fake_model(),
        "test:fake",
        [EGG_WHITE, RICE_COOKED, TUNA],
        out,
        glossary=glossary,
        limit=2,
        sleep=lambda _: None,
    )

    assert summary["translated"] == 2
    assert summary["pending"] == 1


def test_usage_is_logged_per_batch(tmp_path: Path, glossary: Glossary) -> None:
    out = tmp_path / "traduzioni.jsonl"
    usage_log = tmp_path / "uso-ai.jsonl"

    translate_pending(
        fake_model(),
        "test:fake",
        [EGG_WHITE, RICE_COOKED],
        out,
        glossary=glossary,
        batch_size=1,
        usage_log=usage_log,
        sleep=lambda _: None,
    )

    entries = [json.loads(line) for line in usage_log.read_text(encoding="utf-8").splitlines()]
    assert len(entries) == 2
    assert entries[0]["model"] == "test:fake"
    assert entries[0]["foods"] == 1
    assert entries[0]["input_tokens"] > 0


# --- Valutazione ----------------------------------------------------------------------------


def test_eval_set_is_well_formed() -> None:
    cases = load_eval_cases()

    assert len(cases) >= 50
    assert len({case.code for case in cases}) == len(cases)
    assert {case.expected_state for case in cases} == {"raw", "cooked", "not_applicable"}
    assert all(case.required_words for case in cases)


def record(code: str, name: str, state: str, issues: list[str] | None = None) -> TranslationRecord:
    return {
        "source_code": code,
        "name_it": name,
        "aliases_it": [],
        "state": state,  # type: ignore[typeddict-item]
        "cooking": None,
        "part": None,
        "issues": issues or [],
        "model": "test:fake",
        "prompt_version": PROMPT_VERSION,
    }


def test_score_counts_state_words_and_exact_names() -> None:
    cases = [c for c in load_eval_cases() if c.code in {"22001", "9104", "26039"}]
    records = [
        record("22001", "Albume d'uovo", "raw"),
        record("9104", "Riso", "raw", ["incoerente"]),
        record("26039", "Tonno al naturale in scatola, sgocciolato", "not_applicable"),
    ]

    report = score_eval(cases, records)

    assert report["cases"] == 3
    assert report["translated"] == 3
    assert report["state_accuracy"] == pytest.approx(2 / 3)
    assert report["name_words_accuracy"] == 1.0
    assert report["exact_names"] == pytest.approx(2 / 3)
    assert report["flagged"] == 1
    assert [f["code"] for f in report["failures"]] == ["9104"]


def test_score_matches_required_words_ignoring_case_and_accents() -> None:
    cases = [c for c in load_eval_cases() if c.code == "13028"]

    report = score_eval(cases, [record("13028", "MIRTILLO", "raw")])

    assert report["name_words_accuracy"] == 1.0


def test_untranslated_cases_count_as_failures() -> None:
    cases = [c for c in load_eval_cases() if c.code in {"22001", "9104"}]

    report = score_eval(cases, [record("22001", "Albume d'uovo", "raw")])

    assert report["translated"] == 1
    assert report["state_accuracy"] == 0.5
    assert {f["code"] for f in report["failures"]} == {"9104"}


# --- Visibilità ----------------------------------------------------------------------------


def test_retries_are_announced_with_the_wait(glossary: Glossary) -> None:
    calls = 0
    messages: list[str] = []
    inner = fake_model()

    def busy_once(messages_: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise ModelHTTPError(503, "fake")
        return inner.function(messages_, info)  # type: ignore[misc, return-value]

    translate_batch(
        FunctionModel(busy_once),
        "test:fake",
        [EGG_WHITE],
        glossary,
        sleep=lambda _: None,
        notify=messages.append,
    )

    assert len(messages) == 1
    assert "503" in messages[0] and "10 s" in messages[0] and "2/" in messages[0]


def test_progress_is_announced_after_each_batch(tmp_path: Path, glossary: Glossary) -> None:
    messages: list[str] = []

    translate_pending(
        fake_model(),
        "test:fake",
        [EGG_WHITE, RICE_COOKED, TUNA],
        tmp_path / "t.jsonl",
        glossary=glossary,
        batch_size=2,
        sleep=lambda _: None,
        notify=messages.append,
    )

    assert messages == ["lotto 1/2: 2 tradotti", "lotto 2/2: 1 tradotti"]


def test_foods_skipped_by_the_model_get_a_second_request(glossary: Glossary) -> None:
    requests: list[list[str]] = []
    inner = fake_model()

    def lazy_first(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        codes = codes_in(messages)
        requests.append(codes)
        if len(requests) == 1:  # la prima risposta salta il tonno
            items = [{"code": c, **ANSWERS[c]} for c in codes if c != "26039"]
            return ModelResponse(parts=[ToolCallPart(info.output_tools[0].name, {"items": items})])
        return inner.function(messages, info)  # type: ignore[misc, return-value]

    result = run(FunctionModel(lazy_first), [EGG_WHITE, TUNA], glossary)

    assert requests == [["22001", "26039"], ["26039"]]
    assert {r["source_code"] for r in result.records} == {"22001", "26039"}
    assert result.missing == []


def test_required_words_accept_alternatives() -> None:
    cases = [c for c in load_eval_cases() if c.code == "13089"]

    report = score_eval(cases, [record("13089", "Banana disidratata", "not_applicable")])

    assert report["name_words_accuracy"] == 1.0


def test_prompt_examples_never_come_from_the_eval_set() -> None:
    """Un esempio del prompt preso dal set di valutazione gonfierebbe i punteggi."""
    prompt = translation.load_prompt()

    leaked = [case.original for case in load_eval_cases() if case.original in prompt]

    assert leaked == []


@pytest.mark.parametrize("empty", ["null", "None", "", "  "])
def test_null_strings_from_the_model_are_no_value(empty: str) -> None:
    item = translation.FoodTranslation(
        code="22001", name_it="Albume d'uovo", state="raw", cooking=empty, part=empty
    )

    assert item.cooking is None
    assert item.part is None


@pytest.mark.parametrize(
    ("name", "cooking"),
    [
        ("Ceci lessati", "lessato"),
        ("Salmone al vapore", "al vapore"),
        ("Pollo alla griglia", "alla griglia"),
    ],
)
def test_cooking_method_in_the_name_is_flagged(glossary: Glossary, name: str, cooking: str) -> None:
    item = answer(name_it=name, cooking=cooking)

    assert any("cottura nel nome" in issue for issue in review_issues(item, RICE_COOKED, glossary))


@pytest.mark.parametrize(
    "name", ["Riso integrale", "Pasta alla carbonara", "Pollo alla cacciatora"]
)
def test_prepositions_of_cooking_methods_are_not_flagged(glossary: Glossary, name: str) -> None:
    """Conta solo il metodo ("griglia", "lessato"), non "alla" o "al" da soli."""
    item = answer(name_it=name, cooking="lessato")

    assert review_issues(item, RICE_COOKED, glossary) == []


def test_agent_uses_temperature_zero_for_reproducible_runs() -> None:
    settings = translation.build_agent().model_settings

    assert isinstance(settings, dict)
    assert settings.get("temperature") == 0
