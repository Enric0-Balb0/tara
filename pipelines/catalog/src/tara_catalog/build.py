"""Costruisce lo snapshot normalizzato di una fonte del catalogo.

    uv run python -m tara_catalog.build ciqual

Legge data/raw/ciqual-2025/ (scaricata con `tara_catalog.fetch`) e scrive in
data/build/ciqual-2025/:
- alimenti.jsonl: un alimento per riga, con nomi originali, gruppi e nutrienti di Tara;
- report.json: copertura per nutriente, tracce e valori sotto il limite, ripieghi usati.

Lo snapshot è l'ingresso della traduzione (nomi italiani, stato) e del caricamento nel
database; si rigenera, non si modifica a mano.
"""

from __future__ import annotations

import argparse
import json
from collections.abc import Sequence
from pathlib import Path

from tara_catalog.ciqual import CiqualFiles, NormalizedTable, load_mapping, normalize, read_ciqual
from tara_catalog.fetch import DATA_DIR, RAW_DIR, load_sources

BUILD_DIR = DATA_DIR / "build"
DESCRIPTION = "Costruisce lo snapshot normalizzato di una fonte del catalogo."


def build_ciqual(raw_folder: Path, out_folder: Path) -> NormalizedTable:
    table = normalize(read_ciqual(CiqualFiles.in_folder(raw_folder)), load_mapping())
    out_folder.mkdir(parents=True, exist_ok=True)
    with (out_folder / "alimenti.jsonl").open("w", encoding="utf-8", newline="\n") as f:
        for food in table.foods:
            f.write(json.dumps(food.to_json(), ensure_ascii=False, sort_keys=True) + "\n")
    (out_folder / "report.json").write_text(
        json.dumps(table.report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return table


def summary(table: NormalizedTable) -> str:
    report = table.report
    lines = [f"alimenti: {report['foods']}", "copertura per nutriente:"]
    for nutrient, coverage in report["coverage"].items():
        fallback = report["fallbacks"].get(nutrient, 0)
        extra = f" (di cui {fallback} da codice di ripiego)" if fallback else ""
        lines.append(f"  {nutrient:<14} {coverage['share']:>6.1%}  {coverage['foods']:>5}{extra}")
    kinds = ", ".join(f"{kind}: {count}" for kind, count in sorted(report["kinds"].items()))
    lines.append(f"valori per tipo: {kinds}")
    return "\n".join(lines)


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=DESCRIPTION)
    parser.add_argument("source", choices=["ciqual"])
    parser.parse_args(argv)
    folder = load_sources()["ciqual"].folder
    table = build_ciqual(RAW_DIR / folder, BUILD_DIR / folder)
    print(summary(table))
    print(f"scritto in {BUILD_DIR / folder}")


if __name__ == "__main__":
    main()
