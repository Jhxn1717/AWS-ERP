# Entrar con Gmail o Google Workspace

El ERP integra Google Identity Services: el botón oficial abre el selector de cuentas y el backend verifica el token firmado antes de crear la sesión del ERP. No solicita contraseñas de Gmail ni acceso al buzón.

## Activar el botón

1. Entrar a [Google Cloud Console](https://console.cloud.google.com/) con la cuenta responsable y crear o seleccionar un proyecto.
2. Configurar Google Auth Platform / pantalla de consentimiento: nombre de la aplicación, correo de soporte y audiencia externa si se usa Gmail personal. Si el proyecto está en pruebas y Google pide usuarios de prueba, agregar el correo que utilizarás.
3. Crear un cliente OAuth de tipo **Aplicación web**. En **Orígenes de JavaScript autorizados**, agregar `http://localhost` y `http://localhost:5173`.
4. Copiar el **ID de cliente**, que termina en `.apps.googleusercontent.com`. Este flujo no necesita un secreto de cliente ni una URL de callback.
5. En `.env`, en la raíz del proyecto, guardar:

```dotenv
GOOGLE_CLIENT_ID=TU_ID.apps.googleusercontent.com
GOOGLE_ADMIN_EMAIL=tu-cuenta@gmail.com
GOOGLE_ALLOWED_EMAILS=
GOOGLE_ALLOW_SIGNUP=true
```

El correo de administrador ya quedó configurado en el `.env` local según lo indicado en la conversación. No se crea una cuenta ni se cambia una contraseña hasta que se verifica un inicio de sesión.

6. Instalar dependencias, migrar y reiniciar el backend:

```powershell
cd Backend
python -m pip install -r requirements.txt
python -m alembic upgrade head
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Reiniciar también Vite si estaba abierto, para aplicar las cabeceras de desarrollo. Abrir **http://localhost:5173**, con el mismo origen registrado en Google. No alternar entre `localhost` y `127.0.0.1` durante el acceso.

El identificador de cliente es público y puede compartirse para configurar la aplicación. No enviar contraseñas, códigos de recuperación ni secretos de cliente. La aplicación lee `.env` al arrancar y respeta las variables del entorno de despliegue.

## Quién obtiene acceso

La pantalla principal envía `intent=login`: solo permite cuentas existentes y nunca crea usuarios. La vista «Regístrate» envía `intent=register`: crea una cuenta autorizada y abre su sesión. Si la cuenta ya existe, devuelve un aviso para iniciar sesión, sin crear duplicados. El servidor aplica esta separación, incluso si se llama directamente a la API. Sin `intent`, la API asume inicio de sesión.

- Una cuenta del ERP existente y activa puede entrar con su mismo Gmail o correo verificado de Workspace. La primera vez queda vinculada al identificador estable de Google, sin cambiar su rol ni su contraseña local.
- Si la cuenta todavía no existe y su correo coincide exactamente con `GOOGLE_ADMIN_EMAIL`, se crea como administrador. Configurar esta variable solo para la persona autorizada. No promueve una cuenta existente que tenga otro rol.
- Los correos nuevos de `GOOGLE_ALLOWED_EMAILS` se crean con rol **Consulta**. El administrador puede cambiar después su rol en Administración. También puede crear previamente el usuario con el correo Google correspondiente.
- Cualquier otro correo nuevo se rechaza. Autenticarse con Google no concede automáticamente acceso a los datos de la empresa.
- Las cuentas desactivadas siguen bloqueadas. Cambiar el correo de una cuenta vinculada requiere revisar su vínculo Google; no se reasigna silenciosamente a otra identidad.

Solo se vinculan automáticamente correos para los que Google acredita control: Gmail o Workspace verificado. Una cuenta de Google creada usando un correo externo de otro proveedor no habilita la vinculación automática.

## Verificación y límites

La firma, emisor, destinatario y caducidad del ID token se verifican con `google-auth` y los certificados de Google. Un nonce de diez minutos, guardado como hash en la base y vinculado al navegador mediante cookie HttpOnly, impide reutilizar el intento de acceso. La API verifica también el origen del POST. Los tokens Google no se guardan en la base ni en localStorage; se usa la sesión privada del ERP de ocho horas.

La migración `0004` añade `google_identities` y `google_challenges`. Se probaron los flujos con credenciales sustituidas y la validación criptográfica con tokens RSA de prueba. El acceso real con Google requiere completar el ID de cliente y comprobarlo en el navegador: no se ha simulado una autorización real.

En producción, registrar el dominio HTTPS real, configurar `ERP_ALLOWED_ORIGINS` y `COOKIE_SECURE=true`, y revisar las cabeceras/CSP según la guía oficial. Las políticas de Google o del administrador Workspace pueden limitar las cuentas autorizadas.

Referencias oficiales: [configuración de Google Identity Services](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [verificación en el servidor](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).
