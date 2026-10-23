"""Glossario controllato e validatori deterministici per la traduzione dei nomi.

I validatori non correggono nulla: segnalano le righe da mandare in revisione.
"""

from __future__ import annotations

import re
import tomllib
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

# Stessi valori della colonna `food.state` del database (services/api).
State = Literal["raw", "cooked", "not_applicable"]
Lang = Literal["en", "fr"]

DEFAULT_PATH = Path(__file__).resolve().parents[2] / "data" / "glossario.toml"


@dataclass(frozen=True)
class Term:
    it: str
    sources: dict[Lang, tuple[str, ...]]
    state: State | None = None


@dataclass
class Glossary:
    terms: list[Term] = field(default_factory=list)

    def matches(self, name: str, lang: Lang) -> list[Term]:
        """Voci del glossario presenti nel nome originale, come parole intere."""
        text = _normalize(name)
        return [
            term
            for term in self.terms
            if any(_contains_phrase(text, _normalize(src)) for src in term.sources.get(lang, ()))
        ]

    def italian_hints(self, name: str, lang: Lang) -> list[str]:
        """Forme italiane da suggerire al modello di traduzione."""
        return [term.it for term in self.matches(name, lang)]


def load_glossary(path: Path = DEFAULT_PATH) -> Glossary:
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    terms = [
        Term(
            it=raw["it"],
            sources={lang: tuple(raw.get(lang, ())) for lang in ("en", "fr")},
            state=raw.get("state"),
        )
        for raw in data["term"]
    ]
    return Glossary(terms)


def check_state(glossary: Glossary, original_names: dict[Lang, str], state: State) -> list[str]:
    """Problemi di coerenza tra i nomi originali e lo stato tradotto; vuota se coerente."""
    implied: set[str] = set()
    for lang, name in original_names.items():
        implied.update(term.state for term in glossary.matches(name, lang) if term.state)

    issues: list[str] = []
    if implied == {"raw", "cooked"}:
        issues.append("l'originale indica sia crudo sia una cottura: da rivedere")
    elif "raw" in implied and state != "raw":
        issues.append(f"l'originale indica crudo, la traduzione dice {state}")
    elif "cooked" in implied and state != "cooked":
        issues.append(f"l'originale indica una cottura, la traduzione dice {state}")
    return issues


def _normalize(text: str) -> str:
    return unicodedata.normalize("NFC", text).replace("’", "'").casefold()


def _contains_phrase(text: str, phrase: str) -> bool:
    return re.search(rf"(?<!\w){re.escape(phrase)}(?!\w)", text) is not None
