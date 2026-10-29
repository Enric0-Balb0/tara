"""food cooking

Cooking method of a cooked food ("al vapore", "lessato"): a secondary detail shown next to
the state, which tells apart cooked foods with the same name (requisiti, "Stato e cottura").
Only cooked foods have it.

Revision ID: 6794f1e91aaf
Revises: 9618bb40d12b
Create Date: 2026-10-29 21:03:35.483201+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "6794f1e91aaf"
down_revision: str | None = "9618bb40d12b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("food", sa.Column("cooking", sa.Text(), nullable=True))
    op.create_check_constraint(
        op.f("ck_food_cooking_not_blank"), "food", "length(btrim(cooking)) > 0"
    )
    op.create_check_constraint(
        op.f("ck_food_cooking_only_cooked"), "food", "cooking IS NULL OR state = 'cooked'"
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_food_cooking_only_cooked"), "food", type_="check")
    op.drop_constraint(op.f("ck_food_cooking_not_blank"), "food", type_="check")
    op.drop_column("food", "cooking")
