"""Lettura e normalizzazione della tabella CIQUAL 2025 (formato XML di Anses).

I file sono dati esterni: si leggono con defusedxml e ogni formato inatteso ferma l'import
con `CiqualFormatError`, invece di produrre valori sbagliati in silenzio.

Regole (data/mappatura_ciqual.toml):
- `-` è un valore mancante: nessuna voce, mai zero (principio 2);
- `traces` e `< x` valgono 0 con confidenza ridotta: il valore è noto e trascurabile;
- la confidenza viene dal codice di affidabilità CIQUAL (A–D) della singola teneur, tranne
  per i valori calcolati (energia), che prendono quella del contributore meno affidabile.
"""

from __future__ import annotations

import csv
import re
import tomllib
from collections import Counter
from collections.abc import Iterator
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Literal, TypedDict
from xml.etree.ElementTree import Element

from defusedxml.ElementTree import iterparse

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
MAPPING_PATH = DATA_DIR / "mappatura_ciqual.toml"
NUTRIENT_TABLE = DATA_DIR / "nutrienti.csv"
NO_SUBGROUP = "000000"

AmountKind = Literal["measured", "trace", "below_limit"]


class CiqualFormatError(ValueError):
    """I file CIQUAL non hanno il formato atteso: l'import si ferma."""


@dataclass(frozen=True)
class Amount:
    value: Decimal
    kind: AmountKind


_NUMBER = re.compile(r"\d+(,\d+)?")


def _decimal(text: str) -> Decimal:
    if not _NUMBER.fullmatch(text):
        raise CiqualFormatError(f"teneur non riconosciuta: {text!r}")
    try:
        return Decimal(text.replace(",", "."))
    except InvalidOperation as exc:  # pragma: no cover - esclusa dalla regex
        raise CiqualFormatError(f"teneur non riconosciuta: {text!r}") from exc


def parse_amount(raw: str) -> Amount | None:
    """Interpreta una teneur CIQUAL; `None` se il valore non è noto (`-`)."""
    text = raw.strip()
    if text == "-":
        return None
    if text == "traces":
        return Amount(Decimal(0), "trace")
    if text.startswith("<"):
        _decimal(text[1:].strip())  # il limite deve essere un numero valido
        return Amount(Decimal(0), "below_limit")
    return Amount(_decimal(text), "measured")


# --- Mappatura ------------------------------------------------------------------------------


@dataclass(frozen=True)
class Mapping:
    nutrients: dict[str, tuple[int, ...]]
    confidence_by_code: dict[str, float]
    limit_factor: float
    fallback_factor: float
    derived: dict[str, tuple[str, ...]]


def load_mapping(path: Path = MAPPING_PATH) -> Mapping:
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    confidence = data["confidenza"]
    return Mapping(
        nutrients={code: tuple(ciqual) for code, ciqual in data["nutrienti"].items()},
        confidence_by_code={letter: float(confidence[letter]) for letter in "ABCD"},
        limit_factor=float(confidence["tracce_o_sotto_limite"]),
        fallback_factor=float(confidence["ripiego"]),
        derived={code: tuple(parts) for code, parts in data.get("derivati", {}).items()},
    )


def _nutrient_units(path: Path = NUTRIENT_TABLE) -> dict[str, str]:
    with path.open(encoding="utf-8") as f:
        return {row["codice"]: row["unita"] for row in csv.DictReader(f)}


# --- Lettura dei file XML -------------------------------------------------------------------


@dataclass(frozen=True)
class CiqualFiles:
    foods: Path
    groups: Path
    constituents: Path
    composition: Path

    @classmethod
    def in_folder(cls, folder: Path) -> CiqualFiles:
        """Trova i file per nome e data di rilascio (es. alim_2025_11_03.xml)."""

        def one(prefix: str) -> Path:
            dated = re.compile(rf"{prefix}_\d{{4}}_\d{{2}}_\d{{2}}\.xml")
            matches = sorted(p for p in folder.iterdir() if dated.fullmatch(p.name))
            if len(matches) != 1:
                raise CiqualFormatError(
                    f"atteso un solo file {prefix}_AAAA_MM_GG.xml in {folder}, "
                    f"trovati {len(matches)}"
                )
            return matches[0]

        return cls(one("alim"), one("alim_grp"), one("const"), one("compo"))


@dataclass(frozen=True)
class CiqualFood:
    code: str
    name_fr: str
    name_en: str
    groups: tuple[str, ...]


@dataclass(frozen=True)
class CiqualConstituent:
    code: int
    name_fr: str
    unit: str


@dataclass(frozen=True)
class CiqualValue:
    food_code: str
    constituent_code: int
    raw: str
    confidence_code: str | None


@dataclass(frozen=True)
class CiqualTable:
    foods: list[CiqualFood]
    constituents: dict[int, CiqualConstituent]
    values: list[CiqualValue]


def _records(path: Path, tag: str) -> Iterator[dict[str, str | None]]:
    """Righe del file come dizionari campo → testo (None se il campo è `missing`)."""
    for _, element in iterparse(str(path), events=("end",)):
        if element.tag == tag:
            yield {child.tag: _text(child) for child in element}
            element.clear()


def _text(element: Element) -> str | None:
    if "missing" in element.attrib:
        return None
    return (element.text or "").strip()


def _required(record: dict[str, str | None], field: str, path: Path) -> str:
    value = record.get(field)
    if not value:
        raise CiqualFormatError(f"{path.name}: campo {field} mancante in {record}")
    return value


_UNIT = re.compile(r"\((kJ|kcal|g|mg|µg)/100\s?g\)\s*$")


def read_ciqual(files: CiqualFiles) -> CiqualTable:
    foods = []
    for record in _records(files.foods, "ALIM"):
        groups = (
            _required(record, "alim_grp_code", files.foods),
            _required(record, "alim_ssgrp_code", files.foods),
            record.get("alim_ssssgrp_code") or NO_SUBGROUP,
        )
        foods.append(
            CiqualFood(
                code=_required(record, "alim_code", files.foods),
                name_fr=_required(record, "alim_nom_fr", files.foods),
                name_en=_required(record, "alim_nom_eng", files.foods),
                groups=tuple(code for code in groups if code != NO_SUBGROUP),
            )
        )

    constituents = {}
    for record in _records(files.constituents, "CONST"):
        name = _required(record, "const_nom_fr", files.constituents)
        unit = _UNIT.search(name)
        code = int(_required(record, "const_code", files.constituents))
        constituents[code] = CiqualConstituent(code, name, unit.group(1) if unit else "")

    values = [
        CiqualValue(
            food_code=_required(record, "alim_code", files.composition),
            constituent_code=int(_required(record, "const_code", files.composition)),
            raw=_required(record, "teneur", files.composition),
            confidence_code=record.get("code_confiance"),
        )
        for record in _records(files.composition, "COMPO")
    ]
    return CiqualTable(foods, constituents, values)


# --- Normalizzazione ------------------------------------------------------------------------


class NutrientEntry(TypedDict):
    amount: str
    provenance: Literal["reference"]
    confidence: float
    ciqual_code: int
    kind: AmountKind


class FoodRecord(TypedDict):
    source: Literal["ciqual"]
    source_code: str
    names: dict[str, str]
    groups: list[str]
    nutrients: dict[str, NutrientEntry]


class CoverageEntry(TypedDict):
    foods: int
    share: float


class Report(TypedDict):
    foods: int
    coverage: dict[str, CoverageEntry]
    kinds: dict[str, int]
    fallbacks: dict[str, int]


@dataclass(frozen=True)
class NormalizedFood:
    source_code: str
    name_fr: str
    name_en: str
    groups: tuple[str, ...]
    nutrients: dict[str, NutrientEntry]

    def to_json(self) -> FoodRecord:
        return {
            "source": "ciqual",
            "source_code": self.source_code,
            "names": {"fr": self.name_fr, "en": self.name_en},
            "groups": list(self.groups),
            "nutrients": self.nutrients,
        }


@dataclass(frozen=True)
class NormalizedTable:
    foods: list[NormalizedFood]
    report: Report


def _check_mapping(table: CiqualTable, mapping: Mapping) -> None:
    units = _nutrient_units()
    for nutrient, codes in mapping.nutrients.items():
        for code in codes:
            constituent = table.constituents.get(code)
            if constituent is None:
                raise CiqualFormatError(f"{nutrient}: il componente CIQUAL {code} non esiste")
            if constituent.unit != units[nutrient]:
                raise CiqualFormatError(
                    f"{nutrient}: unità {units[nutrient]!r} in nutrienti.csv, "
                    f"{constituent.unit!r} nel componente CIQUAL {code} ({constituent.name_fr})"
                )


def _entry(value: CiqualValue, amount: Amount, mapping: Mapping, fallback: bool) -> NutrientEntry:
    if value.confidence_code not in mapping.confidence_by_code:
        raise CiqualFormatError(
            f"alimento {value.food_code}, componente {value.constituent_code}: "
            f"code_confiance {value.confidence_code!r} non riconosciuto"
        )
    confidence = mapping.confidence_by_code[value.confidence_code]
    if amount.kind != "measured":
        confidence *= mapping.limit_factor
    if fallback:
        confidence *= mapping.fallback_factor
    return {
        "amount": str(amount.value),
        "provenance": "reference",
        "confidence": round(confidence, 4),
        "ciqual_code": value.constituent_code,
        "kind": amount.kind,
    }


def apply_derived_confidence(nutrients: dict[str, NutrientEntry], mapping: Mapping) -> None:
    """Confidenza dei valori calcolati: quella del contributore misurato meno affidabile.

    I contributori in tracce o sotto il limite pesano ~0 sul totale e non contano.
    """
    for nutrient, contributors in mapping.derived.items():
        entry = nutrients.get(nutrient)
        measured = [
            nutrients[c]["confidence"]
            for c in contributors
            if c in nutrients and nutrients[c]["kind"] == "measured"
        ]
        if entry is not None and measured:
            entry["confidence"] = min(measured)


def normalize(table: CiqualTable, mapping: Mapping) -> NormalizedTable:
    """Alimenti con i soli nutrienti di Tara, ciascuno con provenienza e confidenza."""
    _check_mapping(table, mapping)

    by_food: dict[str, dict[int, CiqualValue]] = {}
    for value in table.values:
        by_food.setdefault(value.food_code, {})[value.constituent_code] = value

    kinds: Counter[str] = Counter()
    fallbacks: Counter[str] = Counter()
    present: Counter[str] = Counter()
    foods = []
    for food in table.foods:
        values = by_food.get(food.code, {})
        nutrients: dict[str, NutrientEntry] = {}
        for nutrient, codes in mapping.nutrients.items():
            for position, code in enumerate(codes):
                candidate = values.get(code)
                amount = parse_amount(candidate.raw) if candidate else None
                if candidate is None or amount is None:
                    continue
                nutrients[nutrient] = _entry(candidate, amount, mapping, fallback=position > 0)
                kinds[amount.kind] += 1
                present[nutrient] += 1
                if position > 0:
                    fallbacks[nutrient] += 1
                break
        apply_derived_confidence(nutrients, mapping)
        foods.append(NormalizedFood(food.code, food.name_fr, food.name_en, food.groups, nutrients))

    total = len(foods)
    report: Report = {
        "foods": total,
        "coverage": {
            nutrient: {"foods": present[nutrient], "share": round(present[nutrient] / total, 4)}
            for nutrient in mapping.nutrients
        },
        "kinds": dict(kinds),
        "fallbacks": dict(fallbacks),
    }
    return NormalizedTable(foods, report)
