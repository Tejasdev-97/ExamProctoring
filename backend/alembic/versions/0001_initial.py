"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-10-18

Creates every table declared in app.db.models. This baseline uses the model
metadata directly; later schema changes must be separate revisions.
"""
from alembic import op

import app.db.models  # noqa: F401
from app.db.session import Base

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
