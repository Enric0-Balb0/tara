import pytest

from tara_api.config import Settings, to_sqlalchemy_url


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("postgresql://u:p@db:5432/tara", "postgresql+psycopg://u:p@db:5432/tara"),
        ("postgres://u:p@db:5432/tara", "postgresql+psycopg://u:p@db:5432/tara"),
        ("postgresql+psycopg://u:p@db/tara", "postgresql+psycopg://u:p@db/tara"),
    ],
)
def test_database_urls_from_providers_use_the_psycopg_driver(url: str, expected: str) -> None:
    assert to_sqlalchemy_url(url) == expected


def test_settings_expose_the_sqlalchemy_url() -> None:
    settings = Settings(database_url="postgres://u:p@db:5432/tara")

    assert settings.sqlalchemy_database_url == "postgresql+psycopg://u:p@db:5432/tara"
