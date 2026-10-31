# Seguimiento y logística

El módulo reúne las entregas de las ventas confirmadas. Las compras se registran ya recibidas y conservan su historial en Compras. La entrega y el cobro tienen estados independientes: una venta pagada puede seguir pendiente de entrega.

## Uso

1. Registra una venta y abre **Seguimiento y logística** o su botón **Seguimiento**.
2. Abre **Rastrear** y asigna transportista, conductor, teléfono, placa, origen, dirección de entrega y fecha prevista. Puedes añadir una referencia de despacho; no sustituye una guía de remisión oficial.
3. Avanza en orden: Pendiente → Preparando → Despachado → Entregado. Registra el detalle del avance y, al entregar, el receptor y la constancia en el reporte.
4. Usa **Registrar ubicación** para guardar la latitud y longitud comunicadas por el conductor. El mapa muestra la última posición reportada, con su fecha, hora y responsable.
5. Reporta incidencias y resuélvelas indicando la solución. El historial conserva ambos eventos.

Las fechas reprogramadas y las incidencias abiertas alimentan los pendientes del dashboard. Los filtros distinguen entregas activas, etapas, atrasos e incidencias. Los atrasos se calculan según la fecha prevista en Perú.

## Reglas y alcance

- Administrador, Comercial y Almacén pueden actualizar entregas. El permiso de Almacén no habilita la creación de ventas ni la emisión de facturas.
- La información logística no modifica importes, pagos, comprobantes ni existencias.
- Una entrega cerrada conserva su asignación y ubicaciones; todavía permite resolver incidencias abiertas. Una venta anulada conserva el historial y no admite actualizaciones.
- El rastreo actual utiliza reportes manuales. No existe conexión a dispositivos GPS, telemetría automática, cálculo de ruta o ubicación en tiempo real.
- El mapa integrado usa OpenStreetMap y necesita conexión a Internet. No aparecen ubicaciones inventadas cuando un pedido no tiene reportes. Referencia: [mapas integrados de OpenStreetMap](https://wiki.openstreetmap.org/wiki/Export).
- Cada entrega admite hasta 2000 eventos logísticos. La asignación y los eventos se almacenan junto con la venta, con fecha y usuario, y se registran también en auditoría.

La imagen `output/seguimiento-logistica-nix.png` corresponde a una revisión temporal de interfaz con datos ficticios. Esos registros no se cargaron en la base de datos del usuario.
