"""catalog schema

Catalog tables (RF-03, RNF-04): users, categories, nutrients, foods, food names and
nutrient values, with the domain rules as database constraints. Seeds the nutrient
reference table; tests keep it in sync with pipelines/catalog/data/nutrienti.csv.

Revision ID: 6b62cfd0def1
Revises:
Create Date: 2026-10-23 12:41:49.716927+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "6b62cfd0def1"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Snapshot of pipelines/catalog/data/nutrienti.csv at the time of this migration:
# (code, Italian name, unit), in display order. Later changes need a new migration.
NUTRIENTS = [
    ("energy_kcal", "Energia", "kcal"),
    ("energy_kj", "Energia", "kJ"),
    ("protein_g", "Proteine", "g"),
    ("carbs_g", "Carboidrati", "g"),
    ("sugars_g", "di cui zuccheri", "g"),
    ("fat_g", "Grassi", "g"),
    ("sat_fat_g", "di cui saturi", "g"),
    ("fiber_g", "Fibre", "g"),
    ("salt_g", "Sale", "g"),
    ("sodium_mg", "Sodio", "mg"),
    ("potassium_mg", "Potassio", "mg"),
    ("calcium_mg", "Calcio", "mg"),
    ("magnesium_mg", "Magnesio", "mg"),
    ("phosphorus_mg", "Fosforo", "mg"),
    ("iron_mg", "Ferro", "mg"),
    ("zinc_mg", "Zinco", "mg"),
    ("vit_a_ug", "Vitamina A", "µg"),
    ("vit_d_ug", "Vitamina D", "µg"),
    ("vit_e_mg", "Vitamina E", "mg"),
    ("vit_c_mg", "Vitamina C", "mg"),
    ("vit_b12_ug", "Vitamina B12", "µg"),
    ("folate_ug", "Folati", "µg"),
    ("water_g", "Acqua", "g"),
    ("alcohol_g", "Alcol", "g"),
    ("caffeine_mg", "Caffeina", "mg"),
]


def upgrade() -> None:
    op.create_table(
        "app_user",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_app_user")),
    )
    op.create_table(
        "category",
        sa.Column("code", sa.Text(), nullable=False),
        sa.Column("name_it", sa.Text(), nullable=False),
        sa.Column("parent_code", sa.Text(), nullable=True),
        sa.CheckConstraint("code ~ '^[a-z][a-z0-9_]*$'", name=op.f("ck_category_code_format")),
        sa.ForeignKeyConstraint(
            ["parent_code"],
            ["category.code"],
            name=op.f("fk_category_parent_code_category"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("code", name=op.f("pk_category")),
    )
    op.create_index(op.f("ix_category_parent_code"), "category", ["parent_code"], unique=False)
    op.create_table(
        "nutrient",
        sa.Column("code", sa.Text(), nullable=False),
        sa.Column("name_it", sa.Text(), nullable=False),
        sa.Column(
            "unit",
            sa.Enum(
                "kcal",
                "kJ",
                "g",
                "mg",
                "µg",
                name="unit",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("display_order", sa.SmallInteger(), nullable=False),
        sa.CheckConstraint("code ~ '^[a-z][a-z0-9_]*$'", name=op.f("ck_nutrient_code_format")),
        sa.PrimaryKeyConstraint("code", name=op.f("pk_nutrient")),
        sa.UniqueConstraint("display_order", name=op.f("uq_nutrient_display_order")),
    )
    nutrient = sa.table(
        "nutrient",
        sa.column("code", sa.Text()),
        sa.column("name_it", sa.Text()),
        sa.column("unit", sa.Text()),
        sa.column("display_order", sa.SmallInteger()),
    )
    op.bulk_insert(
        nutrient,
        [
            {"code": code, "name_it": name_it, "unit": unit, "display_order": position}
            for position, (code, name_it, unit) in enumerate(NUTRIENTS, start=1)
        ],
    )
    op.create_table(
        "food",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("brand", sa.Text(), nullable=True),
        sa.Column("category_code", sa.Text(), nullable=True),
        sa.Column("barcode", sa.Text(), nullable=True),
        sa.Column(
            "base_unit",
            sa.Enum("g", "ml", name="base_unit", native_enum=False, create_constraint=True),
            server_default="g",
            nullable=False,
        ),
        sa.Column("density_g_ml", sa.Numeric(), nullable=True),
        sa.Column("serving_size", sa.Numeric(), nullable=True),
        sa.Column(
            "state",
            sa.Enum(
                "raw",
                "cooked",
                "not_applicable",
                name="state",
                native_enum=False,
                create_constraint=True,
            ),
            server_default="raw",
            nullable=False,
        ),
        sa.Column("parent_food_id", sa.Uuid(), nullable=True),
        sa.Column(
            "source",
            sa.Enum(
                "ciqual",
                "usda",
                "open_food_facts",
                "label",
                "manual",
                "recipe",
                name="source",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("barcode ~ '^[0-9]{8,14}$'", name=op.f("ck_food_barcode_format")),
        sa.CheckConstraint(
            "user_id IS NOT NULL OR source IN ('ciqual', 'usda')",
            name=op.f("ck_food_shared_only_reference_sources"),
        ),
        sa.CheckConstraint("density_g_ml > 0", name=op.f("ck_food_density_positive")),
        sa.CheckConstraint("length(btrim(name)) > 0", name=op.f("ck_food_name_not_blank")),
        sa.CheckConstraint("parent_food_id <> id", name=op.f("ck_food_not_own_parent")),
        sa.CheckConstraint("serving_size > 0", name=op.f("ck_food_serving_size_positive")),
        sa.ForeignKeyConstraint(
            ["category_code"],
            ["category.code"],
            name=op.f("fk_food_category_code_category"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["parent_food_id"],
            ["food.id"],
            name=op.f("fk_food_parent_food_id_food"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["app_user.id"], name=op.f("fk_food_user_id_app_user"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_food")),
    )
    op.create_index(op.f("ix_food_category_code"), "food", ["category_code"], unique=False)
    op.create_index(op.f("ix_food_parent_food_id"), "food", ["parent_food_id"], unique=False)
    op.create_index(op.f("ix_food_user_id"), "food", ["user_id"], unique=False)
    op.create_index(
        "uq_food_user_id_barcode",
        "food",
        ["user_id", "barcode"],
        unique=True,
        postgresql_nulls_not_distinct=True,
        postgresql_where=sa.text("barcode IS NOT NULL"),
    )
    op.create_table(
        "food_name",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("food_id", sa.Uuid(), nullable=False),
        sa.Column(
            "lang",
            sa.Enum("it", "fr", "en", name="lang", native_enum=False, create_constraint=True),
            nullable=False,
        ),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column(
            "origin",
            sa.Enum(
                "source",
                "llm",
                "reviewed",
                "user",
                name="origin",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.CheckConstraint("length(btrim(name)) > 0", name=op.f("ck_food_name_name_not_blank")),
        sa.ForeignKeyConstraint(
            ["food_id"], ["food.id"], name=op.f("fk_food_name_food_id_food"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_food_name")),
    )
    op.create_index(
        "uq_food_name_food_id_lang_lower_name",
        "food_name",
        ["food_id", "lang", sa.literal_column("lower(name)")],
        unique=True,
    )
    op.create_table(
        "nutrient_value",
        sa.Column("food_id", sa.Uuid(), nullable=False),
        sa.Column("nutrient_code", sa.Text(), nullable=False),
        sa.Column("amount_per_100", sa.Numeric(), nullable=False),
        sa.Column(
            "provenance",
            sa.Enum(
                "label",
                "open_food_facts",
                "reference",
                "estimated",
                "manual",
                name="provenance",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.CheckConstraint(
            "amount_per_100 >= 0", name=op.f("ck_nutrient_value_amount_not_negative")
        ),
        sa.CheckConstraint(
            "confidence BETWEEN 0 AND 1", name=op.f("ck_nutrient_value_confidence_range")
        ),
        sa.ForeignKeyConstraint(
            ["food_id"],
            ["food.id"],
            name=op.f("fk_nutrient_value_food_id_food"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["nutrient_code"],
            ["nutrient.code"],
            name=op.f("fk_nutrient_value_nutrient_code_nutrient"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("food_id", "nutrient_code", name=op.f("pk_nutrient_value")),
    )
    op.create_index(
        op.f("ix_nutrient_value_nutrient_code"), "nutrient_value", ["nutrient_code"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_nutrient_value_nutrient_code"), table_name="nutrient_value")
    op.drop_table("nutrient_value")
    op.drop_index("uq_food_name_food_id_lang_lower_name", table_name="food_name")
    op.drop_table("food_name")
    op.drop_index(
        "uq_food_user_id_barcode",
        table_name="food",
        postgresql_nulls_not_distinct=True,
        postgresql_where=sa.text("barcode IS NOT NULL"),
    )
    op.drop_index(op.f("ix_food_user_id"), table_name="food")
    op.drop_index(op.f("ix_food_parent_food_id"), table_name="food")
    op.drop_index(op.f("ix_food_category_code"), table_name="food")
    op.drop_table("food")
    op.drop_table("nutrient")
    op.drop_index(op.f("ix_category_parent_code"), table_name="category")
    op.drop_table("category")
    op.drop_table("app_user")
