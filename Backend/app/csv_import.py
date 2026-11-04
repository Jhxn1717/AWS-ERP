"""Validated, atomic imports of the product and contact master data."""
import csv
import io
import re
import unicodedata
from decimal import Decimal, InvalidOperation
from fastapi import File, Form, HTTPException, UploadFile, Request
from typing import Literal
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

PRODUCT_COLUMNS={'nombre':'name','sku':'sku','categoria':'category','precio':'price','costo':'cost','stock':'stock','stock_minimo':'minimum'}
CONTACT_COLUMNS={'nombre':'name','tipo_documento':'documentType','documento':'taxId','correo':'email','telefono':'phone'}
CONTACT_OPTIONAL_COLUMNS={'direccion':'address','persona_contacto':'contactPerson'}
KINDS={'productos':'products','products':'products','clientes':'customers','customers':'customers','proveedores':'suppliers','suppliers':'suppliers'}

def detect_csv(content,filename=''):
    if len(content)>1024*1024: raise HTTPException(413,'El CSV debe pesar como máximo 1 MB.')
    try:
        text=content.decode('utf-8-sig')
        dialect=csv.Sniffer().sniff(text[:8192],delimiters=',;')
        reader=csv.DictReader(io.StringIO(text,newline=''),dialect=dialect,strict=True)
        headers=[h.strip().lower() for h in (reader.fieldnames or [])]
        reader.fieldnames=headers
        records=list(reader)
    except UnicodeDecodeError: raise HTTPException(422,'Guarda el archivo CSV con codificación UTF-8.')
    except csv.Error: raise HTTPException(422,'No se pudo reconocer el formato del CSV.')
    tags={str(row.get('tipo_registro') or '').strip().lower() for row in records if any(value for value in row.values())}
    tags.discard('')
    if 'tipo_registro' in headers:
        if len(tags)!=1 or next(iter(tags),'') not in KINDS: raise HTTPException(422,'El CSV debe identificar un único tipo_registro: productos, clientes o proveedores.')
        return KINDS[next(iter(tags))]
    if set(headers)==set(PRODUCT_COLUMNS): return 'products'
    if set(headers)-set(CONTACT_OPTIONAL_COLUMNS)==set(CONTACT_COLUMNS):
        name=unicodedata.normalize('NFD',filename.lower())
        tokens=set(re.findall(r'[a-z]+',name))
        matches={KINDS[token] for token in tokens if token in KINDS and KINDS[token]!='products'}
        if len(matches)==1:return matches.pop()
        raise HTTPException(422,'El archivo contiene contactos, pero no identifica si son clientes o proveedores. Usa uno de los ejemplos con la columna tipo_registro.')
    raise HTTPException(422,'No se reconocieron las columnas. Usa un CSV de productos, clientes o proveedores del ejemplo.')

def parse_csv(content,kind,ProductIn,ContactIn):
    if len(content)>1024*1024: raise HTTPException(413,'El CSV debe pesar como máximo 1 MB.')
    try: text=content.decode('utf-8-sig')
    except UnicodeDecodeError: raise HTTPException(422,'Guarda el archivo CSV con codificación UTF-8.')
    required=PRODUCT_COLUMNS if kind=='products' else CONTACT_COLUMNS
    optional={} if kind=='products' else CONTACT_OPTIONAL_COLUMNS
    columns={**required,**optional}
    try:
        dialect=csv.Sniffer().sniff(text[:8192],delimiters=',;')
        reader=csv.DictReader(io.StringIO(text,newline=''),dialect=dialect,strict=True)
        headers=[h.strip().lower() for h in (reader.fieldnames or [])]
        fields=set(headers)-{'tipo_registro'}
        if len(headers)!=len(set(headers)) or not set(required).issubset(fields) or not fields.issubset(columns):
            raise HTTPException(422,'Columnas requeridas: '+', '.join(required)+('. Opcionales: '+', '.join(optional) if optional else '')+'.')
        reader.fieldnames=headers
        rows=[];seen=set()
        for row in reader:
            line=reader.line_num
            if None in row or any(value is None for value in row.values()):
                raise HTTPException(422,f'Fila {line}: el número de columnas no coincide con la cabecera.')
            if not any(value.strip() for value in row.values()): continue
            if len(rows)>=500: raise HTTPException(422,'Se permiten hasta 500 registros por archivo.')
            if 'tipo_registro' in row and KINDS.get(row['tipo_registro'].strip().lower())!=kind:
                raise HTTPException(422,f'Fila {line}: tipo_registro no coincide con el contenido del archivo.')
            values={columns[key]:value.strip() for key,value in row.items() if key!='tipo_registro'}
            try:
                if kind=='products':
                    for key in ['stock','minimum']: values[key]=int(values[key])
                    for key in ['price','cost']: values[key]=Decimal(values[key].replace(',','.'))
                    parsed=ProductIn(**values)
                    identity=parsed.sku
                else:
                    parsed=ContactIn(**values)
                    if kind=='suppliers' and parsed.documentType!='RUC':
                        raise HTTPException(422,f'Fila {line}: los proveedores deben tener RUC.')
                    identity=parsed.taxId
            except ValidationError as error:
                fields=', '.join(str(item['loc'][0]) for item in error.errors())
                raise HTTPException(422,f'Fila {line}: revisa los campos {fields}.')
            except (ValueError,InvalidOperation):
                raise HTTPException(422,f'Fila {line}: precio, costo, stock y stock mínimo deben ser números válidos.')
            if identity in seen: raise HTTPException(409,f'Fila {line}: el identificador {identity} está repetido en el CSV.')
            seen.add(identity);rows.append((line,parsed))
        if not rows: raise HTTPException(422,'El archivo debe contener al menos un registro.')
        return rows
    except csv.Error: raise HTTPException(422,'El CSV tiene un formato inválido. Revisa el separador y las comillas.')

def register_csv_import(app,engine,Record,Product,ProductIn,ContactIn,add_record,audit,now,serialize):
    async def process(kind,file,preview,expected_kind=None):
        content=await file.read(1024*1024+1)
        if kind is None:
            kind=detect_csv(content,file.filename or '')
        if expected_kind is not None and kind!=expected_kind:
            labels={'products':'productos','customers':'clientes','suppliers':'proveedores'}
            raise HTTPException(422,f'El archivo contiene {labels[kind]}. Abre la importación de {labels[kind]} o selecciona un CSV de {labels[expected_kind]}.')
        rows=parse_csv(content,kind,ProductIn,ContactIn)
        with Session(engine) as session,session.begin():
            identities=set(session.scalars(select(Product.sku))) if kind=='products' else {r.data['taxId'] for r in session.scalars(select(Record).where(Record.kind==kind))}
            for line,body in rows:
                key=body.sku if kind=='products' else body.taxId
                if key in identities: raise HTTPException(409,f'Fila {line}: {key} ya está registrado. No se importó ningún registro.')
            if preview: return {'kind':kind,'count':len(rows),'rows':[body.model_dump(mode='json') for _,body in rows]}
            created=[]
            for _,body in rows:
                if kind=='products':
                    record=Product(**body.model_dump());session.add(record);session.flush()
                    if record.stock:
                        add_record(session,'movements',{'name':record.name,'productId':record.id,'quantity':record.stock,'stock':record.stock,'date':now(),'status':'Stock inicial','reason':'Importación CSV'})
                else: record=add_record(session,kind,{**body.model_dump(),'status':'Activo'})
                created.append(serialize(record))
            audit(session,f'Importación CSV: {len(created)} registros',kind,file.filename or 'archivo.csv')
            return {'kind':kind,'count':len(created),'rows':created}

    @app.post('/api/v1/imports/csv/preview')
    async def preview_auto(request:Request,file:UploadFile=File(...),expectedKind:Literal['products','customers','suppliers']|None=Form(None)):return await process(None,file,True,expectedKind)
    @app.post('/api/v1/imports/csv',status_code=201)
    async def import_auto(request:Request,file:UploadFile=File(...),expectedKind:Literal['products','customers','suppliers']|None=Form(None)):return await process(None,file,False,expectedKind)

    @app.post('/api/v1/products/import/preview')
    async def preview_products(file:UploadFile=File(...)): return await process('products',file,True)
    @app.post('/api/v1/products/import',status_code=201)
    async def import_products(file:UploadFile=File(...)): return await process('products',file,False)
    # Literal is resolved at declaration time; it keeps the route limited to master contacts.
    @app.post('/api/v1/contacts/{kind}/import/preview')
    async def preview_contacts(kind:Literal['customers','suppliers'],file:UploadFile=File(...)): return await process(kind,file,True)
    @app.post('/api/v1/contacts/{kind}/import',status_code=201)
    async def import_contacts(kind:Literal['customers','suppliers'],file:UploadFile=File(...)): return await process(kind,file,False)
