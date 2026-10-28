# EnterpriseCloud ERP

ERP basado en el Documento Maestro del Sistema Empresarial (2026). Interfaz en español, React + TypeScript, API FastAPI y SQLAlchemy. Incluye sesiones, roles, documentos y operaciones transaccionales. La conexión AWS y la validación contable/fiscal requieren una fase de implementación y aceptación independiente.

## Aplicación publicada

**ERP en línea:** https://aws-erp.vercel.app — requiere una cuenta autorizada.

- **Frontend:** React + TypeScript, compilado con Vite y ejecutado en el navegador.
- **Backend:** Python + FastAPI, ejecutado como una función serverless en Vercel.
- **Base de datos:** PostgreSQL alojado en Neon.
- **Archivos:** documentos y fotos privados almacenados en PostgreSQL; la API controla su acceso.

Frontend y backend comparten dominio. Vercel dirige `/api/` a FastAPI y sirve la interfaz para las demás rutas. El navegador consulta la API; las credenciales de PostgreSQL permanecen en el servidor.

Consultar [despliegue en Vercel](docs/vercel.md) para variables de entorno, migraciones y configuración de Google. El repositorio no incluye credenciales, sesiones, bases de datos ni archivos de usuarios. Los datos de la presentación están en la base publicada y no se descargan al clonar el código.

## Cómo está organizado

- **[Backend](Backend/README.md)**: API en Python, reglas del ERP, acceso a datos, sesiones, permisos y archivos.
- **[Frontend](Frontend/README.md)**: pantallas en React + TypeScript, formularios, navegación y estilos.
- **[Guía para aprender tu código](docs/guia-del-codigo.md)**: recorrido por los archivos y explicación de una operación de principio a fin.
- `docs/`: documentación compartida y capturas del proyecto.
- `tmp/`: archivos temporales e históricos del desarrollo; no son necesarios para iniciar el ERP.

## Ejecutar

Requisitos: Node.js 20+, Python 3.11+.

Terminal 1:

```powershell
cd Backend
python -m pip install -r requirements.txt
python -m alembic upgrade head
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Terminal 2:

```powershell
cd Frontend
npm ci
npm run dev
```

Abrir http://127.0.0.1:5173. Documentación interactiva de la API: http://127.0.0.1:8000/docs.

En el primer acceso, crear la cuenta administradora con nombre, correo y una contraseña de al menos 12 caracteres. No hay credenciales predeterminadas. Las siguientes visitas requieren iniciar sesión. El botón de luna/sol junto al avatar cambia el tema; la preferencia se conserva en este navegador.

## Funciones implementadas

- Dashboard con indicadores calculados, gráficos, filtro de período y alertas de stock.
- Clientes con RUC de 11 dígitos o DNI de 8 dígitos; proveedores con RUC. Alta, edición, búsqueda y detalle.
- Productos: alta, SKU único, precio, costo, existencias y mínimo.
- Ventas con múltiples productos: validación de stock, descuento transaccional y auditoría.
- Compras recibidas: incremento transaccional de existencias.
- Pagos parciales y totales, validación del saldo, cuentas por cobrar/pagar.
- Movimientos de inventario, historial de auditoría y reportes CSV.
- Datos persistentes en el servidor; carga inicial mediante CSV, sin registros comerciales precargados.
- Diseño adaptable a escritorio, tablet y móvil.
- Modo nocturno completo y persistente, con preferencia inicial del sistema.
- Edición de contactos y productos, ajustes de inventario con motivo y rechazo de stock negativo.
- Anulación de operaciones sin pagos: revierte las existencias y conserva el historial.
- Carga documental hasta 10 MB, categorías, búsqueda y descarga autenticada.
- Administración de empresa, usuarios y seis roles con permisos de escritura controlados en el servidor.
- Contraseñas con PBKDF2-SHA256, sesiones de ocho horas, cookie HttpOnly/SameSite y cierre de sesión.
- Panel administrativo con resumen de accesos, búsqueda de usuarios, edición de roles, matriz de permisos, sesiones activas y revocación de sesiones de terceros.
- Perfil personal inspirado en la estructura de AWS: menú de cuenta, pestañas, temas de página, edición de datos personales y laborales, avatar por color, preferencias de correo y exportación de datos propios.

## Documentos de clientes y métodos de pago

Los clientes pueden registrarse y editarse con RUC de 11 dígitos o DNI de 8 dígitos. El formulario cambia entre razón social y nombres y apellidos. Los proveedores conservan el requisito de RUC. Los contactos anteriores se reconocen como RUC sin modificar sus datos.

La venta directa genera un comprobante interno al confirmarse: factura para RUC y boleta para DNI. El servidor determina el tipo y conserva el documento del cliente con la venta; editarlo después no cambia las operaciones ni comprobantes anteriores. Los pedidos derivados de cotizaciones pueden emitir el comprobante desde su detalle. Los PDF y el seguimiento identifican el tipo correspondiente.

Al confirmar una venta puede registrarse también su cobro total. Si queda pendiente, se pueden registrar cobros parciales posteriores. Cada cobro o pago guarda su propio método: Efectivo, Tarjeta, Yape, Plin o Transferencia, y una referencia opcional. La opción registra la operación en el ERP; no procesa cargos en tarjetas ni transferencias en las billeteras. Los pagos históricos sin método se muestran como no especificados.

Estos comprobantes siguen siendo internos, sin emisión electrónica SUNAT. No se requiere migración de esquema: el número del documento sigue en el campo existente y el tipo, las identidades de la venta y los datos de pago usan los metadatos persistentes de los registros.

## Cotizaciones y pedidos

El dashboard comienza con **Todo lo pendiente**: cotizaciones por resolver, operaciones sin factura, cobros, pagos a proveedores, pedidos por preparar, despachos, entregas y productos por reponer. Las tarjetas filtran una agenda completa con búsqueda, prioridad, fecha, saldo y acceso directo al registro; la lista incluye paginación y un gráfico por área. Los pendientes son acumulados y no se ocultan al cambiar el mes de análisis. Las operaciones anuladas se excluyen; una misma operación puede necesitar varias acciones. La exportación del dashboard incluye esta agenda.

El módulo Cotizaciones registra propuestas con cliente, productos, vigencia, entrega prevista, plazo de pago y observaciones. La propuesta no modifica existencias ni genera deuda. Confirmarla crea una sola venta, valida el stock y conserva los precios cotizados aunque el catálogo haya cambiado. Una propuesta vencida o rechazada no se puede convertir. Si falta stock, no se crea la venta ni se modifica la cotización.

Ventas incorpora un panel por etapas: Confirmados, En preparación, Despachados y Entregados. Cada pedido abre directamente su detalle de factura, pagos y seguimiento. La factura propone el vencimiento según el plazo acordado y muestra la cotización de origen. Las ventas directas siguen disponibles para confirmar una operación sin propuesta previa.

## Facturas y seguimiento

Abrir `#facturas-y-seguimiento`. Cada venta o compra puede tener una factura interna con detalle de productos, datos de la empresa y del contacto guardados al emitir, impuesto incluido (18 % o 0 %), vencimiento y descarga PDF. Las compras requieren el número del comprobante del proveedor. La emisión no vuelve a mover existencias ni cambia el total original. No se permite emitir una segunda factura para la misma operación ni editar los datos emitidos.

El detalle reúne pagos parciales, saldo, factura y seguimiento de entrega. Las ventas avanzan de Pendiente a Preparando, Despachado y Entregado, con observaciones obligatorias. Las compras se registran ya recibidas. Las anulaciones conservan el historial y se identifican en el PDF. Los permisos de ventas y compras controlan la emisión y el seguimiento; los permisos de finanzas controlan los pagos.

El dashboard incorpora cobros, pagos y flujo neto del período, saldo vencido acumulado, antigüedad de cuentas por cobrar y productos más vendidos. Las deudas sin factura se muestran como operaciones por facturar y no tienen un vencimiento asignado. El registro de operaciones y pagos incluye un paso de confirmación antes de guardar.

Estos comprobantes son internos; no sustituyen la facturación electrónica SUNAT. Ver [guía de demostración](docs/facturas-y-seguimiento.md).

## Mi perfil

Acceder desde el avatar superior → Ver mi perfil o mediante `http://127.0.0.1:5173/#mi-perfil`. Está disponible para todos los roles. Cada usuario solo puede modificar su propia información personal; esta API no permite cambiar correo de acceso, rol ni estado. La edición del correo se realiza desde Administración. La opción Administración se mantiene únicamente en el menú de módulos, y solo para administradores; se eliminó la cuenta duplicada del pie del menú lateral.

Las preferencias de correo se guardan; el envío requiere un proveedor externo que todavía no está conectado. El perfil es privado dentro del workspace; en el despliegue en línea requiere autenticación. La descarga JSON incluye datos de la cuenta y preferencias, sin contraseñas ni tokens de sesión.

La foto de perfil admite JPG, PNG y WebP de hasta 5 MB y 16 megapíxeles. El servidor valida el contenido, corrige la orientación, elimina metadatos y genera una imagen PNG de hasta 512 × 512 píxeles. Se almacena en `Backend/uploads/avatars` y solo se entrega al propietario o a un administrador autenticado. Al cambiar o quitar la foto se retira la imagen anterior. Las iniciales y su color quedan como alternativa cuando no hay foto. La carga se guarda al seleccionar el archivo, independientemente de los cambios pendientes en los demás campos del perfil.

## Panel administrativo

Abrir `http://127.0.0.1:5173/#administracion` con una cuenta administradora. El menú y el panel solo se muestran al rol Administrador. Los demás roles son redirigidos al dashboard si intentan abrir esa URL. El backend deniega métricas administrativas, usuarios y sesiones; la auditoría tampoco se entrega a otros roles ni aparece en sus reportes. Cambiar el rol de una cuenta revoca sus sesiones; se impide retirar el rol administrador a la cuenta propia o desactivarla.

Para configurar o recuperar una cuenta administradora desde el equipo local:

```powershell
cd Backend
python -m app.manage set-admin --email correo@empresa.com --name Administrador
```

La contraseña se solicita mediante entrada oculta. Este comando configura el rol y estado, conserva los datos del ERP y revoca las sesiones anteriores de esa cuenta. No guardar contraseñas en comandos, documentación ni archivos de configuración.

## Datos y límites

Las migraciones crean el esquema en `Backend/enterprisecloud.db` por defecto. Los datos ficticios se cargan opcionalmente con `python -m app.seed`. Los datos demo no reconstruyen un historial completo; las operaciones nuevas generan sus movimientos. El dashboard abre el mes actual de Lima y permite elegir otro mes. Los saldos pendientes son acumulados y excluyen anulaciones. Los importes son finales en PEN, sin emision fiscal ni costeo contable.

La API debe escuchar en loopback en esta configuración local. Los usuarios autenticados comparten lectura de información empresarial; el rol determina las operaciones de escritura. El rol Consulta no puede modificar registros. Administración de empresa y usuarios es exclusiva del administrador. La auditoría registra operaciones correctas e inicios de sesión y no es un registro inmutable.

Los documentos se guardan con nombres internos aleatorios en `Backend/uploads`; sus metadatos se persisten en la base de datos. Los formatos permitidos son PDF, PNG, JPG, XLSX, DOCX, CSV y TXT. No hay conexión S3 activa ni escaneo antivirus. Respaldar la base y el directorio de archivos juntos.

Para un entorno de producción, configurar HTTPS, `COOKIE_SECURE=true`, `ERP_ALLOWED_ORIGINS` (orígenes separados por comas), protección frente a intentos repetidos de acceso, recuperación de cuentas, migraciones y pruebas de concurrencia en PostgreSQL. No se implementan todavía pedidos por aprobación, devoluciones, múltiples almacenes, conciliación bancaria ni comprobantes fiscales. El despliegue en Vercel permite acceder por HTTPS y exige autenticación para los datos empresariales.

## PostgreSQL

SQLAlchemy admite PostgreSQL mediante `psycopg`. Crear una base de datos vacía y configurar, antes de arrancar:

```powershell
$env:DATABASE_URL='postgresql+psycopg://USUARIO:CLAVE@localhost:5432/enterprisecloud'
```

Aplicar `python -m alembic upgrade head` desde `Backend` antes de arrancar. Los modelos relacionales y metadatos complementarios se describen en `docs/instalacion-y-despliegue.md`. PostgreSQL requiere validacion en el entorno de destino.

## Verificar

```powershell
cd Frontend
npm run build
```

```powershell
cd Backend
python -m unittest discover -s tests -v
```

Las pruebas usan una base temporal y no cambian la base de demostración.

## Arquitectura y siguientes fases

Consultar [alcance y plan](docs/alcance.md). Sin despliegue ni recursos con costo creados en AWS.

## Acceso con Google

El inicio con Gmail/Workspace está implementado y requiere configurar un ID de cliente web de Google. Consultar [activación y permisos](docs/acceso-con-google.md).


## Importación CSV para presentación

En Inventario, Clientes y Proveedores, usa **Importar CSV** para revisar y confirmar una carga completa. Cada modal permite descargar un ejemplo con cinco registros. Ver [la guía de importación](docs/importacion-csv.md) para el formato y el reinicio local con respaldo.
