# Despliegue completo en Vercel

La raíz del repositorio incluye `vercel.json` y la entrada ASGI `api/index.py`.
La interfaz y `/api/` se publican bajo el mismo dominio. No publicar solamente
`Frontend/dist` para el despliegue completo.

Configurar estas variables de producción en Vercel:

- `DATABASE_URL`: PostgreSQL (se acepta la URL de Neon).
- `ERP_ENV=production`.
- `COOKIE_SECURE=true`.
- `ERP_ALLOWED_ORIGINS=https://aws-erp.vercel.app`.
- `DOCUMENT_STORAGE=database`.

El proveedor `database` conserva documentos y avatares privados en PostgreSQL;
no depende del disco temporal de las funciones. El almacenamiento local y S3
siguen disponibles para otros entornos. Respaldar también la tabla `stored_files`.

Antes de desplegar, aplicar las migraciones contra la base de destino desde
`Backend` con `python -m alembic upgrade head`. No se ejecutan migraciones ni
se crean cuentas automáticamente al importar la API. En una instalación nueva,
la pantalla inicial permite crear la cuenta administradora.

Para acceso con Google, configurar `GOOGLE_CLIENT_ID` y las políticas de acceso
documentadas en `acceso-con-google.md`, y autorizar el dominio HTTPS publicado
en la consola de Google. No incluir contraseñas ni archivos `.env` en el envío.

Los archivos mayores de 4 MB se transfieren en partes autenticadas de 2 MB
para respetar los límites de las funciones. Se conservan los límites de 10 MB
para documentos y 5 MB para fotos. Las partes temporales expiran tras una hora;
la siguiente carga retira las partes expiradas.

El despliegue no está completo hasta comprobar `/api/v1/ready`, creación/acceso
de administrador, operaciones, documentos y persistencia tras un nuevo despliegue.

## Reinicio desde la aplicación publicada

Un administrador puede entrar en **Administración → Empresa → Reiniciar datos comerciales**. El sistema prepara un respaldo JSON, muestra los registros afectados y exige descargarlo y escribir `BORRAR DATOS` antes de confirmar. El reinicio conserva cuentas, sesiones, empresa, auditoría y archivos privados. Si la información cambió después del respaldo, se rechaza la operación para preparar una copia actualizada. La eliminación se ejecuta en una transacción; no modifica el esquema ni requiere migraciones nuevas.
