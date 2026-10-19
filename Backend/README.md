# Backend: la lógica del ERP

Esta carpeta contiene el servidor. Recibe solicitudes del navegador, verifica quién las realiza, aplica las reglas de negocio y guarda los cambios.

## Archivos para empezar

| Archivo | Qué hace |
|---|---|
| `app/main.py` | Crea la aplicación FastAPI, registra productos, ventas, compras y pagos. |
| `app/models.py` | Define tablas, relaciones y restricciones de la base. |
| `app/database.py` | Configura la conexi?n y verifica las migraciones. |
| `app/security.py` | Inicio y cierre de sesión, contraseñas, usuarios, roles, perfil personal y panel administrativo. |
| `app/operations.py` | Edición de contactos y productos, ajustes, anulaciones, documentos y empresa. |
| `app/avatars.py` | Valida, guarda y entrega las fotos de perfil. |
| `app/manage.py` | Herramienta local para configurar o recuperar una cuenta administradora. |
| `tests/test_flows.py` | Pruebas de reglas de negocio, permisos, perfiles y documentos. |
| `requirements.txt` | Bibliotecas de Python que necesita el servidor. |

`enterprisecloud.db` contiene la base SQLite local y `uploads/` los archivos. Los modelos se encuentran en `app/models.py` y las migraciones Alembic en `database/migrations/`. No editar los archivos de datos como codigo.

## Arrancar

Desde la raíz del proyecto:

```powershell
cd Backend
python -m pip install -r requirements.txt
python -m alembic upgrade head
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

La API escucha en http://127.0.0.1:8000. Sus rutas y esquemas se pueden explorar en http://127.0.0.1:8000/docs; las operaciones protegidas requieren sesión.

## Comprobar los cambios

Desde esta carpeta:

```powershell
python -m unittest discover -s tests -v
```

Las pruebas crean una base temporal, no utilizan la base de tu empresa.

Continúa con la [guía del código](../docs/guia-del-codigo.md).

Consulta [instalaci?n, PostgreSQL y AWS](../docs/instalacion-y-despliegue.md).

## Acceso con Google

El inicio con Gmail/Workspace est? implementado y requiere configurar un ID de cliente web de Google. Consultar [activaci?n y permisos](../docs/acceso-con-google.md).
