"""Configurazione del modello AI della pipeline: si sceglie con variabili d'ambiente.

TARA_AI_MODEL ha la forma `provider:modello` di Pydantic AI (es. `google:…`, `ollama:…`,
`anthropic:…`); le chiavi stanno nelle variabili standard di ogni provider (GOOGLE_API_KEY,
OLLAMA_BASE_URL, ANTHROPIC_API_KEY…). In locale si leggono da pipelines/catalog/.env, ignorato
da git: passare a un altro modello, anche a pagamento, significa cambiare una riga lì.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
DEFAULT_MIN_INTERVAL_S = 6.0


class AIConfigError(RuntimeError):
    """Configurazione del modello mancante o non valida."""


@dataclass(frozen=True)
class AISettings:
    model: str
    min_interval: float


def load_settings(env_file: Path = ENV_FILE) -> AISettings:
    """Legge la configurazione; le variabili già impostate nell'ambiente hanno la precedenza."""
    load_dotenv(env_file, override=False)
    # Il banner di Pydantic AI copre i progressi della pipeline.
    os.environ.setdefault("PYDANTIC_AI_NO_BANNER", "1")
    model = os.environ.get("TARA_AI_MODEL", "").strip()
    if not model:
        raise AIConfigError(
            "TARA_AI_MODEL non impostato: copia pipelines/catalog/.env.example in .env e "
            "scegli il modello (es. google:<modello>)."
        )
    provider, _, name = model.partition(":")
    if not provider or not name:
        raise AIConfigError(f"TARA_AI_MODEL={model!r}: atteso provider:modello")
    try:
        min_interval = float(os.environ.get("TARA_AI_MIN_INTERVAL_S", DEFAULT_MIN_INTERVAL_S))
    except ValueError as exc:
        raise AIConfigError("TARA_AI_MIN_INTERVAL_S deve essere un numero di secondi") from exc
    return AISettings(model=model, min_interval=max(min_interval, 0.0))
