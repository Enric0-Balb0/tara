from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware

from tara_api import __version__, foods
from tara_api.config import get_settings

app = FastAPI(title="Tara API", version=__version__)
# Lo snapshot del catalogo pesa qualche MB in JSON: compresso si scarica anche in 4G.
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.include_router(foods.router)


@app.get("/health")
def health() -> dict[str, str]:
    """Usato da CI, deploy e app per verificare che il backend risponda."""
    return {
        "status": "ok",
        "version": __version__,
        "environment": get_settings().environment,
    }
