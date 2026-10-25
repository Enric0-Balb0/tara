"""food source code

Code of a food in its source (CIQUAL `alim_code`, USDA `fdc_id`), so the shared catalog
can be reloaded from the pipeline without duplicates (RF-01). Shared foods must have it;
the CHECK fails if shared foods without a code already exist (none do: the catalog has
never been loaded before this revision).

Revision ID: 3e18a2105403
Revises: 6b62cfd0def1
Create Date: 2026-10-25 18:09:35.319918+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "3e18a2105403"
down_revision: str | None = "6b62cfd0def1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("food", sa.Column("source_code", sa.Text(), nullable=True))
    op.create_check_constraint(
        op.f("ck_food_shared_has_source_code"),
        "food",
        "user_id IS NOT NULL OR source_code IS NOT NULL",
    )
    op.create_check_constraint(
        op.f("ck_food_source_code_not_blank"), "food", "length(btrim(source_code)) > 0"
    )
    op.create_index(
        "uq_food_user_id_source_source_code",
        "food",
        ["user_id", "source", "source_code"],
        unique=True,
        postgresql_nulls_not_distinct=True,
        postgresql_where=sa.text("source_code IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_food_user_id_source_source_code", table_name="food")
    op.drop_constraint(op.f("ck_food_source_code_not_blank"), "food", type_="check")
    op.drop_constraint(op.f("ck_food_shared_has_source_code"), "food", type_="check")
    op.drop_column("food", "source_code")
