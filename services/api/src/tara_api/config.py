from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


def to_sqlalchemy_url(url: str) -> str:
    """Adatta l'URL di un provider Postgres al driver psycopg 3 usato da SQLAlchemy.

    Gli hosting forniscono `postgresql://` o `postgres://`; SQLAlchemy li assocerebbe
    a psycopg2, che non è installato.
    """
    for scheme in ("postgresql://", "postgres://"):
        if url.startswith(scheme):
            return "postgresql+psycopg://" + url.removeprefix(scheme)
    return url


class Settings(BaseSettings):
    """Configurazione letta da variabili d'ambiente con prefisso TARA_ o da .env."""

    model_config = SettingsConfigDict(env_prefix="TARA_", env_file=".env", extra="ignore")

    environment: str = "development"
    release: str = "dev"
    """Commit dell'immagine in esecuzione: il CD lo passa come build arg."""
    database_url: str = "postgresql://tara:tara@localhost:55432/tara"
    off_user_agent: str = "Tara/0.1 (progetto personale)"

    @property
    def sqlalchemy_database_url(self) -> str:
        return to_sqlalchemy_url(self.database_url)


@lru_cache
def get_settings() -> Settings:
    return Settings()
