"""Persistent private file storage for serverless deployments."""
from alembic import op
import sqlalchemy as sa

revision = '0005'
down_revision = '0004'


def upgrade():
    op.create_table('stored_files',
        sa.Column('key', sa.String(200), primary_key=True),
        sa.Column('content', sa.LargeBinary(), nullable=False))


def downgrade():
    op.drop_table('stored_files')
