"""Revisione manuale delle traduzioni del catalogo.

`export_review` scrive un CSV da aprire in Excel: per ogni alimento la proposta del modello e
colonne vuote per la correzione. Le righe in revisione sono gli alimenti della dieta (il set di
valutazione) e quelle segnalate dai controlli automatici.
"""

from __future__ import annotations

import csv
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import TypedDict

from tara_catalog.glossary import State
from tara_catalog.translation import (
    SourceFood,
    TranslationRecord,
    clean_aliases,
    has_state_words,
)

REVIEWED_PATH = Path(__file__).resolve().parents[2] / "data" / "revisioni.csv"
STATE_LABELS: dict[State, str] = {"raw": "crudo", "cooked": "cotto", "not_applicable": "n.a."}
LABEL_STATES: dict[str, State] = {
    "crudo": "raw",
    "cotto": "cooked",
    "n.a.": "not_applicable",
    "n.a": "not_applicable",
    "na": "not_applicable",
}

COLUMNS: tuple[str, ...] = (
    "codice",
    "motivo",
    "originale",
    "inglese",
    "nome_proposto",
    "stato_proposto",
    "alias_proposti",
    "problemi",
    # Da compilare: "x" in `ok` conferma la proposta; altrimenti si scrivono le correzioni
    # (una colonna vuota lascia il valore proposto).
    "ok",
    "nome",
    "stato",
    "alias",
    "note",
    # La cottura è un dettaglio secondario: si pesa a crudo, conta lo stato.
    "cottura_proposta",
    "cottura",
)
EDITABLE = ("ok", "nome", "stato", "alias", "note", "cottura")
ALIAS_SEPARATOR = " | "


class ReviewInProgressError(RuntimeError):
    """Il file di revisione contiene già correzioni: non si sovrascrive."""


class ReviewError(ValueError):
    """Correzioni non valide: nessuna viene applicata."""


def read_review(path: Path) -> list[dict[str, str]]:
    """Legge il CSV salvato da Excel: UTF-8 (con o senza BOM) o Windows-1252, ";" o ","."""
    raw = path.read_bytes()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp1252")
    header = text.splitlines()[0] if text else ""
    delimiter = ";" if header.count(";") >= header.count(",") else ","
    return list(csv.DictReader(text.splitlines(), delimiter=delimiter))


def edited_rows(path: Path) -> list[dict[str, str]]:
    """Righe in cui l'utente ha scritto qualcosa nelle colonne da compilare."""
    if not path.exists():
        return []
    return [
        row
        for row in read_review(path)
        if any((row.get(column) or "").strip() for column in EDITABLE)
    ]


def export_review(
    records: Iterable[TranslationRecord],
    foods: Iterable[SourceFood],
    out: Path,
    *,
    diet_codes: set[str],
    reviewed_codes: set[str] | frozenset[str] = frozenset(),
) -> int:
    """Scrive il CSV di revisione; restituisce il numero di righe.

    Prima gli alimenti della dieta, poi i segnalati: le righe che contano di più in cima.
    Il file usa ";" e il BOM UTF-8, come si aspetta Excel in italiano. Un file che contiene
    già correzioni non si sovrascrive mai.
    """
    edited = edited_rows(out)
    if edited:
        raise ReviewInProgressError(
            f"{out} contiene correzioni in {len(edited)} righe: applicale prima di rigenerarlo"
        )
    by_code = {food.code: food for food in foods}
    diet: list[TranslationRecord] = []
    flagged: list[TranslationRecord] = []
    for record in records:
        if record["source_code"] in reviewed_codes:
            continue  # già rivisto: la revisione vale anche dopo una nuova traduzione
        if record["source_code"] in diet_codes:
            diet.append(record)
        elif record["issues"]:
            flagged.append(record)

    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS, delimiter=";")
        writer.writeheader()
        for reason, group in (("dieta", diet), ("segnalato", flagged)):
            for record in group:
                food = by_code[record["source_code"]]
                writer.writerow(
                    {
                        "codice": record["source_code"],
                        "motivo": reason,
                        "originale": food.name_fr,
                        "inglese": food.name_en,
                        "nome_proposto": record["name_it"],
                        "stato_proposto": STATE_LABELS[record["state"]],
                        "cottura_proposta": record["cooking"] or "",
                        "alias_proposti": ALIAS_SEPARATOR.join(record["aliases_it"]),
                        "problemi": "; ".join(record["issues"]),
                    }
                )
    return len(diet) + len(flagged)


# --- Applicazione delle correzioni ----------------------------------------------------------


@dataclass(frozen=True)
class ReviewedTranslation:
    """Traduzione rivista a mano: prevale su quella del modello, anche dopo una ritraduzione."""

    code: str
    name: str
    state: State
    cooking: str | None
    aliases: tuple[str, ...]
    note: str


REVIEWED_COLUMNS = ("codice", "nome", "stato", "cottura", "alias", "note")


class ApplySummary(TypedDict):
    applied: int
    total: int


def load_reviewed(path: Path = REVIEWED_PATH) -> dict[str, ReviewedTranslation]:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8", newline="") as f:
        return {
            row["codice"]: ReviewedTranslation(
                code=row["codice"],
                name=row["nome"],
                state=row["stato"],  # type: ignore[arg-type]
                cooking=row["cottura"] or None,
                aliases=tuple(a for a in row["alias"].split(ALIAS_SEPARATOR.strip()) if a),
                note=row["note"],
            )
            for row in csv.DictReader(f)
        }


def _write_reviewed(path: Path, entries: dict[str, ReviewedTranslation]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as f:
        writer = csv.DictWriter(f, fieldnames=REVIEWED_COLUMNS, lineterminator="\n")
        writer.writeheader()
        for code in sorted(entries, key=lambda c: (len(c), c)):
            entry = entries[code]
            writer.writerow(
                {
                    "codice": entry.code,
                    "nome": entry.name,
                    "stato": entry.state,
                    "cottura": entry.cooking or "",
                    "alias": ALIAS_SEPARATOR.strip().join(entry.aliases),
                    "note": entry.note,
                }
            )


def _cell(row: dict[str, str], column: str) -> str:
    return (row.get(column) or "").strip()


def _reviewed_from_row(row: dict[str, str], problems: list[str]) -> ReviewedTranslation | None:
    """La correzione di una riga; None se la riga non è stata toccata."""
    corrections = {c: _cell(row, c) for c in ("nome", "stato", "cottura", "alias")}
    if not _cell(row, "ok") and not any(corrections.values()):
        return None
    code = _cell(row, "codice")
    name = corrections["nome"] or _cell(row, "nome_proposto")
    label = (corrections["stato"] or _cell(row, "stato_proposto")).casefold()
    state = LABEL_STATES.get(label)
    if state is None:
        problems.append(f"{code}: stato {label!r} non valido (crudo, cotto o n.a.)")
        return None
    if not name:
        problems.append(f"{code}: nome vuoto")
        return None
    if has_state_words(name):
        problems.append(f"{code}: {name!r} contiene crudo/cotto, che va solo nella colonna stato")
        return None
    aliases = corrections["alias"] or _cell(row, "alias_proposti")
    cooking = corrections["cottura"] or _cell(row, "cottura_proposta")
    return ReviewedTranslation(
        code=code,
        name=name,
        state=state,
        cooking=cooking if state == "cooked" and cooking else None,
        aliases=tuple(clean_aliases(name, aliases.split("|"))),
        note=_cell(row, "note"),
    )


def apply_review(review: Path, reviewed_path: Path = REVIEWED_PATH) -> ApplySummary:
    """Aggiunge le righe confermate o corrette a revisioni.csv e archivia il CSV compilato.

    Se una sola correzione non è valida non si applica niente: si corregge il file e si
    rilancia.
    """
    problems: list[str] = []
    reviewed = [
        entry
        for row in read_review(review)
        if (entry := _reviewed_from_row(row, problems)) is not None
    ]
    if problems:
        raise ReviewError("correzioni non applicate:\n" + "\n".join(problems))
    entries = load_reviewed(reviewed_path)
    entries.update({entry.code: entry for entry in reviewed})
    _write_reviewed(reviewed_path, entries)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    review.rename(review.with_name(f"revisione-applicata-{stamp}.csv"))
    return {"applied": len(reviewed), "total": len(entries)}
