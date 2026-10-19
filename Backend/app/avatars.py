"""Authenticated profile photo storage; decoded images are normalized before saving."""
import io
import os
import re
import uuid
import warnings
from pathlib import Path

from fastapi import File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy.orm import Session

def register_avatar_routes(app,engine,Record,public_user,audit,now):
    storage=Path(os.getenv('DOCUMENTS_DIR',str(Path(__file__).resolve().parents[1]/'uploads')))/'avatars'

    def photo_path(key):
        if not re.fullmatch(r'[a-f0-9]{32}\.png',key or ''): raise HTTPException(404,'Foto no encontrada.')
        return storage/key

    def cleanup(key):
        if key:
            try: photo_path(key).unlink(missing_ok=True)
            except OSError: pass

    @app.post('/api/v1/me/avatar')
    async def upload_avatar(request:Request,file:UploadFile=File(...)):
        content=await file.read(5*1024*1024+1)
        if len(content)>5*1024*1024: raise HTTPException(413,'La foto debe pesar como máximo 5 MB.')
        try:
            with warnings.catch_warnings():
                warnings.simplefilter('error',Image.DecompressionBombWarning)
                with Image.open(io.BytesIO(content)) as original:
                    if original.format not in ['JPEG','PNG','WEBP']: raise ValueError('Formato no permitido')
                    if original.width*original.height>16_000_000: raise ValueError('Resolución demasiado grande')
                    original.load()
                    image=ImageOps.exif_transpose(original).convert('RGBA')
                    image.thumbnail((512,512),Image.Resampling.LANCZOS)
                    normalized=Image.new('RGB',image.size,'white')
                    normalized.paste(image,mask=image.getchannel('A'))
                    output=io.BytesIO();normalized.save(output,format='PNG')
        except (UnidentifiedImageError,OSError,ValueError,SyntaxError,Image.DecompressionBombError,Image.DecompressionBombWarning):
            raise HTTPException(422,'Selecciona una imagen JPG, PNG o WebP válida, de hasta 16 megapíxeles.')
        storage.mkdir(parents=True,exist_ok=True)
        key=uuid.uuid4().hex+'.png';path=photo_path(key)
        old_key=None
        try:
            path.write_bytes(output.getvalue())
            with Session(engine) as s,s.begin():
                u=s.get(Record,request.state.user['id']);old_key=u.data.get('avatarKey')
                u.data={**u.data,'avatarKey':key,'avatarUpdatedAt':now()}
                audit(s,'Foto de perfil actualizada','Mi cuenta',u.id)
                result={'user':public_user(u)}
        except Exception:
            cleanup(key);raise
        cleanup(old_key)
        return result

    @app.delete('/api/v1/me/avatar')
    def delete_avatar(request:Request):
        with Session(engine) as s,s.begin():
            u=s.get(Record,request.state.user['id']);old_key=u.data.get('avatarKey')
            u.data={k:v for k,v in u.data.items() if k not in ['avatarKey','avatarUpdatedAt']}
            if old_key: audit(s,'Foto de perfil eliminada','Mi cuenta',u.id)
            result={'user':public_user(u)}
        cleanup(old_key)
        return result

    @app.get('/api/v1/avatars/{uid}/{key}')
    def avatar(uid:int,key:str,request:Request):
        if request.state.user['id']!=uid and request.state.user['role']!='Administrador': raise HTTPException(403,'No tienes acceso a esta foto.')
        with Session(engine) as s:
            u=s.get(Record,uid)
            if not u or u.kind!='users' or u.data.get('avatarKey')!=key: raise HTTPException(404,'Foto no encontrada.')
        path=photo_path(key)
        if not path.is_file(): raise HTTPException(404,'Foto no encontrada.')
        return FileResponse(path,media_type='image/png',headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})
