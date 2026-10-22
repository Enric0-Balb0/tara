from fastapi import FastAPI

from tara_api import __version__
from tara_api.config import get_settings

app = FastAPI(title="Tara API", version=__version__)


@app.get("/health")
def health() -> dict[str, str]:
    """Usato da CI, deploy e app per verificare che il backend risponda."""
    return {
        "status": "ok",
        "version": __version__,
        "environment": get_settings().environment,
    }
