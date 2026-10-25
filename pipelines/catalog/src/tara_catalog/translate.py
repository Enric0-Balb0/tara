"""Traduzione dei nomi del catalogo con il modello configurato in TARA_AI_MODEL.

    uv run python -m tara_catalog.translate eval      misura il modello sul set di valutazione
    uv run python -m tara_catalog.translate ciqual    traduce lo snapshot CIQUAL, con ripresa
    uv run python -m tara_catalog.translate ciqual --limit 100

    uv run python -m tara_catalog.translate revisione  CSV per Excel con le traduzioni da rivedere
    uv run python -m tara_catalog.translate applica    salva le correzioni in data/revisioni.csv

Le traduzioni si scrivono in data/build/ciqual-2025/traduzioni.jsonl, l'uso del modello in
data/build/uso-ai.jsonl, i risultati della valutazione in data/build/eval/, il file di
revisione in data/build/ciqual-2025/revisione.csv.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from collections.abc import Sequence
from pathlib import Path

from pydantic_ai.models import Model

from tara_catalog import ai
from tara_catalog.build import BUILD_DIR
from tara_catalog.glossary import load_glossary
from tara_catalog.review import REVIEWED_PATH, apply_review, export_review, load_reviewed
from tara_catalog.translation import (
    PROMPT_VERSION,
    EvalReport,
    RunSummary,
    SourceFood,
    TranslationRecord,
    finalize,
    load_eval_cases,
    score_eval,
    translate_batch,
    translate_pending,
)

DESCRIPTION = "Traduzione dei nomi del catalogo con il modello configurato in TARA_AI_MODEL."
SNAPSHOT = BUILD_DIR / "ciqual-2025" / "alimenti.jsonl"
TRANSLATIONS = BUILD_DIR / "ciqual-2025" / "traduzioni.jsonl"
REVIEW = BUILD_DIR / "ciqual-2025" / "revisione.csv"
REVIEWED = REVIEWED_PATH
USAGE_LOG = BUILD_DIR / "uso-ai.jsonl"
EVAL_DIR = BUILD_DIR / "eval"
BATCH_SIZE = 25


def notify(message: str) -> None:
    """Progressi e ritentativi su stderr, subito visibili anche in esecuzioni lunghe."""
    print(message, file=sys.stderr, flush=True)


def snapshot_foods(path: Path | None = None) -> list[SourceFood]:
    path = path or SNAPSHOT
    if not path.exists():
        raise FileNotFoundError(
            f"{path} non esiste: esegui prima `python -m tara_catalog.build ciqual`"
        )
    foods = []
    for line in path.read_text(encoding="utf-8").splitlines():
        record = json.loads(line)
        names = record["names"]
        foods.append(SourceFood(record["source_code"], names["fr"], names["en"]))
    return foods


def run_eval(
    model: Model | str,
    model_id: str,
    *,
    snapshot: Path | None = None,
    out_dir: Path | None = None,
    min_interval: float = 0.0,
) -> tuple[EvalReport, Path]:
    """Traduce gli alimenti del set di valutazione e confronta con i riferimenti."""
    cases = load_eval_cases()
    wanted = {case.code for case in cases}
    foods = [food for food in snapshot_foods(snapshot) if food.code in wanted]
    glossary = load_glossary()
    records: list[TranslationRecord] = []
    for start in range(0, len(foods), BATCH_SIZE):
        if start and min_interval:
            time.sleep(min_interval)
        batch = foods[start : start + BATCH_SIZE]
        records.extend(translate_batch(model, model_id, batch, glossary, notify=notify).records)
        notify(f"valutazione: {len(records)}/{len(foods)} alimenti tradotti")
    report = score_eval(cases, records)
    out_dir = out_dir or EVAL_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{PROMPT_VERSION}__{re.sub(r'[^A-Za-z0-9.-]+', '_', model_id)}.json"
    payload = {
        "model": model_id,
        "prompt_version": PROMPT_VERSION,
        "report": report,
        "records": records,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report, path


def current_records(model_id: str, path: Path | None = None) -> list[TranslationRecord]:
    """Traduzioni del modello e del prompt correnti; per ogni alimento vale l'ultima."""
    path = path or TRANSLATIONS
    latest: dict[str, TranslationRecord] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        record: TranslationRecord = json.loads(line)
        if record["model"] == model_id and record["prompt_version"] == PROMPT_VERSION:
            latest[record["source_code"]] = record
    return list(latest.values())


def write_review(model_id: str) -> int:
    """Le traduzioni salvate ripassano dai controlli correnti: cambiarli non richiede l'AI."""
    diet = {case.code for case in load_eval_cases()}
    foods = {food.code: food for food in snapshot_foods()}
    glossary = load_glossary()
    records = [
        finalize(record, foods[record["source_code"]], glossary)
        for record in current_records(model_id)
        if record["source_code"] in foods
    ]
    return export_review(
        records,
        list(foods.values()),
        REVIEW,
        diet_codes=diet,
        reviewed_codes=set(load_reviewed(REVIEWED)),
    )


def format_eval(report: EvalReport, model_id: str) -> str:
    lines = [
        f"modello {model_id} · prompt {PROMPT_VERSION}",
        f"  tradotti            {report['translated']}/{report['cases']}",
        f"  stato corretto      {report['state_accuracy']:.0%}",
        f"  parole chiave       {report['name_words_accuracy']:.0%}",
        f"  nome identico       {report['exact_names']:.0%}",
        f"  segnalati           {report['flagged']}",
    ]
    if report["failures"]:
        lines.append("da guardare:")
        for failure in report["failures"]:
            lines.append(
                f"  {failure['code']:>6}  {failure['original']}\n"
                f"          atteso {failure['expected']} · ottenuto {failure['got']}\n"
                f"          {'; '.join(failure['problems'])}"
            )
    return "\n".join(lines)


def format_run(summary: RunSummary) -> str:
    return (
        f"tradotti {summary['translated']} (segnalati {summary['flagged']}), "
        f"saltati dal modello {summary['missing']}, ancora da tradurre {summary['pending']}"
    )


def main(argv: Sequence[str] | None = None, model: Model | None = None) -> None:
    parser = argparse.ArgumentParser(description=DESCRIPTION)
    parser.add_argument("target", choices=["eval", "ciqual", "revisione", "applica"])
    parser.add_argument(
        "--limit", type=int, default=None, help="massimo di alimenti per esecuzione"
    )
    args = parser.parse_args(argv)
    # Il terminale di Windows usa cp1252: nomi e simboli vanno stampati in UTF-8.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")

    if args.target == "applica":
        applied = apply_review(REVIEW, REVIEWED)
        print(f"correzioni applicate: {applied['applied']} (totale rivisti: {applied['total']})")
        print(f"revisioni in {REVIEWED}")
        return

    settings = ai.load_settings()
    chosen: Model | str = model or settings.model
    if args.target == "revisione":
        count = write_review(settings.model)
        print(f"righe da rivedere: {count}")
        print(f"file per Excel: {REVIEW}")
        return
    if args.target == "eval":
        report, path = run_eval(chosen, settings.model, min_interval=settings.min_interval)
        print(format_eval(report, settings.model))
        print(f"risultati in {path}")
        return
    summary = translate_pending(
        chosen,
        settings.model,
        snapshot_foods(),
        TRANSLATIONS,
        batch_size=BATCH_SIZE,
        limit=args.limit,
        min_interval=settings.min_interval,
        usage_log=USAGE_LOG,
        notify=notify,
    )
    print(format_run(summary))
    print(f"traduzioni in {TRANSLATIONS}")


if __name__ == "__main__":
    main()
