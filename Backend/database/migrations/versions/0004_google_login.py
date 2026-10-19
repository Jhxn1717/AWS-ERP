"""Verified Google identities and single-use browser login challenges."""
from alembic import op
import sqlalchemy as sa

revision = '0004'
down_revision = '0003'

def upgrade():
    op.create_table('google_identities',
        sa.Column('subject', sa.String(255), primary_key=True),
        sa.Column('userId', sa.Integer, sa.ForeignKey('users.id'), nullable=False, unique=True))
    op.create_table('google_challenges',
        sa.Column('digest', sa.String(64), primary_key=True),
        sa.Column('expires', sa.Integer, nullable=False))
    op.create_index('ix_google_challenges_expires','google_challenges',['expires'])

def downgrade():
    op.drop_table('google_identities')
    op.drop_index('ix_google_challenges_expires',table_name='google_challenges')
    op.drop_table('google_challenges')
