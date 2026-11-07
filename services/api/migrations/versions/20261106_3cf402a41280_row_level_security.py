"""row level security

On Supabase every new table in `public` is granted to `anon` and `authenticated`, and the
Data API serves it to anyone holding the public key the app ships with. Row level security
with no policy shows those roles no rows and accepts no writes. The API connects as the
table owner, which bypasses it, and so do the local and CI databases.

Every later migration that creates a table enables it too: a test fails otherwise.

Revision ID: 3cf402a41280
Revises: 917a82915716
Create Date: 2026-11-06 19:57:43.770197+00:00
"""

from collections.abc import Sequence

from alembic import op

revision: str = "3cf402a41280"
down_revision: str | None = "917a82915716"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = (
    "alembic_version",
    "app_user",
    "category",
    "nutrient",
    "food",
    "food_name",
    "nutrient_value",
)


def upgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
