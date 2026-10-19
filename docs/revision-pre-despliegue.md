# Revisión previa al despliegue — 19 de octubre de 2026

Alcance: ERP del instituto, con ejecución directa y sin contenedores.

## Correcciones

- Corrección posterior: el enlace `#administracion` no coincidía con el nombre acentuado del módulo. Las rutas ahora comparten normalización y cuentan con cuatro pruebas de regresión, incluidas en CI.

- Validación de nombres, SKU, categorías, empresa, usuarios y motivos después de retirar espacios exteriores. Las contraseñas mantienen su contenido exacto y se rechazan si contienen solo espacios.
- RUC de once dígitos ASCII, consistente con los formularios.
- Cantidades enteras, límites de existencias y límites de importe. Las cantidades repetidas de un producto se validan después de consolidarse.
- Compras con total cero quedan saldadas; no generan una cuenta imposible de pagar.
- Desactivar una cuenta revoca sus sesiones anteriores, incluso si posteriormente se reactiva.
- Filtro de inventario activo y reporte por cliente asociado mediante ID, conservando la alternativa por nombre para datos históricos.
- Mensajes cuando faltan contactos, productos o cuentas pendientes. El formulario de pago limita el importe al saldo seleccionado.
- Manejo de errores de conexión, respuestas inesperadas y campos rechazados por la API. Una sesión vencida retira los datos de la cuenta de la interfaz.
- Restauración del módulo al recargar o navegar por el historial. El mes inicial del dashboard corresponde al mes actual de Lima.
- Registro con Google oculto cuando Google no está configurado o se está creando el administrador inicial.
- Documentación de migraciones y datos demo corregida para describir el funcionamiento actual.

## Verificación

Las pruebas automatizadas usan datos temporales. No se modificó la base local de la empresa para probar operaciones.

- `python -m unittest discover -s tests -v`: 34 pruebas correctas.
- Tras añadir la protección del límite de stock al anular, se volvió a ejecutar `test_numeric_limits_and_zero_cost_purchase`: correcto.
- `npm run build`: correcto. Permanece una advertencia de tamaño en archivos de exportación; no impide compilar.
- Seis comprobaciones de renderizado React correctas: formularios sin cliente, proveedor, producto o cuenta pendiente, límite de stock y límite de pago. Se ejecutaron en Node.js; no sustituyen una prueba interactiva en navegador.
- Dependencias reinstaladas con `npm ci --no-audit --no-fund`; la instalación anterior incompleta se conservó en `tmp/frontend-dependencies-*`.
- El workflow remoto de GitHub Actions no se ejecutó desde esta sesión.

## Comprobaciones pendientes en el entorno de destino

- Revisión visual en escritorio y móvil, incluyendo formularios, modales, navegación y descarga de reportes. No hay un navegador disponible mediante las herramientas de esta sesión.
- PostgreSQL real, migraciones, concurrencia y restauración de respaldos. No se encontró una instalación local utilizable de PostgreSQL.
- Inicio real con Google: requiere configuración válida del cliente y del origen publicado; las pruebas automatizadas usan identidades de prueba.
- HTTPS, variables de producción, servicio de Uvicorn, Nginx y permisos del directorio persistente en el servidor elegido.

Las preferencias de correo se guardan, pero no hay proveedor de envío conectado. Impuestos, comprobantes fiscales, múltiples almacenes y otros módulos declarados fuera del alcance continúan fuera de esta entrega. Esta revisión no certifica ausencia total de errores ni un despliegue de producción.
