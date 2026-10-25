"""Catalogo finale di una fonte, pronto per il caricamento nel database.

    uv run python -m tara_catalog.export ciqual

Unisce lo snapshot (nomi originali e nutrienti), le traduzioni del modello configurato in
TARA_AI_MODEL, ripassate dai controlli correnti, e le revisioni di data/revisioni.csv, che
prevalgono. Scrive data/build/ciqual-2025/catalogo.jsonl, un alimento per riga: è il
contratto con il caricatore del catalogo in services/api.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any, TypedDict

from tara_catalog import ai
from tara_catalog.glossary import load_glossary
from tara_catalog.review import REVIEWED_PATH, ReviewedTranslation, load_reviewed
from tara_catalog.translate import SNAPSHOT, TRANSLATIONS, current_records
from tara_catalog.translation import SourceFood, TranslationRecord, finalize

DESCRIPTION = "Scrive il catalogo finale di una fonte, pronto per il caricamento nel database."
CATALOG = SNAPSHOT.with_name("catalogo.jsonl")


class ExportSummary(TypedDict):
    foods: int
    reviewed: int
    flagged: int
    untranslated: int


def catalog_entry(
    snapshot: dict[str, Any],
    translation: TranslationRecord,
    reviewed: ReviewedTranslation | None,
) -> dict[str, Any]:
    """Un alimento del catalogo: il nome italiano canonico compare anche tra i nomi, con la
    sua origine, così il database sa se l'ha scritto il modello o una persona."""
    if reviewed is not None:
        name, state, aliases, origin = reviewed.name, reviewed.state, reviewed.aliases, "reviewed"
    else:
        name, state, aliases = (
            translation["name_it"],
            translation["state"],
            tuple(translation["aliases_it"]),
        )
        origin = "llm"
    candidates = [("it", name, origin), *(("it", alias, origin) for alias in aliases)]
    candidates += [
        ("fr", snapshot["names"]["fr"], "source"),
        ("en", snapshot["names"]["en"], "source"),
    ]
    # Un nome per lingua senza ripetizioni, come il vincolo unico di food_name.
    names: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for lang, text, text_origin in candidates:
        key = (lang, text.strip().casefold())
        if text.strip() and key not in seen:
            seen.add(key)
            names.append({"lang": lang, "name": text.strip(), "origin": text_origin})
    return {
        "source": snapshot["source"],
        "source_code": snapshot["source_code"],
        "name": name,
        "state": state,
        "names": names,
        "nutrients": {
            code: {
                "amount": value["amount"],
                "provenance": value["provenance"],
                "confidence": value["confidence"],
            }
            for code, value in sorted(snapshot["nutrients"].items())
        },
    }


def export_catalog(
    model_id: str,
    out: Path,
    *,
    snapshot: Path = SNAPSHOT,
    translations: Path = TRANSLATIONS,
    reviewed_path: Path = REVIEWED_PATH,
) -> ExportSummary:
    """Gli alimenti senza traduzione restano fuori: `food.name` richiede il nome italiano."""
    glossary = load_glossary()
    reviewed = load_reviewed(reviewed_path)
    by_code = {record["source_code"]: record for record in current_records(model_id, translations)}
    summary: ExportSummary = {"foods": 0, "reviewed": 0, "flagged": 0, "untranslated": 0}
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8", newline="\n") as f:
        for line in snapshot.read_text(encoding="utf-8").splitlines():
            food = json.loads(line)
            code = food["source_code"]
            if code not in by_code:
                summary["untranslated"] += 1
                continue
            source = SourceFood(code, food["names"]["fr"], food["names"]["en"])
            translation = finalize(by_code[code], source, glossary)
            review = reviewed.get(code)
            summary["foods"] += 1
            summary["reviewed"] += review is not None
            summary["flagged"] += review is None and bool(translation["issues"])
            entry = catalog_entry(food, translation, review)
            f.write(json.dumps(entry, ensure_ascii=False, sort_keys=True) + "\n")
    return summary


def format_summary(summary: ExportSummary) -> str:
    return (
        f"alimenti nel catalogo: {summary['foods']} "
        f"(rivisti a mano {summary['reviewed']}, con segnalazioni aperte {summary['flagged']}), "
        f"senza traduzione: {summary['untranslated']}"
    )


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=DESCRIPTION)
    parser.add_argument("source", choices=["ciqual"])
    parser.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    summary = export_catalog(ai.load_settings().model, CATALOG)
    print(format_summary(summary))
    print(f"catalogo in {CATALOG}")


if __name__ == "__main__":
    main()
