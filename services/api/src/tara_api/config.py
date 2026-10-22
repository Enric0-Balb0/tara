from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configurazione letta da variabili d'ambiente con prefisso TARA_ o da .env."""

    model_config = SettingsConfigDict(env_prefix="TARA_", env_file=".env", extra="ignore")

    environment: str = "development"
    database_url: str = "postgresql://tara:tara@localhost:5432/tara"
    off_user_agent: str = "Tara/0.1 (progetto personale)"


@lru_cache
def get_settings() -> Settings:
    return Settings()
