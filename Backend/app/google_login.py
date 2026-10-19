"""Google Identity Services: verify signed ID tokens on the server, then issue an ERP session."""
import hashlib
import hmac
import os
import secrets
import time
from typing import Literal

from fastapi import HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .models import GoogleChallenge, GoogleIdentity, User

CHALLENGE_COOKIE = 'enterprisecloud_google_nonce'

class GoogleCredential(BaseModel):
    credential: str = Field(min_length=1, max_length=16000)
    intent: Literal['login', 'register'] = 'login'

def client_id():
    return os.getenv('GOOGLE_CLIENT_ID', '').strip()

def public_signup_enabled():
    return os.getenv('GOOGLE_ALLOW_SIGNUP','false').strip().lower() == 'true'

def verify_credential(credential, audience):
    from google.auth.transport.requests import Request as GoogleRequest
    from google.oauth2 import id_token
    from google.auth import exceptions
    # google-auth checks signature, audience, issuer and expiration against Google's certificates.
    from functools import partial
    try:
        return id_token.verify_oauth2_token(credential, partial(GoogleRequest(),timeout=10), audience=audience)
    except exceptions.TransportError:
        raise
    except exceptions.GoogleAuthError as error:
        raise ValueError('Invalid Google identity') from error

def register_google_login(app, engine, add_record, audit, now, make_session, password_hash, actor):
    @app.get('/api/v1/auth/google/config')
    def config():
        return {'enabled':bool(client_id()), 'clientId':client_id() or None, 'signupEnabled':public_signup_enabled()}

    @app.get('/api/v1/auth/google/challenge')
    def challenge(response: Response):
        if not client_id():
            raise HTTPException(503, 'El acceso con Google todavía no está configurado.')
        nonce=secrets.token_urlsafe(32)
        with Session(engine) as s, s.begin():
            s.execute(delete(GoogleChallenge).where(GoogleChallenge.expires <= int(time.time())))
            s.add(GoogleChallenge(digest=hashlib.sha256(nonce.encode()).hexdigest(), expires=int(time.time())+600))
        response.set_cookie(CHALLENGE_COOKIE, nonce, httponly=True, samesite='strict',
            secure=os.getenv('COOKIE_SECURE','false').lower()=='true', max_age=600, path='/api/v1/auth/google')
        response.headers['Cache-Control']='no-store'
        return {'nonce':nonce}

    @app.post('/api/v1/auth/google')
    def login(body: GoogleCredential, request: Request, response: Response):
        audience=client_id()
        if not audience:
            raise HTTPException(503, 'El acceso con Google todavía no está configurado.')
        origins=os.getenv('ERP_ALLOWED_ORIGINS','http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:8000,http://localhost:8000').split(',')
        if request.headers.get('origin') not in [o.strip() for o in origins]:
            raise HTTPException(403, 'Origen no permitido.')
        nonce=request.cookies.get(CHALLENGE_COOKIE,'')
        if not nonce or len(nonce)>128:
            raise HTTPException(401, 'Vuelve a iniciar el acceso con Google.')
        # Consume outside the user transaction: failed attempts cannot replay this challenge.
        with Session(engine) as s, s.begin():
            consumed=s.execute(delete(GoogleChallenge).where(
                GoogleChallenge.digest==hashlib.sha256(nonce.encode()).hexdigest(),
                GoogleChallenge.expires>int(time.time())).returning(GoogleChallenge.digest)).scalar_one_or_none()
        if not consumed:
            raise HTTPException(401, 'El intento de acceso expiró. Vuelve a intentarlo.')
        try:
            claims=verify_credential(body.credential, audience)
        except ValueError:
            raise HTTPException(401, 'Google no pudo verificar esta cuenta. Vuelve a intentarlo.')
        except Exception:
            raise HTTPException(503, 'No se pudo conectar con Google. Inténtalo de nuevo.')
        token_nonce=claims.get('nonce')
        if not isinstance(token_nonce,str) or not hmac.compare_digest(token_nonce,nonce):
            raise HTTPException(401, 'El intento de acceso no corresponde a este navegador.')
        email=claims.get('email','').strip().lower()
        subject=claims.get('sub')
        if claims.get('email_verified') is not True or not isinstance(subject,str) or not subject or len(subject)>255 or not email or len(email)>160:
            raise HTTPException(401, 'Se necesita una cuenta Google con correo verificado.')
        with Session(engine) as s, s.begin():
            created = False
            identity=s.get(GoogleIdentity,subject)
            if identity:
                user=s.get(User,identity.userId)
                # An administrator changing an ERP email must not leave the old Google identity usable.
                if not user or user.email != email:
                    raise HTTPException(403, 'El correo de Google no coincide con la cuenta del ERP. Consulta al administrador.')
            else:
                # Google is authoritative for Gmail and verified Workspace domains only.
                if not (email.endswith('@gmail.com') or claims.get('hd')):
                    raise HTTPException(403, 'Usa Gmail o una cuenta de Google Workspace.')
                user=s.scalar(select(User).where(User.email==email))
                if user and s.scalar(select(GoogleIdentity).where(GoogleIdentity.userId==user.id)):
                    raise HTTPException(403, 'La cuenta ya está vinculada a otra identidad de Google.')
                if not user:
                    if body.intent == 'login':
                        raise HTTPException(404, 'Tu cuenta te espera. ¡Regístrate!')
                    admin_email=os.getenv('GOOGLE_ADMIN_EMAIL','').strip().lower()
                    allowed={v.strip().lower() for v in os.getenv('GOOGLE_ALLOWED_EMAILS','').split(',') if v.strip()}
                    has_users=s.scalar(select(User.id).limit(1)) is not None
                    if not has_users and email != admin_email:
                        raise HTTPException(403, 'El administrador debe configurar primero su cuenta.')
                    public_gmail = public_signup_enabled() and email.endswith('@gmail.com')
                    if has_users and email != admin_email and email not in allowed and not public_gmail:
                        raise HTTPException(403, 'Tu cuenta aún no tiene acceso al ERP. Solicítalo al administrador.')
                    user=add_record(s,'users',{'name':str(claims.get('name') or email.split('@')[0])[:100],
                        'email':email,'password':password_hash(secrets.token_urlsafe(48)),
                        'role':'Administrador' if email==admin_email else 'Consulta','status':'Activo','date':now()})
                    created = True
                s.add(GoogleIdentity(subject=subject,userId=user.id))
            if user.status != 'Activo':
                raise HTTPException(403, 'Esta cuenta está desactivada. Consulta al administrador.')
            if body.intent == 'register' and not created:
                raise HTTPException(409, 'Ya tienes una cuenta. Elige «Inicia sesión» para entrar.')
            marker=actor.set(user.name)
            try:
                if created:
                    audit(s,'Cuenta registrada con Google','Usuarios',user.id)
                audit(s,'Inicio de sesión con Google','Seguridad',user.id)
            finally:
                actor.reset(marker)
            response.delete_cookie(CHALLENGE_COOKIE,path='/api/v1/auth/google')
            response.headers['Cache-Control']='no-store'
            return make_session(s,user,response)
