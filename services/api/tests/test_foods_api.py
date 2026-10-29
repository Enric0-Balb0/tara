"""API del catalogo condiviso: ricerca, scheda e snapshot (RF-01, RF-03)."""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tara_api.catalog_load import CatalogEntry, load_catalog
from tara_api.db.models import AppUser, Food
from tara_api.enums import FoodSource


def value(amount: str, confidence: float = 1.0) -> dict[str, Any]:
    return {"amount": amount, "provenance": "reference", "confidence": confidence}


def food(code: str, name: str, state: str = "raw", *aliases: str, **values: str) -> CatalogEntry:
    return CatalogEntry.model_validate(
        {
            "source": "ciqual",
            "source_code": code,
            "name": name,
            "state": state,
            "names": [{"lang": "it", "name": n, "origin": "llm"} for n in (name, *aliases)]
            + [{"lang": "fr", "name": f"{name} (fr)", "origin": "source"}],
            "nutrients": {nutrient: value(amount) for nutrient, amount in values.items()},
        }
    )


CATALOG = [
    food("22001", "Albume d'uovo", "raw", "Chiara d'uovo", protein_g="10.9", energy_kcal="45"),
    food("22002", "Albume d'uovo", "cooked", protein_g="10.3"),
    food("22003", "Albume d'uovo in polvere", "not_applicable", protein_g="81.1"),
    food("36017", "Petto di pollo senza pelle", "raw", protein_g="23.4"),
    food("18003", "Caffè espresso", "not_applicable", energy_kcal="2"),
    food("9104", "Riso bianco", "cooked", protein_g="2.7"),
    food("9100", "Riso bianco", "raw", protein_g="7.1"),
]


@pytest.fixture
def catalog(session: Session) -> Session:
    load_catalog(session, CATALOG)
    return session


def names(response: Any) -> list[tuple[str, str]]:
    return [(item["name"], item["state"]) for item in response.json()["items"]]


# --- Ricerca ------------------------------------------------------------------------------


@pytest.mark.usefixtures("catalog")
def test_search_puts_names_starting_with_the_query_first_raw_before_cooked(
    client: TestClient,
) -> None:
    response = client.get("/v1/foods/search", params={"q": "albume"})

    assert response.status_code == 200
    assert names(response) == [
        ("Albume d'uovo", "raw"),
        ("Albume d'uovo", "cooked"),
        ("Albume d'uovo in polvere", "not_applicable"),
    ]


@pytest.mark.usefixtures("catalog")
def test_search_returns_macros_per_100_and_leaves_unknown_ones_empty(client: TestClient) -> None:
    item = client.get("/v1/foods/search", params={"q": "albume"}).json()["items"][0]

    assert item["per_100"] == {
        "energy_kcal": 45.0,
        "protein_g": 10.9,
        "carbs_g": None,
        "fat_g": None,
    }
    assert item["base_unit"] == "g"


@pytest.mark.usefixtures("catalog")
@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("caffe", "Caffè espresso"),  # senza accenti
        ("ALBUME", "Albume d'uovo"),  # maiuscole
        ("pollo petto", "Petto di pollo senza pelle"),  # parole in qualsiasi ordine
        ("chiara", "Albume d'uovo"),  # alias
        ("  riso   bianco ", "Riso bianco"),  # spazi in più
    ],
)
def test_search_ignores_accents_case_word_order_and_finds_aliases(
    client: TestClient, query: str, expected: str
) -> None:
    response = client.get("/v1/foods/search", params={"q": query})

    assert names(response)[0][0] == expected


@pytest.mark.usefixtures("catalog")
def test_every_word_must_match(client: TestClient) -> None:
    response = client.get("/v1/foods/search", params={"q": "riso pollo"})

    assert response.json()["items"] == []


@pytest.mark.usefixtures("catalog")
def test_like_wildcards_in_the_query_are_literal(client: TestClient) -> None:
    response = client.get("/v1/foods/search", params={"q": "%_%"})

    assert response.status_code == 200
    assert response.json()["items"] == []


@pytest.mark.usefixtures("catalog")
def test_search_honours_the_limit(client: TestClient) -> None:
    response = client.get("/v1/foods/search", params={"q": "albume", "limit": 1})

    assert len(response.json()["items"]) == 1


@pytest.mark.parametrize("params", [{"q": "a"}, {"q": "riso", "limit": 0}, {"q": "x" * 101}, {}])
def test_invalid_search_parameters_are_rejected(client: TestClient, params: dict[str, Any]) -> None:
    assert client.get("/v1/foods/search", params=params).status_code == 422


def test_personal_foods_are_not_searchable_without_authentication(
    client: TestClient, session: Session
) -> None:
    user = AppUser()
    session.add(user)
    session.flush()
    load_catalog(session, CATALOG[:1])
    personal = Food(user_id=user.id, name="Albume Eurovo", source=FoodSource.LABEL)
    session.add(personal)
    session.flush()

    response = client.get("/v1/foods/search", params={"q": "albume"})

    assert all(item["id"] != str(personal.id) for item in response.json()["items"])


# --- Scheda -------------------------------------------------------------------------------


def food_id(client: TestClient, query: str) -> str:
    return str(client.get("/v1/foods/search", params={"q": query}).json()["items"][0]["id"])


@pytest.mark.usefixtures("catalog")
def test_food_detail_has_every_value_with_provenance_in_display_order(client: TestClient) -> None:
    response = client.get(f"/v1/foods/{food_id(client, 'albume')}")

    assert response.status_code == 200
    body = response.json()
    assert (body["name"], body["state"], body["source"], body["source_code"]) == (
        "Albume d'uovo",
        "raw",
        "ciqual",
        "22001",
    )
    assert [n["name"] for n in body["names"]] == [
        "Albume d'uovo",
        "Chiara d'uovo",
        "Albume d'uovo (fr)",
    ]
    assert body["nutrients"] == [
        {
            "code": "energy_kcal",
            "name": "Energia",
            "unit": "kcal",
            "amount_per_100": 45.0,
            "provenance": "reference",
            "confidence": 1.0,
        },
        {
            "code": "protein_g",
            "name": "Proteine",
            "unit": "g",
            "amount_per_100": 10.9,
            "provenance": "reference",
            "confidence": 1.0,
        },
    ]


def test_unknown_food_is_404(client: TestClient) -> None:
    response = client.get(f"/v1/foods/{uuid.uuid4()}")

    assert response.status_code == 404
    assert response.json() == {"detail": "alimento non trovato"}


def test_food_id_must_be_a_uuid(client: TestClient) -> None:
    assert client.get("/v1/foods/albume").status_code == 422


# --- Snapshot -----------------------------------------------------------------------------


@pytest.mark.usefixtures("catalog")
def test_snapshot_contains_every_shared_food_with_its_values(client: TestClient) -> None:
    response = client.get("/v1/catalog")

    assert response.status_code == 200
    body = response.json()
    assert len(body["foods"]) == len(CATALOG)
    assert [n["code"] for n in body["nutrients"]][:3] == ["energy_kcal", "energy_kj", "protein_g"]
    egg = next(f for f in body["foods"] if f["names"] == ["Albume d'uovo", "Chiara d'uovo"])
    assert egg["values"]["protein_g"] == {
        "amount": 10.9,
        "provenance": "reference",
        "confidence": 1.0,
    }
    assert response.headers["etag"] == f'"{body["version"]}"'


@pytest.mark.usefixtures("catalog")
def test_snapshot_says_where_each_food_comes_from(client: TestClient) -> None:
    body = client.get("/v1/catalog").json()

    assert {food["source"] for food in body["foods"]} == {"ciqual"}


@pytest.mark.usefixtures("catalog")
def test_snapshot_is_not_sent_again_when_the_app_is_up_to_date(client: TestClient) -> None:
    etag = client.get("/v1/catalog").headers["etag"]

    response = client.get("/v1/catalog", headers={"If-None-Match": etag})

    assert response.status_code == 304
    assert response.content == b""


def test_snapshot_version_changes_when_foods_are_added(
    client: TestClient, session: Session
) -> None:
    load_catalog(session, CATALOG[:2])
    before = client.get("/v1/catalog").json()["version"]

    load_catalog(session, CATALOG)

    assert client.get("/v1/catalog").json()["version"] != before


@pytest.mark.usefixtures("catalog")
def test_snapshot_is_compressed(client: TestClient) -> None:
    response = client.get("/v1/catalog", headers={"Accept-Encoding": "gzip"})

    assert response.headers["content-encoding"] == "gzip"
