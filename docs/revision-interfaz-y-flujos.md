# Revisión de interfaz y flujos — 28 de octubre de 2026

## Correcciones aplicadas

- Formularios, detalles comerciales y confirmaciones usan un diálogo compartido. Sus dimensiones no crecen con los productos ni el historial: el contenido se desplaza dentro de la ventana y el encabezado permanece visible.
- Límites de escritorio: formularios 620 × 660, detalles 680 × 660 y confirmaciones 440 × 310 píxeles, reducidos al espacio disponible en la pantalla. Los selectores, la vista de exportación y las fotos también conservan límites.
- Las áreas de texto no se pueden redimensionar. Los productos y los eventos tienen áreas de desplazamiento acotadas. Los textos largos no amplían el modal.
- Cerrar un formulario modificado exige confirmar el descarte. Durante el guardado se bloquea el cierre. Escape en un selector no cierra el formulario principal.
- La edición de registros y los ajustes de inventario incluyen una confirmación antes de guardar. No se puede cambiar de sección en una edición que tiene cambios pendientes.
- Abrir una venta o compra desde una tabla lleva al mismo detalle comercial usado en Seguimiento. Los indicadores de facturas corresponden al filtro de ventas o compras elegido.
- El historial mezcla emisión, cobros, pagos, preparación y entrega según sus fechas reales. Las fechas se presentan con la zona horaria de Lima.
- Las operaciones anuladas muestran saldo exigible cero. Una venta despachada o entregada no se puede anular con una simple reversión de inventario; el servidor también lo impide.
- Un estado de entrega desconocido devuelve un conflicto controlado y no un error interno del servidor.
- Las facturas PDF ajustan nombres y direcciones largos y reservan espacio para el pie de página. Las operaciones históricas sin referencia no rompen el dashboard.

## Verificación

- Backend: 44 pruebas correctas, incluidos permisos, Google, inventario, cotizaciones, facturas, pagos y restricciones de anulación.
- Frontend: 16 pruebas correctas, incluidos pendientes, saldos anulados e historial cronológico.
- Se comprobaron las respuestas del frontend local y de la API en el puerto 5174.
- La inspección visual directa en Edge quedó limitada por la herramienta de control del navegador. Las comprobaciones de código y pruebas no sustituyen una revisión visual en distintos tamaños de pantalla.
