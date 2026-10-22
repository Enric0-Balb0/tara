# syntax=docker/dockerfile:1
# Immagine di produzione del backend: dipendenze dal lockfile, nessun tool di sviluppo,
# utente non root. Build locale: docker build -t tara-api services/api

FROM ghcr.io/astral-sh/uv:0.13.5 AS uv

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
RUN useradd --create-home --uid 10001 tara
WORKDIR /app
COPY --from=build --chown=tara:tara /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    TARA_ENVIRONMENT=production
USER tara
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2)"]
CMD ["uvicorn", "tara_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
