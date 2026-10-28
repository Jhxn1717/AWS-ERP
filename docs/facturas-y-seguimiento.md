# Demostrar el circuito del ERP

1. Configurar la empresa desde Empresa y registrar un proveedor con RUC y un cliente con RUC o DNI. El documento del cliente determina factura o boleta.
2. Registrar un producto. Recibir una compra con ese producto y comprobar la entrada de existencias.
3. Abrir Facturas y seguimiento, seleccionar la compra y registrar el número de factura del proveedor, vencimiento e impuesto incluido. Revisar y confirmar.
4. Crear una cotización desde Cotizaciones, con vigencia, entrega prevista y plazo de pago. Comprobar que el stock y las cuentas por cobrar no cambian. Abrir la propuesta y confirmar el pedido: se crea una venta con los precios acordados y se descuentan las existencias. El botón Abrir pedido lleva directamente a su seguimiento. También se permite registrar una venta directa.
5. En Facturas y seguimiento, abrir la venta y registrar su comprobante interno (factura con RUC o boleta con DNI). En una venta directa se genera al confirmar. Descargar el PDF con productos, base, impuesto, total y saldo.
6. Registrar un pago parcial desde el detalle. Confirmarlo y comprobar el saldo en Cuentas por cobrar y en el historial.
7. Actualizar la entrega: Preparando → Despachado → Entregado. Cada paso requiere una observación y confirmación.
8. Registrar el pago restante. La operación queda pagada; el estado de entrega sigue siendo independiente.
9. Abrir Dashboard y seleccionar el mes de las operaciones: comprobar ventas, compras, cobros, pagos, flujo neto y productos más vendidos. Los saldos y las alertas de vencimiento son acumulados.

## Reglas del circuito

- Las cotizaciones abiertas no forman parte de las ventas ni de los saldos. Las vencidas y rechazadas no se pueden confirmar.
- Emitir la factura no vuelve a afectar el stock; el movimiento ocurre al confirmar la venta o recibir la compra.
- El precio registrado es final. El impuesto se desglosa dentro de ese total, sin recargarlo.
- Una factura por operación. Los datos del emisor, contacto y productos quedan conservados al emitir.
- No se puede facturar una operación anulada ni avanzar entregas fuera de secuencia.
- No se puede pagar más del saldo ni anular una operación que ya tiene pagos.
- La anulación conserva los registros y revierte las existencias, cuando hay stock suficiente para revertir la compra.
- Los permisos se comprueban en el servidor: Consulta no puede emitir, pagar ni actualizar entregas.

## Alcance real

Este circuito sirve para gestión comercial interna y demostración académica. La facturación electrónica SUNAT, contabilidad de partida doble, declaraciones tributarias, notas de crédito, devoluciones, nómina y múltiples almacenes requieren módulos adicionales. No se declara el sistema certificado para esos usos.

Los cambios de esta versión se entregan en el código local. Publicar el frontend y el backend es necesario para que aparezcan en la aplicación alojada.

## Cobro con tarjeta o Yape

En una venta directa, activar **Registrar el cobro de esta venta ahora** para elegir Efectivo, Tarjeta, Yape, Plin o Transferencia, con referencia opcional. Al confirmar se guardan la venta, el movimiento de stock, el comprobante y el cobro en una sola transacción. Si no se activa, el saldo queda pendiente y el método se elige al registrar cada cobro parcial. El historial y el PDF muestran los métodos y referencias.
