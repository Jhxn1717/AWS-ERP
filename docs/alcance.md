# Alcance y trazabilidad del MVP

## Decisiones de experiencia

EnterpriseCloud se presenta como un espacio empresarial: navegación persistente, jerarquía tipográfica sobria, superficies blancas y acentos verde esmeralda sobre un menú oscuro. Los indicadores evitan porcentajes de crecimiento inventados: muestran valores reales de la base local. Los módulos comparten tablas, formularios, detalle, búsqueda y exportación. Los estados no dependen únicamente del color.

## Correspondencia con el documento maestro

| Área | Entregado | Siguiente fase |
|---|---|---|
| Dashboard | Ventas, compras, saldos, valorización, gráficos, alertas | Comparativos históricos, utilidad contable y rotación |
| Ventas | Registro con detalle, control de stock, estado de pago | Cotización, pedido, comprobantes, devoluciones y crédito |
| Compras | Registro de compra recibida y stock | Solicitud, aprobación, orden, recepción parcial y devolución |
| Inventario | Productos, categorías por texto, existencias, movimientos | Catálogo normalizado, múltiples almacenes, kardex valorizado y transferencias |
| Clientes / proveedores | Altas, edición, consulta y validaciones básicas | Contactos múltiples, historial y política de crédito |
| Finanzas | Pagos parciales/totales, CxC y CxP | Caja, bancos, conciliación y asientos contables |
| Documentos | Carga local, metadatos, categorías, búsqueda y descarga autenticada | S3, autorización documental granular, antivirus y URL firmada |
| Administración | Sesiones, seis roles, usuarios, estados, empresa y auditoría de negocio | Recuperación de cuentas, MFA, límites de acceso y auditoría inmutable |
| Reportes | CSV y ventas por cliente | Reportes de períodos, PDF, filtros y programación |
| Persistencia | SQLAlchemy, SQLite local, URL PostgreSQL configurable | Modelo normalizado, migraciones, respaldos y prueba PostgreSQL |
| AWS | Ruta de arquitectura documentada | Infraestructura desplegada y validada |

## Reglas aplicadas

1. Una venta necesita un cliente válido, un producto y una cantidad entera positiva.
2. Una venta no puede dejar stock negativo. Las líneas del mismo producto se consolidan.
3. Venta, cambio de stock, movimiento y auditoría se confirman en una sola transacción.
4. La compra de este MVP representa mercancía ya recibida; aumenta el stock inmediatamente.
5. Cada operación inicia pendiente. Un pago menor al saldo genera estado parcial; el pago completo la deja pagada.
6. No se puede pagar más del saldo ni crear importes negativos.
7. Los precios y costos proceden del catálogo del servidor. El navegador no define el total.
8. El SKU de un producto es único. El RUC es único dentro de cada tipo de contacto.
9. El ajuste de inventario exige motivo y cantidad distinta de cero; no puede dejar stock negativo.
10. Una operación nueva sin pagos puede anularse. La reversión de líneas, existencias y auditoría es transaccional. Los registros históricos sin líneas no se pueden revertir automáticamente.
11. Las sesiones expiran a las ocho horas y se invalidan si el usuario se desactiva. No se permite desactivar la cuenta propia.
12. Los roles limitan escrituras en el servidor; todos los usuarios autenticados comparten acceso de lectura a los módulos comerciales. La lista de usuarios solo es visible para administradores.
13. Las contraseñas se almacenan como hash PBKDF2-SHA256 con sal aleatoria; los tokens de sesión se almacenan como hash SHA256. No se exportan desde la API de workspace.

## Actualización de experiencia

Selector de tema junto al avatar y en la pantalla de acceso. El tema se aplica a tablas, gráficos, formularios, mensajes y paneles; se conserva en localStorage. Se respeta la preferencia inicial del sistema y la reducción de movimiento. Se verificaron visualmente el cambio de tema y su persistencia en una base de pruebas separada, sin crear usuarios en la base del proyecto.

## Ruta hacia AWS y producción

1. Normalizar usuarios, roles, permisos, contactos, ventas, detalles, compras, pagos, almacenes, inventarios y documentos; agregar claves foráneas, índices, restricciones y migraciones Alembic. Sustituir la inicialización automática por migraciones versionadas y un comando explícito de datos demo.
2. Implementar autenticación OIDC/Cognito o sesiones seguras, roles por operación, validación completa y auditoría con identidad verificable. Probar aislamiento, autorización y concurrencia contra PostgreSQL.
3. Provisionar VPC, subredes, grupos de seguridad, RDS PostgreSQL privado, S3 privado y backend en EC2 con IAM de mínimo privilegio. Gestionar secretos fuera del repositorio. Definir región y presupuesto antes de provisionar.
4. Publicar frontend detrás de HTTPS, configurar dominio, CORS restringido y proxy/API; separar desarrollo, pruebas y producción.
5. Añadir almacenamiento S3 con tipos/tamaños permitidos, autorización y URLs temporales. Los metadatos deben residir en PostgreSQL.
6. Configurar CI/CD con build, pruebas de integración, revisión de dependencias y migraciones controladas. Añadir respaldos RDS y ensayo de restauración.
7. Conectar logs y métricas a CloudWatch: latencia, errores, CPU, memoria y base de datos; configurar alarmas y retención.
8. Validar con el negocio impuestos, moneda, series, reglas de crédito, anulaciones y flujo de aprobación antes de habilitar operaciones reales.

## Criterio de aceptación de esta entrega

La aplicación debe arrancar localmente, mostrar los datos de la API, crear una venta con actualización de stock, rechazar stock insuficiente sin cambios parciales, registrar pagos sin exceder el saldo y permitir consulta de sus eventos. El build TypeScript y las pruebas de negocio deben pasar. Los módulos pendientes se presentan explícitamente como pendientes.


## Avance de arquitectura ? 17 de octubre de 2026

Esta secci?n actualiza la tabla hist?rica del MVP anterior:

- Modelos separados en `app/models.py`, con tablas relacionadas para contactos, operaciones, detalles, pagos, usuarios, sesiones y movimientos. Permanecen metadatos complementarios JSON y excepciones para registros hist?ricos sin relaciones.
- Migraciones Alembic versionadas, conversi?n de registros existentes y protecci?n de auditor?a contra UPDATE/DELETE ordinarios. La API comprueba la versi?n del esquema y no crea tablas ni carga datos demo al arrancar.
- Configuraci?n de producci?n que exige PostgreSQL, cookies seguras y or?genes HTTPS.
- Ejecucion directa con Python y Node.js; PostgreSQL nativo. CI con pruebas SQLite/PostgreSQL y build del frontend. El workflow remoto requiere verificacion en GitHub.
- Adaptador S3 para documentos, manteniendo descargas autenticadas y compatibilidad con documentos locales. La conexi?n real a AWS sigue pendiente.
- Readiness SQL, identificadores de solicitud y logs JSON de estado/duraci?n. CloudWatch y alarmas requieren despliegue.

Esto no acredita todav?a el producto final completo: faltan validaci?n real PostgreSQL/concurrencia, infraestructura AWS, despliegue, restauraci?n de respaldos, controles adicionales de seguridad y aceptaci?n de procesos empresariales pendientes. Para un proyecto de instituto, AWS puede presentarse como arquitectura preparada, indicando claramente qu? se ejecut? localmente y qu? queda como dise?o.

Instrucciones reproducibles en [instalaci?n y despliegue](instalacion-y-despliegue.md).
