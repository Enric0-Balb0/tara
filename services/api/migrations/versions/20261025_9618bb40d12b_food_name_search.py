"""food name search

Search on Italian food names (RF-01): substring matching that ignores case and accents,
backed by a trigram index. `tara_search_text` is the normalization used by both the index
and the queries; it pins its search_path because extensions live in `public` locally and
in `extensions` on Supabase.

Revision ID: 9618bb40d12b
Revises: 3e18a2105403
Create Date: 2026-10-25 18:29:31.614335+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "9618bb40d12b"
down_revision: str | None = "3e18a2105403"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        """
        CREATE FUNCTION tara_search_text(value text) RETURNS text
        LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
        SET search_path = public, extensions, pg_catalog
        AS $$ SELECT unaccent('unaccent', lower(value)) $$
        """
    )
    op.create_index(
        "ix_food_name_search_text",
        "food_name",
        [sa.literal_column("tara_search_text(name) gin_trgm_ops")],
        postgresql_using="gin",
        postgresql_where=sa.text("lang = 'it'"),
    )


def downgrade() -> None:
    op.drop_index("ix_food_name_search_text", table_name="food_name")
    op.execute("DROP FUNCTION tara_search_text(text)")
    # Extensions stay: they are database-wide objects that other schemas may use.
