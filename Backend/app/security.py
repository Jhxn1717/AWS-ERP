"""Password and persistent session handling for the local ERP."""
import hashlib
import hmac
import secrets
import os
from contextvars import ContextVar
from datetime import datetime, timezone, timedelta

from fastapi import HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session
from .avatars import register_avatar_routes
from .models import User, LoginSession
from .validation import FormModel
from .origins import allowed_origins

actor = ContextVar('actor', default='Sistema')
COOKIE = os.getenv('SESSION_COOKIE_NAME','enterprisecloud_session')
ROLES = {
    'Administrador': ['*'],
    'Comercial': ['contacts/customers', 'orders/sales', 'quotes', 'payments'],
    'Compras': ['contacts/suppliers', 'orders/purchases'],
    'Almacén': ['products', 'inventory'],
    'Finanzas': ['payments'],
    'Consulta': [],
}

def password_hash(password):
    salt = secrets.token_hex(16)
    value = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 600000).hex()
    return f'{salt}:{value}'

def password_matches(password, stored):
    salt, expected = stored.split(':', 1)
    actual = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 600000).hex()
    return hmac.compare_digest(actual, expected)

class Credentials(FormModel):
    email: str = Field(min_length=5, max_length=160,pattern=r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
    password: str = Field(min_length=1, max_length=200)

class UserIn(Credentials):
    name: str = Field(min_length=2, max_length=100)
    role: str = 'Consulta'
    password: str = Field(min_length=12, max_length=200)

class UserUpdate(FormModel):
    name: str = Field(min_length=2,max_length=100)
    email: str = Field(min_length=5,max_length=160,pattern=r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
    role: str

class PersonalProfile(FormModel):
    model_config=ConfigDict(extra='forbid')
    name: str = Field(min_length=2,max_length=100)
    alias: str = Field(default='',max_length=60)
    headline: str = Field(default='',max_length=120)
    bio: str = Field(default='',max_length=1000)
    interests: str = Field(default='',max_length=300)
    organization: str = Field(default='',max_length=160)
    jobTitle: str = Field(default='',max_length=120)
    department: str = Field(default='',max_length=100)
    location: str = Field(default='',max_length=120)
    avatarColor: str = Field(default='emerald',pattern=r'^(emerald|blue|violet|orange|slate|rose)$')
    stockAlerts: bool = True
    transactionAlerts: bool = True
    weeklySummary: bool = False

def register_security(app, engine, Record, add_record, audit, now):
    def public_user(r):
        result={'id':r.id,**{k:v for k,v in r.data.items() if k not in ['password','avatarKey']}}
        if r.data.get('avatarKey'): result['avatarUrl']=f"/api/v1/avatars/{r.id}/{r.data['avatarKey']}"
        return result
    def users(s): return list(s.scalars(select(Record).where(Record.kind == 'users')))
    def session_user(request, s):
        token = request.cookies.get(COOKIE)
        if not token: return None
        digest = hashlib.sha256(token.encode()).hexdigest()
        r = s.scalar(select(LoginSession).where(LoginSession.token == digest, LoginSession.expires > now()))
        if r:
            u = s.get(User, r.userId)
            if u and u.status == 'Activo': return u
        return None
    def make_session(s, user, response):
        for expired in s.scalars(select(Record).where(Record.kind=='sessions')):
            if expired.data['expires']<=now(): s.delete(expired)
        token = secrets.token_urlsafe(48)
        add_record(s, 'sessions', {'token': hashlib.sha256(token.encode()).hexdigest(), 'userId': user.id, 'createdAt':now(), 'expires': (datetime.now(timezone.utc)+timedelta(hours=8)).isoformat()})
        response.set_cookie(COOKIE, token, httponly=True, samesite='strict', max_age=28800, secure=os.getenv('COOKIE_SECURE','false').lower()=='true', path='/')
        return public_user(user)

    @app.middleware('http')
    async def authenticate(request, call_next):
        path = request.url.path
        open_paths = ['/api/v1/auth/google','/api/v1/auth/google/config','/api/v1/auth/google/challenge','/api/v1/ready','/api/v1/health','/api/v1/auth/session','/api/v1/auth/setup','/api/v1/auth/login']
        if not path.startswith('/api/') or path in open_paths: return await call_next(request)
        with Session(engine) as s: u = session_user(request,s)
        if not u: return JSONResponse({'detail':'Inicia sesión para continuar.'}, status_code=401)
        request.state.user = public_user(u)
        if (path.startswith('/api/v1/admin') or path=='/api/v1/users' or path.startswith('/api/v1/users/')) and u.data['role']!='Administrador':
            return JSONResponse({'detail':'Acceso exclusivo de administración.'},status_code=403)
        if request.method not in ['GET','HEAD','OPTIONS']:
            origin = request.headers.get('origin')
            origins = allowed_origins()
            if origin and origin not in origins:
                return JSONResponse({'detail':'Origen no permitido.'},status_code=403)
            action = path.removeprefix('/api/v1/')
            allowed = ROLES.get(u.data['role'], [])
            personal=(action.startswith('me/transfers/') and request.method=='POST') or (action=='me/profile' and request.method=='PATCH') or (action=='me/avatar' and request.method in ['POST','DELETE'])
            csv_import=action in {'imports/csv','imports/csv/preview'} and any(p in allowed for p in ['products','contacts/customers','contacts/suppliers'])
            permitted = '*' in allowed or action == 'auth/logout' or personal or csv_import or (u.data['role']!='Consulta' and action.startswith('documents')) or any(action == p or action.startswith(p+'/') for p in allowed)
            if not permitted: return JSONResponse({'detail':'Tu rol no permite esta operación.'},status_code=403)
        marker = actor.set(u.data['name'])
        try: return await call_next(request)
        finally: actor.reset(marker)

    @app.get('/api/v1/auth/session')
    def session(request: Request):
        with Session(engine) as s:
            u = session_user(request,s)
            return {'user':public_user(u) if u else None,'needsSetup':not bool(users(s))}

    @app.get('/api/v1/me/profile')
    def my_profile(request:Request):
        with Session(engine) as s:
            u=s.get(Record,request.state.user['id'])
            return {'user':public_user(u),'profile':PersonalProfile(name=u.data['name'],**u.data.get('profile',{})).model_dump()}

    @app.patch('/api/v1/me/profile')
    def save_profile(body:PersonalProfile,request:Request):
        with Session(engine) as s,s.begin():
            u=s.get(Record,request.state.user['id'])
            values=body.model_dump();name=values.pop('name').strip()
            if len(name)<2: raise HTTPException(422,'Escribe un nombre válido de al menos dos caracteres.')
            u.data={**u.data,'name':name,'profile':values,'profileUpdatedAt':now()}
            audit(s,'Perfil personal actualizado','Mi cuenta',u.id)
            return {'user':public_user(u),'profile':{'name':name,**values}}

    @app.get('/api/v1/me/export')
    def export_profile(request:Request):
        with Session(engine) as s:
            u=s.get(Record,request.state.user['id'])
            return {'exportedAt':now(),'account':public_user(u),'scope':'Datos de tu cuenta y preferencias personales en EnterpriseCloud'}

    @app.post('/api/v1/auth/setup', status_code=201)
    def setup(body: UserIn, response: Response):
        with Session(engine) as s,s.begin():
            if users(s): raise HTTPException(409,'La cuenta inicial ya fue configurada.')
            u=add_record(s,'users',{'name':body.name.strip(),'email':body.email.strip().lower(),'password':password_hash(body.password),'role':'Administrador','status':'Activo','date':now()})
            marker=actor.set(u.data['name'])
            try: audit(s,'Administrador inicial creado','Administración',u.id)
            finally: actor.reset(marker)
            return make_session(s,u,response)

    @app.post('/api/v1/auth/login')
    def login(body: Credentials,response: Response):
        with Session(engine) as s,s.begin():
            u=s.scalar(select(User).where(User.email==body.email.strip().lower()))
            if not u or not password_matches(body.password,u.data['password']) or u.data['status']!='Activo': raise HTTPException(401,'Correo o contraseña incorrectos.')
            marker=actor.set(u.data['name'])
            try: audit(s,'Inicio de sesión','Seguridad',u.id)
            finally: actor.reset(marker)
            return make_session(s,u,response)

    @app.post('/api/v1/auth/logout')
    def logout(request: Request,response: Response):
        digest=hashlib.sha256(request.cookies.get(COOKIE,'').encode()).hexdigest()
        with Session(engine) as s,s.begin():
            for r in s.scalars(select(Record).where(Record.kind=='sessions')):
                if hmac.compare_digest(r.data['token'],digest): s.delete(r)
        response.delete_cookie(COOKIE,path='/'); return {'status':'ok'}

    @app.get('/api/v1/users')
    def list_users(request: Request):
        if request.state.user['role']!='Administrador': raise HTTPException(403,'Acceso exclusivo de administración.')
        with Session(engine) as s: return {'users':[public_user(u) for u in users(s)],'roles':ROLES}

    @app.post('/api/v1/users',status_code=201)
    def create_user(body: UserIn):
        if body.role not in ROLES: raise HTTPException(422,'Rol no válido.')
        with Session(engine) as s,s.begin():
            if any(u.data['email']==body.email.strip().lower() for u in users(s)): raise HTTPException(409,'El correo ya está registrado.')
            u=add_record(s,'users',{'name':body.name.strip(),'email':body.email.strip().lower(),'password':password_hash(body.password),'role':body.role,'status':'Activo','date':now()})
            audit(s,'Usuario creado','Administración',u.id); return public_user(u)

    @app.post('/api/v1/users/{uid}/toggle')
    def toggle_user(uid:int,request:Request):
        if uid==request.state.user['id']: raise HTTPException(409,'No puedes desactivar tu propia cuenta.')
        with Session(engine) as s,s.begin():
            u=s.get(Record,uid)
            if not u or u.kind!='users': raise HTTPException(404,'Usuario no encontrado.')
            u.data={**u.data,'status':'Inactivo' if u.data['status']=='Activo' else 'Activo'}
            for session in s.scalars(select(LoginSession).where(LoginSession.userId==uid)):
                s.delete(session)
            audit(s,'Estado de usuario actualizado','Administración',uid); return public_user(u)

    @app.patch('/api/v1/users/{uid}')
    def edit_user(uid:int,body:UserUpdate,request:Request):
        if body.role not in ROLES: raise HTTPException(422,'Rol no válido.')
        if uid==request.state.user['id'] and body.role!='Administrador': raise HTTPException(409,'No puedes retirar tu propio acceso de administrador.')
        with Session(engine) as s,s.begin():
            u=s.get(Record,uid)
            if not u or u.kind!='users': raise HTTPException(404,'Usuario no encontrado.')
            email=body.email.strip().lower()
            if any(x.id!=uid and x.data['email']==email for x in users(s)): raise HTTPException(409,'El correo ya está registrado.')
            changed_role=u.data['role']!=body.role
            u.data={**u.data,'name':body.name.strip(),'email':email,'role':body.role}
            if changed_role:
                for session in s.scalars(select(Record).where(Record.kind=='sessions')):
                    if session.data['userId']==uid: s.delete(session)
            audit(s,'Usuario y permisos actualizados','Administración',uid); return public_user(u)

    @app.get('/api/v1/admin/overview')
    def admin_overview():
        with Session(engine) as s:
            team=users(s)
            active_ids={u.id for u in team if u.data['status']=='Activo'}
            active_sessions=[r for r in s.scalars(select(Record).where(Record.kind=='sessions')) if r.data['expires']>now() and r.data['userId'] in active_ids]
            events=list(s.scalars(select(Record).where(Record.kind=='audit').order_by(Record.id.desc()).limit(8)))
            documents=list(s.scalars(select(Record).where(Record.kind=='documents')))
            return {'users':len(team),'activeUsers':len(active_ids),'admins':sum(u.data['role']=='Administrador' and u.data['status']=='Activo' for u in team),'sessions':len(active_sessions),'documents':len(documents),'storageBytes':sum(d.data.get('size',0) for d in documents),'database':'SQLite local' if str(engine.url).startswith('sqlite') else 'PostgreSQL','apiVersion':app.version,'events':[{'id':e.id,**e.data} for e in events]}

    @app.get('/api/v1/admin/sessions')
    def admin_sessions(request:Request):
        digest=hashlib.sha256(request.cookies.get(COOKIE,'').encode()).hexdigest()
        with Session(engine) as s:
            team={u.id:u for u in users(s)}
            result=[]
            for r in s.scalars(select(Record).where(Record.kind=='sessions').order_by(Record.id.desc())):
                u=team.get(r.data['userId'])
                if not u or u.data['status']!='Activo' or r.data['expires']<=now(): continue
                result.append({'id':r.id,'userId':u.id,'name':u.data['name'],'email':u.data['email'],'role':u.data['role'],'createdAt':r.data.get('createdAt'),'expires':r.data['expires'],'current':hmac.compare_digest(r.data['token'],digest)})
            return result

    @app.delete('/api/v1/admin/sessions/{sid}')
    def revoke_session(sid:int,request:Request):
        digest=hashlib.sha256(request.cookies.get(COOKIE,'').encode()).hexdigest()
        with Session(engine) as s,s.begin():
            r=s.get(Record,sid)
            if not r or r.kind!='sessions': raise HTTPException(404,'Sesión no encontrada.')
            if hmac.compare_digest(r.data['token'],digest): raise HTTPException(409,'Usa Cerrar sesión para terminar tu sesión actual.')
            uid=r.data['userId'];s.delete(r)
            audit(s,'Sesión revocada','Seguridad',uid); return {'status':'ok'}

    from .google_login import register_google_login
    register_google_login(app,engine,add_record,audit,now,make_session,password_hash,actor)
    register_avatar_routes(app,engine,Record,public_user,audit,now)
