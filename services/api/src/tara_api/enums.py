"""Valori ammessi nel catalogo. Nel database sono in inglese; le etichette in italiano
appartengono all'interfaccia."""

from enum import StrEnum


class BaseUnit(StrEnum):
    """Unità a cui si riferiscono i valori per 100 e le quantità."""

    G = "g"
    ML = "ml"


class FoodState(StrEnum):
    """Stato dell'alimento quando si pesa: il crudo è il default (principio 4)."""

    RAW = "raw"
    COOKED = "cooked"
    NOT_APPLICABLE = "not_applicable"


class FoodSource(StrEnum):
    """Da dove arriva l'alimento."""

    CIQUAL = "ciqual"
    USDA = "usda"
    OPEN_FOOD_FACTS = "open_food_facts"
    LABEL = "label"
    MANUAL = "manual"
    RECIPE = "recipe"


REFERENCE_SOURCES = (FoodSource.CIQUAL, FoodSource.USDA)
"""Le uniche fonti ammesse nel catalogo condiviso dei generici."""


class Provenance(StrEnum):
    """Da dove arriva un singolo valore nutrizionale (principio 2)."""

    LABEL = "label"
    OPEN_FOOD_FACTS = "open_food_facts"
    REFERENCE = "reference"
    ESTIMATED = "estimated"
    MANUAL = "manual"


class Language(StrEnum):
    """Lingue dei nomi: italiano dell'app e lingue delle fonti (CIQUAL, USDA)."""

    IT = "it"
    FR = "fr"
    EN = "en"


class NameOrigin(StrEnum):
    """Chi ha prodotto un nome: la fonte, la traduzione automatica, la revisione o l'utente."""

    SOURCE = "source"
    LLM = "llm"
    REVIEWED = "reviewed"
    USER = "user"


class NutrientUnit(StrEnum):
    KCAL = "kcal"
    KJ = "kJ"
    G = "g"
    MG = "mg"
    UG = "µg"
