"""add snapshot_blobs table

Revision ID: 0002_add_snapshot_blobs
Revises: 0001_initial
Create Date: 2026-10-22

Additive migration: creates dedicated snapshot_blobs table for durable PostgreSQL
image evidence storage with ON DELETE CASCADE foreign key.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0002_add_snapshot_blobs"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "snapshot_blobs" not in insp.get_table_names():
        op.create_table(
            "snapshot_blobs",
            sa.Column(
                "snapshot_id",
                UUID(as_uuid=False),
                sa.ForeignKey("snapshots.snapshot_id", ondelete="CASCADE"),
                primary_key=True,
            ),
            sa.Column("image_data", sa.LargeBinary(), nullable=False),
            sa.Column("size_bytes", sa.BigInteger(), nullable=False),
            sa.Column("sha256", sa.String(64), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )


def downgrade() -> None:
    op.drop_table("snapshot_blobs")
