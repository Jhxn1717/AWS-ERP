"""Local administration. Passwords are read interactively or through stdin only."""
import argparse
import getpass
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session
from pydantic import ValidationError

from .main import engine, Record, add_record, audit, now
from .security import UserIn, actor, password_hash

def main():
    parser = argparse.ArgumentParser(description='Administración local de Nix')
    parser.add_argument('command', choices=['set-admin'])
    parser.add_argument('--email', required=True)
    parser.add_argument('--name', default='Administrador')
    parser.add_argument('--password-stdin', action='store_true')
    args = parser.parse_args()
    if args.password_stdin:
        print('Esperando contraseña por entrada estándar (no se mostrará).', flush=True)
        password = sys.stdin.readline().rstrip('\r\n')
    else:
        password = getpass.getpass('Contraseña: ')
    try:
        validated = UserIn(name=args.name,email=args.email,password=password,role='Administrador')
    except ValidationError:
        parser.error('Revisa el nombre, el correo y la contraseña (mínimo 12 caracteres).')
    email = validated.email.strip().lower()
    with Session(engine) as s,s.begin():
        user = next((u for u in s.scalars(select(Record).where(Record.kind=='users')) if u.data['email']==email),None)
        fields = {'name':validated.name,'email':email,'password':password_hash(password),'role':'Administrador','status':'Activo'}
        if user:
            user.data = {**user.data, **fields}
        else:
            user = add_record(s,'users',{**fields,'date':now()})
        for session in s.scalars(select(Record).where(Record.kind=='sessions')):
            if session.data['userId']==user.id: s.delete(session)
        marker=actor.set('Administración local')
        try: audit(s,'Cuenta administradora configurada','Administración',user.id)
        finally: actor.reset(marker)
    print('Cuenta configurada: rol Administrador, estado Activo. Contraseña almacenada como hash.',flush=True)

if __name__=='__main__': main()
