"""Password del ruolo `tara` del database di produzione, senza mai mostrarla (RNF-14).

    uv run python -m tara_api.db_role

Su Supabase il backend e le migrazioni usano il ruolo `tara`, proprietario degli oggetti di
Tara e creato da `infra/supabase/bootstrap.sql`. `postgres` non serve: è un ruolo
privilegiato della piattaforma e la sua password la cambia solo Supabase.

Lo script genera una password nuova e manda a Supabase solo la sua impronta SCRAM-SHA-256,
attraverso la Management API con un access token personale chiesto a terminale. Poi salva
la stringa di connessione nel segreto GitHub `TARA_DATABASE_URL`, la copia negli appunti
di Windows per Render e prova il session pooler. Né la password né il token compaiono
nell'output, neanche nei messaggi di errore.
"""

from __future__ import annotations

import argparse
import base64
import getpass
import hashlib
import hmac
import json
import os
import re
import secrets
import string
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections.abc import Callable, Sequence
from dataclasses import dataclass

import psycopg

DESCRIPTION = "Imposta una password nuova per il ruolo tara su Supabase senza mostrarla."
ROLE = "tara"
SCRAM_ITERATIONS = 4096
TOKEN_PATTERN = re.compile(r"sbp_[A-Za-z0-9_]+")


class RotationError(Exception):
    """Un passo della rotazione non è andato a buon fine."""


@dataclass(frozen=True)
class Project:
    ref: str = "fbwlepzrrvtngvbyktiv"
    pooler_host: str = "aws-1-eu-central-1.pooler.supabase.com"

    def database_url(self, password: str) -> str:
        """URL del session pooler: porta 5432 e TLS obbligatorio, come in produzione."""
        return (
            f"postgresql://{ROLE}.{self.ref}:{password}@{self.pooler_host}:5432"
            "/postgres?sslmode=require"
        )


def new_password(length: int = 24) -> str:
    # Solo lettere e cifre: nell'URL non c'è nulla da codificare.
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def scram_verifier(
    password: str, salt: bytes | None = None, iterations: int = SCRAM_ITERATIONS
) -> str:
    """Impronta nel formato di `pg_authid`: data a ALTER ROLE, Postgres la salva com'è."""
    salt = secrets.token_bytes(16) if salt is None else salt
    salted = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations)
    client_key = hmac.new(salted, b"Client Key", hashlib.sha256).digest()
    stored_key = hashlib.sha256(client_key).digest()
    server_key = hmac.new(salted, b"Server Key", hashlib.sha256).digest()

    def b64(value: bytes) -> str:
        return base64.b64encode(value).decode()

    return f"SCRAM-SHA-256${iterations}:{b64(salt)}${b64(stored_key)}:{b64(server_key)}"


def rotation_sql(verifier: str) -> str:
    return f"alter role {ROLE} with password '{verifier}'"


def redact(text: str, *hidden: str) -> str:
    for value in hidden:
        if value:
            text = text.replace(value, "***")
    return re.sub(r"SCRAM-SHA-256\$\S+", "SCRAM-SHA-256$***", text)


def management_api_query(project: Project, token: str, sql: str) -> None:
    request = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{project.ref}/database/query",
        data=json.dumps({"query": sql}).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "tara-db-role",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60):
            return
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")[:500]
        raise RotationError(f"Management API: HTTP {exc.code}: {body}") from None
    except urllib.error.URLError as exc:
        raise RotationError(f"Management API irraggiungibile: {exc.reason}") from None


def store_github_secret(url: str) -> None:
    # Il valore passa da stdin: negli argomenti lo vedrebbe chiunque elenchi i processi.
    result = subprocess.run(
        ["gh", "secret", "set", "TARA_DATABASE_URL"],
        input=url,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise RotationError(f"gh secret set non riuscito: {result.stderr.strip()}")


def copy_to_clipboard(value: str) -> None:
    subprocess.run(["clip.exe"], input=value, text=True, check=True)


def wait_for_pooler(url: str, attempts: int = 8, delay: float = 15) -> int:
    """Prova la connessione finché il pooler accetta la password; restituisce gli alimenti."""
    for attempt in range(1, attempts + 1):
        try:
            with psycopg.connect(url, connect_timeout=15) as conn:
                row = conn.execute("select count(*) from public.food").fetchone()
                return int(row[0]) if row else 0
        except psycopg.OperationalError as exc:
            if attempt == attempts:
                last_line = str(exc).strip().splitlines()[-1]
                message = f"il pooler rifiuta ancora la connessione: {last_line}"
                raise RotationError(message) from None
            time.sleep(delay)
    raise RotationError("nessun tentativo di connessione")


@dataclass(frozen=True)
class Steps:
    run_sql: Callable[[str], None]
    store_secret: Callable[[str], None]
    copy: Callable[[str], None]
    check: Callable[[str], int]


def rotate(project: Project, steps: Steps, password: str) -> int:
    url = project.database_url(password)
    steps.run_sql(rotation_sql(scram_verifier(password)))
    # Da qui la password vecchia non vale più: la nuova si salva prima di provare il pooler,
    # così un errore durante la prova non la perde.
    steps.store_secret(url)
    steps.copy(url)
    return steps.check(url)


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=DESCRIPTION)
    parser.add_argument("--project-ref", default=Project.ref, help="riferimento del progetto")
    parser.add_argument("--pooler-host", default=Project.pooler_host, help="host del pooler")
    args = parser.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    project = Project(args.project_ref, args.pooler_host)

    token = (
        os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip()
        or getpass.getpass("Access token Supabase (sbp_..., non viene mostrato): ").strip()
    )
    if not TOKEN_PATTERN.fullmatch(token):
        raise SystemExit(
            f"non è un access token Supabase: {len(token)} caratteri, "
            f"inizia con 'sbp_': {token.startswith('sbp_')}"
        )

    password = new_password()
    steps = Steps(
        run_sql=lambda sql: management_api_query(project, token, sql),
        store_secret=store_github_secret,
        copy=copy_to_clipboard,
        check=wait_for_pooler,
    )
    try:
        foods = rotate(project, steps, password)
    except (RotationError, subprocess.CalledProcessError) as exc:
        raise SystemExit(redact(str(exc), password, token)) from None
    print(
        f"password del ruolo {ROLE} cambiata, segreto GitHub TARA_DATABASE_URL aggiornato, "
        f"pooler OK con {foods} alimenti visibili.\n"
        "La stringa di connessione è negli appunti: incollala su Render in TARA_DATABASE_URL "
        "(Save, rebuild, and deploy), poi revoca il token e svuota gli appunti."
    )


if __name__ == "__main__":
    main()
