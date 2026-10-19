"""Authenticated temporary file parts for function payload limits."""
import io
import re
import time

from fastapi import File, HTTPException, Request, UploadFile
from sqlalchemy import delete
from sqlalchemy.orm import Session
from .models import StoredFile
from .storage import DatabaseStorage

PART_SIZE = 2 * 1024 * 1024


def prefix(request, token):
    if not re.fullmatch(r'[0-9]{10}-[a-f0-9]{32}', token):
        raise HTTPException(422, 'Transferencia no válida.')
    stamp = int(token.split('-')[0])
    if not time.time() - 3600 <= stamp <= time.time() + 60:
        raise HTTPException(422, 'La transferencia expiró. Selecciona el archivo de nuevo.')
    return f'transfer/{stamp}/{request.state.user["id"]}/{token}/'


def assembled_file(request, token, parts, filename, maximum):
    if not 1 <= parts <= 5:
        raise HTTPException(422, 'Transferencia incompleta.')
    base = prefix(request, token)
    storage = DatabaseStorage()
    try:
        content = b''.join(storage.get(base + str(i)) for i in range(parts))
    except FileNotFoundError:
        raise HTTPException(422, 'Transferencia incompleta. Vuelve a subir el archivo.')
    if len(content) > maximum:
        raise HTTPException(413, 'El archivo supera el tamaño permitido.')
    return UploadFile(filename=filename, file=io.BytesIO(content))


def discard_parts(request, token, parts):
    storage = DatabaseStorage()
    base = prefix(request, token)
    for index in range(parts):
        storage.delete(base + str(index))


def register_transfer_routes(app, engine):
    @app.post('/api/v1/me/transfers/{token}/{index}')
    async def store_part(token: str, index: int, request: Request, file: UploadFile = File(...)):
        if not 0 <= index < 5:
            raise HTTPException(422, 'Parte no válida.')
        base = prefix(request, token)
        content = await file.read(PART_SIZE + 1)
        if not content or len(content) > PART_SIZE:
            raise HTTPException(413, 'La parte supera el tamaño permitido.')
        with Session(engine) as session, session.begin():
            session.execute(delete(StoredFile).where(
                StoredFile.key.like('transfer/%'),
                StoredFile.key < f'transfer/{int(time.time()) - 3600}/'))
        DatabaseStorage().put(base + str(index), content)
        return {'status': 'ok'}
