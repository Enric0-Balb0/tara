"""Scarica le fonti del catalogo elencate in data/fonti.toml e ne verifica l'MD5.

    uv run python -m tara_catalog.fetch ciqual

I file finiscono in data/raw/<cartella>/, ignorata da git. Un file già presente con il
checksum giusto non si scarica di nuovo; un file con checksum sbagliato non resta su disco.
"""

from __future__ import annotations

import argparse
import hashlib
import tomllib
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from urllib.request import Request, urlopen

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
SOURCES_PATH = DATA_DIR / "fonti.toml"
RAW_DIR = DATA_DIR / "raw"
USER_AGENT = "Tara/0.1 (progetto personale; pipeline del catalogo)"
CHUNK = 1 << 20
DESCRIPTION = "Scarica le fonti del catalogo elencate in data/fonti.toml e ne verifica l'MD5."


class ChecksumError(RuntimeError):
    """Il file scaricato non corrisponde al checksum del manifest."""


@dataclass(frozen=True)
class SourceFile:
    id: int
    name: str
    md5: str


@dataclass(frozen=True)
class Source:
    key: str
    folder: str
    download_url: str
    files: tuple[SourceFile, ...]


def load_sources(path: Path = SOURCES_PATH) -> dict[str, Source]:
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    return {
        key: Source(
            key=key,
            folder=raw["folder"],
            download_url=raw["download_url"],
            files=tuple(SourceFile(f["id"], f["name"], f["md5"]) for f in raw["files"]),
        )
        for key, raw in data.items()
    }


def md5_of(path: Path) -> str:
    digest = hashlib.md5(usedforsecurity=False)
    with path.open("rb") as f:
        while chunk := f.read(CHUNK):
            digest.update(chunk)
    return digest.hexdigest()


def download_source(source: Source, raw_dir: Path = RAW_DIR) -> Path:
    """Scarica i file mancanti o corrotti della fonte; restituisce la cartella."""
    target = raw_dir / source.folder
    target.mkdir(parents=True, exist_ok=True)
    for file in source.files:
        path = target / file.name
        if path.exists() and md5_of(path) == file.md5:
            print(f"già presente: {file.name}")
            continue
        _download(source.download_url.format(id=file.id), path, file.md5)
        print(f"scaricato e verificato: {file.name}")
    return target


def _download(url: str, path: Path, expected_md5: str) -> None:
    partial = path.with_name(path.name + ".part")
    request = Request(url, headers={"User-Agent": USER_AGENT})
    digest = hashlib.md5(usedforsecurity=False)
    try:
        with urlopen(request, timeout=60) as response, partial.open("wb") as out:
            while chunk := response.read(CHUNK):
                digest.update(chunk)
                out.write(chunk)
        if digest.hexdigest() != expected_md5:
            raise ChecksumError(
                f"{path.name}: MD5 {digest.hexdigest()} diverso da {expected_md5} atteso"
            )
        partial.replace(path)
    finally:
        partial.unlink(missing_ok=True)


def main(argv: Sequence[str] | None = None) -> None:
    sources = load_sources()
    parser = argparse.ArgumentParser(description=DESCRIPTION)
    parser.add_argument("source", choices=sorted(sources))
    args = parser.parse_args(argv)
    print(download_source(sources[args.source]))


if __name__ == "__main__":
    main()
