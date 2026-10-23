from __future__ import annotations

import hashlib
import io
from pathlib import Path

import pytest

from tara_catalog import fetch
from tara_catalog.fetch import ChecksumError, SourceFile, download_source, load_sources

CONTENT = b"<TABLE></TABLE>"
CONTENT_MD5 = hashlib.md5(CONTENT).hexdigest()


class FakeResponse(io.BytesIO):
    def __enter__(self) -> FakeResponse:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()


@pytest.fixture
def requested(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Sostituisce la rete: ogni richiesta restituisce CONTENT e viene registrata."""
    urls: list[str] = []

    def fake_urlopen(request: object, timeout: float) -> FakeResponse:
        urls.append(request.full_url)  # type: ignore[attr-defined]
        return FakeResponse(CONTENT)

    monkeypatch.setattr(fetch, "urlopen", fake_urlopen)
    return urls


def source(md5: str = CONTENT_MD5) -> fetch.Source:
    return fetch.Source(
        key="test",
        folder="test-source",
        download_url="https://example.org/file/{id}",
        files=(SourceFile(id=42, name="alim.xml", md5=md5),),
    )


def test_manifest_lists_ciqual_with_checksums() -> None:
    ciqual = load_sources()["ciqual"]

    assert ciqual.folder == "ciqual-2025"
    assert {f.name for f in ciqual.files} >= {"alim_2025_11_03.xml", "compo_2025_11_03.xml"}
    assert all(len(f.md5) == 32 for f in ciqual.files)


def test_download_writes_verified_files(tmp_path: Path, requested: list[str]) -> None:
    target = download_source(source(), tmp_path)

    assert (target / "alim.xml").read_bytes() == CONTENT
    assert requested == ["https://example.org/file/42"]


def test_checksum_mismatch_leaves_no_file(tmp_path: Path, requested: list[str]) -> None:
    with pytest.raises(ChecksumError, match="alim.xml"):
        download_source(source(md5="0" * 32), tmp_path)

    assert list((tmp_path / "test-source").iterdir()) == []


def test_verified_files_are_not_downloaded_again(tmp_path: Path, requested: list[str]) -> None:
    download_source(source(), tmp_path)
    download_source(source(), tmp_path)

    assert len(requested) == 1


def test_corrupted_local_file_is_downloaded_again(tmp_path: Path, requested: list[str]) -> None:
    target = download_source(source(), tmp_path)
    (target / "alim.xml").write_bytes(b"corrotto")

    download_source(source(), tmp_path)

    assert (target / "alim.xml").read_bytes() == CONTENT
    assert len(requested) == 2


def test_cli_downloads_the_requested_source(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    downloaded: list[str] = []

    def fake_download(source: fetch.Source) -> Path:
        downloaded.append(source.key)
        return Path("data/raw") / source.folder

    monkeypatch.setattr(fetch, "download_source", fake_download)

    fetch.main(["ciqual"])

    assert downloaded == ["ciqual"]
    assert "ciqual-2025" in capsys.readouterr().out


def test_cli_rejects_unknown_sources() -> None:
    with pytest.raises(SystemExit):
        fetch.main(["fatsecret"])
