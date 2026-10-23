"""Traduzione in italiano dei nomi degli alimenti con un modello AI.

Il modello trascrive e traduce: non produce mai valori nutrizionali (principio 1). Ogni
risposta passa dai controlli deterministici (`review_issues`): le righe con problemi restano
nello snapshot, segnalate, e vanno in revisione manuale.

Il modello si sceglie con TARA_AI_MODEL (vedi `tara_catalog.ai`); prompt e schema di output
sono versionati qui e in prompts/. Ogni cambio di modello o di prompt passa dalla valutazione
(`python -m tara_catalog.translate eval`).
"""

from __future__ import annotations

import csv
import json
import time
import unicodedata
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import TypedDict

from pydantic import BaseModel, Field
from pydantic_ai import Agent, AgentRunResult
from pydantic_ai.exceptions import ModelHTTPError
from pydantic_ai.models import Model

from tara_catalog.glossary import Glossary, State, check_state, load_glossary

PACKAGE_ROOT = Path(__file__).resolve().parents[2]
PROMPTS_DIR = PACKAGE_ROOT / "prompts"
EVAL_PATH = PACKAGE_ROOT / "data" / "eval" / "traduzioni.csv"
PROMPT_VERSION = "traduzione-v1"

RETRYABLE_STATUS = {429, 500, 502, 503, 504}
STATE_WORDS = ("crudo", "cruda", "crudi", "crude", "cotto", "cotta", "cotti", "cotte")


class FoodTranslation(BaseModel):
    """Schema di output del modello per un alimento."""

    code: str = Field(description="Il codice dell'alimento, identico a quello in ingresso.")
    name_it: str = Field(min_length=1, description="Nome italiano mostrato nell'app.")
    aliases_it: list[str] = Field(default_factory=list, max_length=4)
    state: State
    cooking: str | None = None
    part: str | None = None


class TranslationBatch(BaseModel):
    items: list[FoodTranslation]


@dataclass(frozen=True)
class SourceFood:
    code: str
    name_fr: str
    name_en: str


class TranslationRecord(TypedDict):
    source_code: str
    name_it: str
    aliases_it: list[str]
    state: State
    cooking: str | None
    part: str | None
    issues: list[str]
    model: str
    prompt_version: str


@dataclass
class BatchResult:
    records: list[TranslationRecord]
    missing: list[str]
    input_tokens: int = 0
    output_tokens: int = 0


def load_prompt(version: str = PROMPT_VERSION) -> str:
    return (PROMPTS_DIR / f"{version}.md").read_text(encoding="utf-8")


def build_agent() -> Agent[None, TranslationBatch]:
    return Agent(output_type=TranslationBatch, instructions=load_prompt(), retries={"output": 2})


def format_request(foods: Iterable[SourceFood], glossary: Glossary) -> str:
    """Una riga per alimento: codice | francese | inglese | suggerimenti del glossario."""
    lines = []
    for food in foods:
        hints = dict.fromkeys(
            glossary.italian_hints(food.name_fr, "fr") + glossary.italian_hints(food.name_en, "en")
        )
        lines.append(f"{food.code} | {food.name_fr} | {food.name_en} | {', '.join(hints)}")
    return "\n".join(lines)


def _normalized(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text.casefold())
    return "".join(char for char in decomposed if not unicodedata.combining(char))


def _words(text: str) -> set[str]:
    return set("".join(c if c.isalnum() else " " for c in _normalized(text)).split())


def review_issues(item: FoodTranslation, food: SourceFood, glossary: Glossary) -> list[str]:
    """Problemi deterministici della risposta: vuota se la traduzione è coerente."""
    issues = check_state(glossary, {"fr": food.name_fr, "en": food.name_en}, item.state)
    if _words(item.name_it) & set(STATE_WORDS):
        issues.append(f"stato nel nome: {item.name_it!r} (va solo nel campo state)")
    if item.cooking and item.state != "cooked":
        issues.append(f"metodo di cottura {item.cooking!r} con stato {item.state}")
    name = _normalized(item.name_it)
    if any(_normalized(alias) == name for alias in item.aliases_it):
        issues.append("un alias ripete il nome")
    return issues


def _wait_for(error: ModelHTTPError, attempt: int) -> float:
    return error.retry_after if error.retry_after else min(10.0 * 2**attempt, 120.0)


def _run_with_retries(
    agent: Agent[None, TranslationBatch],
    request: str,
    model: Model | str,
    sleep: Callable[[float], None],
    max_attempts: int,
) -> AgentRunResult[TranslationBatch]:
    """Ritenta solo limiti di richieste ed errori temporanei del provider."""
    attempt = 0
    while True:
        try:
            return agent.run_sync(request, model=model)
        except ModelHTTPError as error:
            attempt += 1
            if error.status_code not in RETRYABLE_STATUS or attempt >= max_attempts:
                raise
            sleep(_wait_for(error, attempt - 1))


def translate_batch(
    model: Model | str,
    model_id: str,
    foods: list[SourceFood],
    glossary: Glossary,
    *,
    agent: Agent[None, TranslationBatch] | None = None,
    sleep: Callable[[float], None] = time.sleep,
    max_attempts: int = 5,
) -> BatchResult:
    """Traduce un lotto di alimenti e controlla ogni risposta."""
    request = format_request(foods, glossary)
    result = _run_with_retries(agent or build_agent(), request, model, sleep, max_attempts)

    by_code = {food.code: food for food in foods}
    records: list[TranslationRecord] = []
    for item in result.output.items:
        food = by_code.pop(item.code, None)
        if food is None:
            continue  # codice inventato o ripetuto: si ignora, l'alimento resta da tradurre
        records.append(
            {
                "source_code": food.code,
                "name_it": item.name_it.strip(),
                "aliases_it": [alias.strip() for alias in item.aliases_it if alias.strip()],
                "state": item.state,
                "cooking": item.cooking,
                "part": item.part,
                "issues": review_issues(item, food, glossary),
                "model": model_id,
                "prompt_version": PROMPT_VERSION,
            }
        )
    usage = result.usage
    return BatchResult(
        records=records,
        missing=list(by_code),
        input_tokens=usage.input_tokens or 0,
        output_tokens=usage.output_tokens or 0,
    )


# --- Esecuzione con ripresa -----------------------------------------------------------------


class RunSummary(TypedDict):
    translated: int
    flagged: int
    missing: int
    pending: int


def _done(path: Path, model_id: str) -> set[str]:
    if not path.exists():
        return set()
    done = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        record = json.loads(line)
        if record["model"] == model_id and record["prompt_version"] == PROMPT_VERSION:
            done.add(record["source_code"])
    return done


def translate_pending(
    model: Model | str,
    model_id: str,
    foods: list[SourceFood],
    out: Path,
    *,
    glossary: Glossary | None = None,
    batch_size: int = 25,
    limit: int | None = None,
    min_interval: float = 0.0,
    usage_log: Path | None = None,
    sleep: Callable[[float], None] = time.sleep,
) -> RunSummary:
    """Traduce gli alimenti non ancora tradotti con questo modello e questo prompt.

    Ogni lotto si scrive appena pronto: un'interruzione (limite giornaliero, rete) non fa
    perdere il lavoro fatto e la prossima esecuzione riparte dagli alimenti mancanti.
    """
    glossary = glossary or load_glossary()
    done = _done(out, model_id)
    pending = [food for food in foods if food.code not in done]
    todo = pending[:limit] if limit is not None else pending
    agent = build_agent()
    out.parent.mkdir(parents=True, exist_ok=True)

    summary: RunSummary = {"translated": 0, "flagged": 0, "missing": 0, "pending": 0}
    for start in range(0, len(todo), batch_size):
        if start and min_interval:
            sleep(min_interval)
        batch = todo[start : start + batch_size]
        result = translate_batch(model, model_id, batch, glossary, agent=agent, sleep=sleep)
        with out.open("a", encoding="utf-8", newline="\n") as f:
            for record in result.records:
                f.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")
        if usage_log is not None:
            _log_usage(usage_log, model_id, len(batch), result)
        summary["translated"] += len(result.records)
        summary["flagged"] += sum(1 for record in result.records if record["issues"])
        summary["missing"] += len(result.missing)
    summary["pending"] = len(pending) - summary["translated"]
    return summary


def _log_usage(path: Path, model_id: str, foods: int, result: BatchResult) -> None:
    """Uso del modello per lotto (RNF-06): base per i costi quando il modello sarà a pagamento."""
    entry = {
        "at": datetime.now(UTC).isoformat(timespec="seconds"),
        "task": "traduzione",
        "model": model_id,
        "prompt_version": PROMPT_VERSION,
        "foods": foods,
        "input_tokens": result.input_tokens,
        "output_tokens": result.output_tokens,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(entry) + "\n")


# --- Valutazione ----------------------------------------------------------------------------


@dataclass(frozen=True)
class EvalCase:
    code: str
    original: str
    expected_name: str
    expected_state: State
    required_words: tuple[str, ...] = field(default=())


def load_eval_cases(path: Path = EVAL_PATH) -> list[EvalCase]:
    with path.open(encoding="utf-8") as f:
        return [
            EvalCase(
                code=row["codice"],
                original=row["originale"],
                expected_name=row["nome_atteso"],
                expected_state=row["stato_atteso"],  # type: ignore[arg-type]
                required_words=tuple(w for w in row["parole_nome"].split(";") if w),
            )
            for row in csv.DictReader(f)
        ]


class EvalFailure(TypedDict):
    code: str
    original: str
    expected: str
    got: str
    problems: list[str]


class EvalReport(TypedDict):
    cases: int
    translated: int
    state_accuracy: float
    name_words_accuracy: float
    exact_names: float
    flagged: int
    failures: list[EvalFailure]


def score_eval(cases: list[EvalCase], records: Iterable[TranslationRecord]) -> EvalReport:
    """Stato esatto, parole obbligatorie nel nome e nomi identici al riferimento."""
    by_code = {record["source_code"]: record for record in records}
    state_ok = words_ok = exact = flagged = 0
    failures: list[EvalFailure] = []
    for case in cases:
        record = by_code.get(case.code)
        if record is None:
            failures.append(
                {
                    "code": case.code,
                    "original": case.original,
                    "expected": f"{case.expected_name} [{case.expected_state}]",
                    "got": "-",
                    "problems": ["non tradotto"],
                }
            )
            continue
        name = _normalized(record["name_it"])
        problems = []
        if record["state"] == case.expected_state:
            state_ok += 1
        else:
            problems.append(f"stato {record['state']}, atteso {case.expected_state}")
        missing_words = [w for w in case.required_words if _normalized(w) not in name]
        if missing_words:
            problems.append(f"mancano: {', '.join(missing_words)}")
        else:
            words_ok += 1
        if name == _normalized(case.expected_name):
            exact += 1
        if record["issues"]:
            flagged += 1
            problems.extend(record["issues"])
        if problems:
            failures.append(
                {
                    "code": case.code,
                    "original": case.original,
                    "expected": f"{case.expected_name} [{case.expected_state}]",
                    "got": f"{record['name_it']} [{record['state']}]",
                    "problems": problems,
                }
            )
    total = len(cases) or 1
    return {
        "cases": len(cases),
        "translated": sum(1 for case in cases if case.code in by_code),
        "state_accuracy": state_ok / total,
        "name_words_accuracy": words_ok / total,
        "exact_names": exact / total,
        "flagged": flagged,
        "failures": failures,
    }
