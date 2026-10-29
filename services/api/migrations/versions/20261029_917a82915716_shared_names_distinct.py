"""shared names distinct

Two shared foods with the same name, state and cooking would look identical in the app,
with different values. The exclusion constraint forbids it and is checked at commit, so a
catalog reload can move a name from one food to another.

A database loaded with the catalog before this revision has such foods: the upgrade stops
with the remedy (reload the corrected catalog after `food_cooking`, then upgrade again)
instead of a bare constraint error.

Revision ID: 917a82915716
Revises: 6794f1e91aaf
Create Date: 2026-10-29 21:03:40.022806+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "917a82915716"
down_revision: str | None = "6794f1e91aaf"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CONSTRAINT = "ex_food_shared_name_state_cooking"
DUPLICATE_GROUPS = """
    SELECT count(*) FROM (
        SELECT 1 FROM food
        WHERE user_id IS NULL
        GROUP BY lower(name), state, coalesce(cooking, '')
        HAVING count(*) > 1
    ) AS duplicates
"""


def upgrade() -> None:
    groups = op.get_bind().scalar(sa.text(DUPLICATE_GROUPS))
    if groups:
        raise RuntimeError(
            "gruppi di alimenti con lo stesso nome, stato e cottura nel catalogo condiviso: "
            f"{groups}. Ricarica il catalogo corretto (python -m tara_api.catalog_load) e "
            "rilancia alembic upgrade head"
        )
    op.execute(
        f"ALTER TABLE food ADD CONSTRAINT {CONSTRAINT} EXCLUDE USING btree "
        "(lower(name) WITH =, state WITH =, coalesce(cooking, '') WITH =) "
        "WHERE (user_id IS NULL) DEFERRABLE INITIALLY DEFERRED"
    )


def downgrade() -> None:
    op.drop_constraint(CONSTRAINT, "food")
