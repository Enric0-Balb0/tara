from __future__ import annotations

from pathlib import Path

import pytest

from tara_catalog.ai import AIConfigError, load_settings

KEYS = ("TARA_AI_MODEL", "TARA_AI_MIN_INTERVAL_S")


@pytest.fixture(autouse=True)
def clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in KEYS:
        monkeypatch.delenv(key, raising=False)


def write_env(tmp_path: Path, text: str) -> Path:
    path = tmp_path / ".env"
    path.write_text(text, encoding="utf-8")
    return path


def test_settings_come_from_the_env_file(tmp_path: Path) -> None:
    env = write_env(tmp_path, "TARA_AI_MODEL=google:gemini-x\nTARA_AI_MIN_INTERVAL_S=4\n")

    settings = load_settings(env)

    assert settings.model == "google:gemini-x"
    assert settings.min_interval == 4.0


def test_environment_variables_win_over_the_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("TARA_AI_MODEL", "ollama:qwen3:8b")
    env = write_env(tmp_path, "TARA_AI_MODEL=google:gemini-x\n")

    assert load_settings(env).model == "ollama:qwen3:8b"


def test_default_interval_respects_free_tier_limits(tmp_path: Path) -> None:
    env = write_env(tmp_path, "TARA_AI_MODEL=google:gemini-x\n")

    assert load_settings(env).min_interval == 6.0


@pytest.mark.parametrize(
    ("content", "message"),
    [
        ("", "TARA_AI_MODEL non impostato"),
        ("TARA_AI_MODEL=gemini-x\n", "provider:modello"),
        ("TARA_AI_MODEL=google:x\nTARA_AI_MIN_INTERVAL_S=presto\n", "secondi"),
    ],
)
def test_invalid_configuration_is_explained(tmp_path: Path, content: str, message: str) -> None:
    with pytest.raises(AIConfigError, match=message):
        load_settings(write_env(tmp_path, content))


def test_example_file_documents_every_setting() -> None:
    example = (Path(__file__).resolve().parents[1] / ".env.example").read_text(encoding="utf-8")

    for key in (*KEYS, "GOOGLE_API_KEY", "OLLAMA_BASE_URL", "ANTHROPIC_API_KEY"):
        assert key in example
