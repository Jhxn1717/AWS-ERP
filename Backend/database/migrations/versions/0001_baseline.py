"""Existing local ERP schema. Can adopt an existing matching database without deleting data."""
from alembic import op
import sqlalchemy as sa

revision = '0001'
down_revision = None

def upgrade():
    bind = op.get_bind()
    existing = sa.inspect(bind)
    expected = {
        'records': {'id', 'kind', 'data'},
        'products': {'id', 'name', 'sku', 'category', 'price', 'cost', 'stock', 'minimum'},
    }
    for table, columns in expected.items():
        if existing.has_table(table):
            if {c['name'] for c in existing.get_columns(table)} != columns:
                raise RuntimeError(f'Unexpected schema for {table}; review before migration')
        elif table == 'records':
            op.create_table('records', sa.Column('id', sa.Integer, primary_key=True),
                sa.Column('kind', sa.String(30), nullable=False), sa.Column('data', sa.JSON, nullable=False))
        else:
            op.create_table('products', sa.Column('id', sa.Integer, primary_key=True),
                sa.Column('name', sa.String(160), nullable=False),
                sa.Column('sku', sa.String(40), nullable=False, unique=True),
                sa.Column('category', sa.String(60), nullable=False),
                sa.Column('price', sa.Numeric(12,2), nullable=False),
                sa.Column('cost', sa.Numeric(12,2), nullable=False),
                sa.Column('stock', sa.Integer, nullable=False),
                sa.Column('minimum', sa.Integer, nullable=False))
    if 'ix_records_kind' not in {i['name'] for i in sa.inspect(bind).get_indexes('records')}:
        op.create_index('ix_records_kind', 'records', ['kind'])

def downgrade():
    raise RuntimeError('Baseline downgrade disabled to protect business data; restore a verified backup')
