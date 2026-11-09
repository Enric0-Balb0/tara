# syntax=docker/dockerfile:1
# Immagine di produzione del backend: dipendenze dal lockfile, nessun tool di sviluppo,
# utente non root. Build locale: docker build -t tara-api services/api

FROM ghcr.io/astral-sh/uv:0.13.7 AS uv

FROM python:3.12-slim AS build
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never
WORKDIR /app
# Prima solo le dipendenze, così il layer resta in cache finché uv.lock non cambia.
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-install-project
COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-editable

FROM python:3.12-slim AS runtime
# Commit da cui nasce l'immagine: /health lo mostra, il CD aspetta di vederlo online.
ARG RELEASE=dev
RUN useradd --create-home --uid 10001 tara
WORKDIR /app
COPY --from=build --chown=tara:tara /app/.venv /app/.venv
# Migrazioni nell'immagine: il CD le applica con `alembic upgrade head` prima del deploy,
# dalla stessa immagine che poi va online.
COPY --chown=tara:tara alembic.ini ./
COPY --chown=tara:tara migrations ./migrations
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    TARA_ENVIRONMENT=production \
    TARA_RELEASE=$RELEASE
USER tara
EXPOSE 8000
# Tempi larghi: con 0,1 CPU (Render Free) l'avvio dura 15-25 s e il controllo 3 s.
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=8)"]
CMD ["uvicorn", "tara_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
