"""Clear local business data after an online SQLite backup; retain accounts and company."""
import argparse
import sqlite3
from pathlib import Path
from datetime import datetime,timezone
from sqlalchemy import select,func
from sqlalchemy.orm import Session
from .database import engine,ENV
from .models import Record,Product

BUSINESS_KINDS=['payments','movements','sales','purchases','quotes','customers','suppliers','documents']

def reset_local_workspace():
    backend=Path(__file__).resolve().parents[1]
    database=Path(engine.url.database or '').resolve()
    if ENV!='development' or engine.dialect.name!='sqlite' or not database.is_relative_to(backend):
        raise RuntimeError('El reinicio solo se permite en una base SQLite de desarrollo dentro de Backend.')
    directory=backend.parent/'output'/'backups'
    directory.mkdir(parents=True,exist_ok=True)
    destination=directory/('antes-presentacion-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'.db')
    with sqlite3.connect(database) as source,sqlite3.connect(destination) as backup:
        source.backup(backup)
        if backup.execute('PRAGMA integrity_check').fetchone()[0]!='ok': raise RuntimeError('No se pudo verificar el respaldo.')
    with Session(engine) as session,session.begin():
        for kind in BUSINESS_KINDS:
            for record in session.scalars(select(Record).where(Record.kind==kind)):
                session.delete(record)
            session.flush()
        for product in session.scalars(select(Product)):session.delete(product)
        session.flush()
        if session.scalar(select(func.count()).select_from(Product)) or session.scalar(select(func.count()).select_from(Record).where(Record.kind.in_(BUSINESS_KINDS))):
            raise RuntimeError('El reinicio no se completó; la transacción se revertirá.')
    return destination

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--confirm',action='store_true',required=True)
    parser.parse_args()
    print('Respaldo:',reset_local_workspace())
    print('Datos comerciales vacíos. Usuarios, sesiones, empresa y auditoría conservados.')
