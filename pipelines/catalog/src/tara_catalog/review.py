"""Revisione manuale delle traduzioni del catalogo.

`export_review` scrive un CSV da aprire in Excel: per ogni alimento la proposta del modello e
colonne vuote per la correzione. Le righe in revisione sono gli alimenti della dieta (il set di
valutazione) e quelle segnalate dai controlli automatici.
"""

from __future__ import annotations

import csv
from collections.abc import Iterable
from pathlib import Path

from tara_catalog.glossary import State
from tara_catalog.translation import SourceFood, TranslationRecord

STATE_LABELS: dict[State, str] = {"raw": "crudo", "cooked": "cotto", "not_applicable": "n.a."}

COLUMNS = (
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
