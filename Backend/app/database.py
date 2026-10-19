"""Connection configuration and explicit schema lifecycle."""
import os
from pathlib import Path
from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url

ENV = os.getenv('ERP_ENV', 'development')
DB_URL = os.getenv('DATABASE_URL', 'sqlite:///' + str(Path(__file__).resolve().parents[1] / 'enterprisecloud.db'))
if ENV not in {'development', 'test', 'production'}:
    raise RuntimeError('ERP_ENV must be development, test or production')
if ENV == 'production':
    if make_url(DB_URL).get_backend_name() != 'postgresql':
        raise RuntimeError('Production requires PostgreSQL')
    if os.getenv('COOKIE_SECURE', '').lower() != 'true':
        raise RuntimeError('Production requires COOKIE_SECURE=true')
    origins = os.getenv('ERP_ALLOWED_ORIGINS', '').split(',')
    if not origins or any(not o.startswith('https://') or '*' in o for o in origins):
        raise RuntimeError('Production requires explicit HTTPS origins')

engine = create_engine(DB_URL, pool_pre_ping=True,
    connect_args={'check_same_thread': False} if make_url(DB_URL).get_backend_name() == 'sqlite' else {})

def initialize_database():
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    from alembic.runtime.migration import MigrationContext
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    with engine.connect() as connection:
        current = MigrationContext.configure(connection).get_current_heads()
    if set(current) != set(ScriptDirectory.from_config(config).get_heads()):
        raise RuntimeError('Database migrations required: run alembic upgrade head before starting')


if engine.dialect.name == 'sqlite':
    @event.listens_for(engine, 'connect')
    def enable_foreign_keys(connection, _):
        connection.execute('PRAGMA foreign_keys=ON')
