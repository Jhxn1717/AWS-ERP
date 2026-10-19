"""Authenticated profile photo storage; decoded images are normalized before saving."""
import io
import re
import uuid
import warnings

from fastapi import File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy.orm import Session
from .storage import document_storage, LocalStorage
from .transfers import assembled_file, discard_parts

def register_avatar_routes(app,engine,Record,public_user,audit,now):
    storage=document_storage()
    if isinstance(storage, LocalStorage):
        storage.root=storage.root/'avatars'

    def photo_path(key):
        if not re.fullmatch(r'[a-f0-9]{32}\.png',key or ''): raise HTTPException(404,'Foto no encontrada.')
        return key

    def cleanup(key):
        if key:
            try: storage.delete(photo_path(key))
            except OSError: pass

    @app.post('/api/v1/me/avatar')
    async def upload_avatar(request:Request,file:UploadFile|None=File(None),transfer:str=Form(''),parts:int=Form(0),filename:str=Form('')):
        if transfer:
            file=assembled_file(request,transfer,parts,filename,5*1024*1024)
            discard_parts(request,transfer,parts)
        if file is None: raise HTTPException(422,'Selecciona una imagen.')
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
        key=uuid.uuid4().hex+'.png';path=photo_path(key)
        old_key=None
        try:
            storage.put(path,output.getvalue())
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
        try: content=storage.get(path)
        except FileNotFoundError: raise HTTPException(404,'Foto no encontrada.')
        return Response(content,media_type='image/png',headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})
