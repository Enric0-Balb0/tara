"""Schema del catalogo (RF-03, RNF-04).

Le regole di dominio stanno nel database come vincoli, non solo nel codice: valgono per
l'API, per la pipeline del catalogo e per chiunque scriva nelle tabelle.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Numeric,
    SmallInteger,
    Text,
    func,
    literal_column,
    text,
)
from sqlalchemy.dialects.postgresql import ExcludeConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from tara_api.db.base import Base, new_id, str_enum
from tara_api.enums import (
    REFERENCE_SOURCES,
    BaseUnit,
    FoodSource,
    FoodState,
    Language,
    NameOrigin,
    NutrientUnit,
    Provenance,
)

SNAKE_CASE_CODE = "~ '^[a-z][a-z0-9_]*$'"


class AppUser(Base):
    """Proprietario dei dati personali. Il collegamento all'identità di login arriva con
    l'autenticazione (F0, passo 4)."""

    __tablename__ = "app_user"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=new_id)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Category(Base):
    """Tassonomia fissa delle categorie (RF-05), con un livello di gerarchia o più."""

    __tablename__ = "category"
    __table_args__ = (CheckConstraint(f"code {SNAKE_CASE_CODE}", name="code_format"),)

    code: Mapped[str] = mapped_column(Text, primary_key=True)
    name_it: Mapped[str] = mapped_column(Text)
    parent_code: Mapped[str | None] = mapped_column(
        ForeignKey("category.code", ondelete="RESTRICT"), index=True
    )


class Nutrient(Base):
    """Nutrienti tracciati, nell'ordine in cui si mostrano (tabella scritta a mano)."""

    __tablename__ = "nutrient"
    __table_args__ = (CheckConstraint(f"code {SNAKE_CASE_CODE}", name="code_format"),)

    code: Mapped[str] = mapped_column(Text, primary_key=True)
    name_it: Mapped[str] = mapped_column(Text)
    unit: Mapped[NutrientUnit] = mapped_column(str_enum(NutrientUnit, "unit"))
    display_order: Mapped[int] = mapped_column(SmallInteger, unique=True)


class Food(Base):
    """Alimento generico, prodotto di marca o ricetta.

    `user_id` vuoto: catalogo condiviso dei generici importati dalle tabelle di
    composizione. Valorizzato: catalogo personale dell'utente.
    """

    __tablename__ = "food"
    __table_args__ = (
        CheckConstraint(
            "user_id IS NOT NULL OR source IN ("
            + ", ".join(f"'{source.value}'" for source in REFERENCE_SOURCES)
            + ")",
            name="shared_only_reference_sources",
        ),
        CheckConstraint("length(btrim(name)) > 0", name="name_not_blank"),
        CheckConstraint("barcode ~ '^[0-9]{8,14}$'", name="barcode_format"),
        CheckConstraint("density_g_ml > 0", name="density_positive"),
        CheckConstraint("serving_size > 0", name="serving_size_positive"),
        CheckConstraint("parent_food_id <> id", name="not_own_parent"),
        # I generici condivisi si ricaricano dalla fonte: il codice li identifica.
        CheckConstraint(
            "user_id IS NOT NULL OR source_code IS NOT NULL", name="shared_has_source_code"
        ),
        CheckConstraint("length(btrim(source_code)) > 0", name="source_code_not_blank"),
        CheckConstraint("length(btrim(cooking)) > 0", name="cooking_not_blank"),
        CheckConstraint("cooking IS NULL OR state = 'cooked'", name="cooking_only_cooked"),
        # Nell'app due generici con stesso nome, stato e cottura sembrerebbero uguali, con
        # valori diversi. Si controlla al commit: un ricaricamento può scambiare due nomi.
        ExcludeConstraint(
            (text("lower(name)"), "="),
            (text("state"), "="),
            (text("coalesce(cooking, '')"), "="),
            name="ex_food_shared_name_state_cooking",
            using="btree",
            where=text("user_id IS NULL"),
            deferrable=True,
            initially="DEFERRED",
        ),
        Index(
            "uq_food_user_id_source_source_code",
            "user_id",
            "source",
            "source_code",
            unique=True,
            postgresql_nulls_not_distinct=True,
            postgresql_where=text("source_code IS NOT NULL"),
        ),
        # Un barcode identifica un solo prodotto per catalogo; lo stesso barcode può
        # stare nei cataloghi personali di utenti diversi.
        Index(
            "uq_food_user_id_barcode",
            "user_id",
            "barcode",
            unique=True,
            postgresql_nulls_not_distinct=True,
            postgresql_where=text("barcode IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=new_id)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("app_user.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(Text)
    """Nome canonico in italiano, quello mostrato nell'app."""
    brand: Mapped[str | None] = mapped_column(Text)
    category_code: Mapped[str | None] = mapped_column(
        ForeignKey("category.code", ondelete="RESTRICT"), index=True
    )
    barcode: Mapped[str | None] = mapped_column(Text)
    base_unit: Mapped[BaseUnit] = mapped_column(
        str_enum(BaseUnit, "base_unit"), default=BaseUnit.G, server_default=BaseUnit.G.value
    )
    density_g_ml: Mapped[Decimal | None] = mapped_column(Numeric)
    serving_size: Mapped[Decimal | None] = mapped_column(Numeric)
    """Porzione dichiarata, nell'unità base."""
    state: Mapped[FoodState] = mapped_column(
        str_enum(FoodState, "state"), default=FoodState.RAW, server_default=FoodState.RAW.value
    )
    cooking: Mapped[str | None] = mapped_column(Text)
    """Metodo di cottura dei cotti ("al vapore", "lessato"): dettaglio secondario."""
    parent_food_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("food.id", ondelete="SET NULL"), index=True
    )
    """Alimento generico di riferimento: ricerca, sostituzioni, micronutrienti ereditati."""
    source: Mapped[FoodSource] = mapped_column(str_enum(FoodSource, "source"))
    source_code: Mapped[str | None] = mapped_column(Text)
    """Codice dell'alimento nella fonte (CIQUAL `alim_code`, USDA `fdc_id`)."""
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    names: Mapped[list[FoodName]] = relationship(
        back_populates="food", cascade="all, delete-orphan", passive_deletes=True
    )
    nutrient_values: Mapped[list[NutrientValue]] = relationship(
        back_populates="food", cascade="all, delete-orphan", passive_deletes=True
    )


class FoodName(Base):
    """Nomi alternativi per la ricerca: nomi originali delle fonti e alias in italiano."""

    __tablename__ = "food_name"
    __table_args__ = (
        CheckConstraint("length(btrim(name)) > 0", name="name_not_blank"),
        Index(
            "uq_food_name_food_id_lang_lower_name",
            "food_id",
            "lang",
            text("lower(name)"),
            unique=True,
        ),
        # Ricerca per sottostringa senza accenti né maiuscole (trigrammi): "caffe" trova "Caffè".
        Index(
            "ix_food_name_search_text",
            func.tara_search_text(literal_column("name")).label("search_text"),
            postgresql_using="gin",
            postgresql_ops={"search_text": "gin_trgm_ops"},
            postgresql_where=text("lang = 'it'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=new_id)
    food_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("food.id", ondelete="CASCADE"))
    lang: Mapped[Language] = mapped_column(str_enum(Language, "lang"))
    name: Mapped[str] = mapped_column(Text)
    origin: Mapped[NameOrigin] = mapped_column(str_enum(NameOrigin, "origin"))

    food: Mapped[Food] = relationship(back_populates="names")


class NutrientValue(Base):
    """Un valore per 100 g o 100 ml, sempre con provenienza e confidenza (principio 2).

    Un nutriente sconosciuto non ha riga: un dato mancante non vale zero.
    """

    __tablename__ = "nutrient_value"
    __table_args__ = (
        CheckConstraint("amount_per_100 >= 0", name="amount_not_negative"),
        CheckConstraint("confidence BETWEEN 0 AND 1", name="confidence_range"),
    )

    food_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("food.id", ondelete="CASCADE"), primary_key=True
    )
    nutrient_code: Mapped[str] = mapped_column(
        ForeignKey("nutrient.code", ondelete="RESTRICT"), primary_key=True, index=True
    )
    amount_per_100: Mapped[Decimal] = mapped_column(Numeric)
    provenance: Mapped[Provenance] = mapped_column(str_enum(Provenance, "provenance"))
    confidence: Mapped[float] = mapped_column(Float)

    food: Mapped[Food] = relationship(back_populates="nutrient_values")
