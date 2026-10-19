# Instalación, PostgreSQL y preparación para AWS

Este proyecto de instituto puede demostrarse sin contratar AWS. Se ejecuta directamente con Python y Node.js; el despliegue AWS sigue pendiente.

## Desarrollo local

Desde `Backend`:

```powershell
python -m pip install -r requirements.txt
python -m alembic upgrade head
# Opcional, solo para una base de demostración vacía:
python -m app.seed
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Las migraciones son obligatorias antes de arrancar. La API ya no crea tablas ni inserta datos ficticios al importar. Conservar la base y `uploads/` juntos al respaldar. Reiniciar el servidor después de actualizar el esquema.

## Arranque directo con PostgreSQL

Instalar Python 3.11+, Node.js 22 y PostgreSQL directamente en el equipo o servidor. Para una demo local se puede conservar SQLite.

Desde otra terminal en la carpeta del proyecto:

```powershell
cd Frontend
npm ci
npm run dev
```

Abrir `http://127.0.0.1:5173`. Vite conecta `/api/` con el backend local.

Para PostgreSQL, crear una base y usuario propietario. Configurar la URL antes de migrar y arrancar:

```powershell
cd Backend
$env:DATABASE_URL='postgresql+psycopg://USUARIO:CLAVE@127.0.0.1:5432/enterprisecloud'
python -m alembic upgrade head
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

La URL puede definirse en `.env` en la carpeta del proyecto. Codificar caracteres especiales de las credenciales como componentes de URL. Una base nueva no importa los datos SQLite. Crear el administrador antes de permitir acceso externo.

## Publicar directamente en un servidor

1. Instalar las dependencias Python en un entorno virtual y configurar las variables de entorno de la tabla siguiente.
2. Aplicar `python -m alembic upgrade head` desde `Backend`.
3. Ejecutar Uvicorn como servicio del sistema, con reinicio ante fallos, directorio `Backend`, variables de entorno configuradas y escucha en `127.0.0.1:8000`.
4. Ejecutar `npm ci` y `npm run build` desde `Frontend`. Copiar el contenido de `Frontend/dist` a `/var/www/enterprisecloud` en el servidor Linux.
5. Instalar Nginx y usar `Frontend/nginx.conf` como referencia. Configurar dominio, certificado HTTPS y redireccionamiento HTTP antes de publicar. El ejemplo en puerto 8080 no incluye TLS.
6. Restringir PostgreSQL al backend. Configurar `DOCUMENTS_DIR` en un directorio persistente con permisos para el servicio y respaldar base y archivos.
7. Verificar `/api/v1/ready`, acceso de administrador y usuario, operaciones y carga/descarga de archivos desde el dominio publicado.

Vite se usa para desarrollo. Nginx sirve los archivos compilados en el servidor.

## Modelo relacional

`app/models.py` define productos, contactos, operaciones, detalles, pagos, usuarios, sesiones y movimientos. `records` conserva los identificadores globales y metadatos complementarios JSON. Los campos financieros, identidad y relaciones se almacenan en columnas tipadas. El acceso `record.data` mantiene la compatibilidad con las respuestas de la API; no es la fuente JSON de esos campos.

Hay claves foráneas, índices y restricciones de unicidad e importes. Las operaciones históricas de demostración pueden carecer de contacto o detalle, y los movimientos históricos pueden carecer de producto: la migración no inventa relaciones. Los nuevos movimientos incluyen el producto. Documentos, empresa, preferencias y eventos conservan metadatos JSON.

La migración `0002` convierte los registros anteriores conservando sus IDs; `0003` impide modificar o borrar auditorías mediante SQL ordinario. Un propietario de la base aún puede retirar los triggers: esto no reemplaza un archivo externo inmutable.

Antes de migrar una base real, detener escrituras, respaldarla y verificar la migración en una copia. No se permite deshacer las dos primeras revisiones borrando datos; restaurar un respaldo verificado para volver atrás.

## Destino AWS

Arquitectura de referencia para una fase posterior:

```mermaid
flowchart LR
  Browser[Navegador] --> HTTPS[Entrada HTTPS]
  HTTPS --> Web[Frontend estático]
  HTTPS --> API[Python + Uvicorn en EC2]
  API --> RDS[(RDS PostgreSQL privado)]
  API --> S3[S3 privado: documentos]
  API --> Files[Volumen persistente: avatares]
  API --> Logs[Logs y métricas CloudWatch]
```

El backend se instala directamente en EC2 como servicio del sistema. Nginx sirve el frontend compilado y conecta `/api/` con `127.0.0.1:8000`. Es una referencia sin infraestructura provisionada.

Variables de producción:

| Variable | Uso |
|---|---|
| `ERP_ENV=production` | Exige PostgreSQL, cookies seguras, orígenes HTTPS y esquema actualizado |
| `DATABASE_URL` | URL PostgreSQL con credenciales obtenidas fuera del repositorio |
| `COOKIE_SECURE=true` | Cookie solo mediante HTTPS |
| `ERP_ALLOWED_ORIGINS` | Orígenes HTTPS exactos separados por comas |
| `DOCUMENT_STORAGE=s3` | Activa documentos en S3 |
| `S3_DOCUMENTS_BUCKET` | Bucket privado de destino |
| `AWS_DEFAULT_REGION` | Región elegida |
| `DOCUMENTS_DIR` | Volumen persistente para avatares y documentos locales anteriores |

El SDK obtiene credenciales mediante su cadena estándar; en AWS utilizar un rol IAM del servicio, sin claves fijas. El rol necesita `s3:PutObject`, `s3:GetObject` y `s3:DeleteObject` únicamente en `arn:aws:s3:::BUCKET/documents/*`. Configurar bloqueo de acceso público, cifrado, versionado y política TLS del bucket. Las cargas nuevas usan cifrado AES256 y no solicitan ACL pública. Las descargas continúan pasando por la API autenticada. Los documentos locales anteriores conservan su proveedor y no se trasladan solos.

Los avatares siguen en disco: montar almacenamiento persistente o implementar su traslado antes de escalar a varias instancias. Configurar RDS privado, TLS de conexión, gestor de secretos, restricciones de red y respaldos con restauración ensayada. Elegir región, tamaño y presupuesto antes de crear recursos.

## Verificación y observabilidad

```powershell
cd Backend
python -m unittest discover -s tests -v
```

Para probar PostgreSQL, definir `TEST_DATABASE_URL` apuntando a una base exclusiva y vacia de pruebas, nunca a datos reales. GitHub Actions inicia PostgreSQL instalado en el runner, crea una base de pruebas y ejecuta migraciones, pruebas y build del frontend. El workflow remoto requiere verificar su resultado en GitHub.

`/api/v1/health` comprueba que la API responde; `/api/v1/ready` comprueba conexión SQL y devuelve 503 si falla. Ambos están disponibles sin sesión para health checks y no devuelven credenciales. Cada solicitud recibe `X-Request-ID` y genera un log JSON con ruta normalizada, estado y duración; se omiten cookies, cuerpos y query strings.

En AWS, conectar stdout a CloudWatch y crear alarmas sobre errores, latencia y disponibilidad, además de CPU/memoria y RDS. Esa conexión y sus alarmas todavía no están desplegadas. CI verifica cambios; el despliegue continuo requiere un destino y credenciales.

Referencias: [Alembic](https://alembic.sqlalchemy.org/en/latest/tutorial.html), [despliegue FastAPI](https://fastapi.tiangolo.com/deployment/).

## Acceso con Google

El inicio con Gmail/Workspace est? implementado y requiere configurar un ID de cliente web de Google. Consultar [activaci?n y permisos](acceso-con-google.md).
