from __future__ import annotations

import uuid
from enum import StrEnum

import uuid_utils.compat
from sqlalchemy import Enum, MetaData
from sqlalchemy.orm import DeclarativeBase

# Nomi dei vincoli stabili e prevedibili: Alembic li usa per generare e annullare le migrazioni.
NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def new_id() -> uuid.UUID:
    """UUIDv7: ordinato nel tempo, generabile anche dal telefono offline (sync per riga)."""
    return uuid_utils.compat.uuid7()


def str_enum(enum_class: type[StrEnum], name: str) -> Enum:
    """Valori ammessi come testo con CHECK: si estendono con una migrazione semplice."""
    return Enum(
        enum_class,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=max(len(member.value) for member in enum_class),
        values_callable=lambda members: [member.value for member in members],
        validate_strings=True,
    )
