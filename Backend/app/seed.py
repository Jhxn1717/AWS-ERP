"""Explicit, local demonstration data. Never runs on API import."""
from sqlalchemy import select
from sqlalchemy.orm import Session

def seed_demo():
    from .database import ENV
    if ENV == 'production':
        raise RuntimeError('Demo data is disabled in production')
    from .main import engine, Product, add_record, audit
    with Session(engine) as s:
        if not s.scalar(select(Product.id).limit(1)):
            for name,sku,category,price,cost,stock,minimum in [('MacBook Pro 14″','TEC-001','Tecnología',8499,6500,24,10),('Monitor Dell 27″','TEC-002','Tecnología',1290,850,8,12),('Silla ergonómica','MOB-001','Mobiliario',890,540,42,10),('Teclado Logitech MX','TEC-003','Accesorios',459,290,6,15),('Escritorio ejecutivo','MOB-002','Mobiliario',1490,980,18,8),('Hub USB-C 8 en 1','ACC-001','Accesorios',249,140,64,20)]:
                s.add(Product(name=name,sku=sku,category=category,price=price,cost=cost,stock=stock,minimum=minimum))
            for kind,names in [('customers',['Grupo Innovatech SAC','Corporación Andina','Estudio Norte','Soluciones Pacífico','Arq. Espacios SAC']),('suppliers',['Tech Distribution Perú','Global Office SAC','Importaciones Nexus'])]:
                for i,name in enumerate(names): add_record(s,kind,{'name':name,'taxId':str(20100000000+i+(100 if kind=='suppliers' else 0)),'email':f'contacto{i+1}@empresa.example','phone':f'01 610 20{i:02}','status':'Activo'})
            for i,(name,amount,status) in enumerate([('Grupo Innovatech SAC',16998,'Pagado'),('Corporación Andina',5160,'Pendiente'),('Estudio Norte',3560,'Pagado'),('Soluciones Pacífico',2980,'Pendiente'),('Arq. Espacios SAC',2295,'Pagado')]):
                add_record(s,'sales',{'name':name,'reference':f'VEN-2026-{1048-i}','amount':amount,'paid':amount if status=='Pagado' else 0,'status':status,'date':f'2026-10-{16-i:02}T14:00:00+00:00','lines':[],'demo':True})
            for i,(name,amount) in enumerate([('Tech Distribution Perú',12800),('Global Office SAC',6480)]):
                add_record(s,'purchases',{'name':name,'reference':f'OC-2026-{220+i}','amount':amount,'paid':0,'status':'Pendiente','date':'2026-10-14T12:00:00+00:00','lines':[],'demo':True})
            audit(s,'Entorno de demostración inicializado','Sistema','DEMO'); s.commit()


if __name__ == "__main__":
    seed_demo()
