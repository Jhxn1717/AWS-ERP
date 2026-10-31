# Nix

Sistema de gestión comercial para una empresa que vende productos y administra su almacén en Perú. El alcance conecta clientes, proveedores, cotizaciones, ventas, compras, inventario, comprobantes y pagos. Los reportes se calculan con los registros del sistema.

## Procesos y reglas

| Proceso | Resultado | Control de negocio |
| --- | --- | --- |
| Importar CSV | Crea productos, clientes o proveedores | Detecta el contenido, presenta una vista previa y guarda el lote completo. Un error o duplicado impide toda la carga. |
| Cotizar | Guarda una propuesta con vigencia y precios acordados | No descuenta stock ni crea una deuda. |
| Confirmar una cotización | Crea una venta y descuenta existencias | Valida vigencia y stock; solo permite convertir la propuesta una vez. Conserva los precios cotizados. |
| Registrar una venta | Genera la operación, salida de stock y comprobante interno | Cliente con RUC: factura. Cliente con DNI: boleta. No admite existencias negativas. |
| Registrar una compra recibida | Aumenta las existencias y genera el saldo al proveedor | Las compras representan mercadería ya recibida; no son órdenes futuras de abastecimiento. |
| Cobrar o pagar | Crea un movimiento financiero vinculado a una operación | Método obligatorio, importe positivo y no superior al saldo. Admite pagos parciales y referencias independientes. |
| Consultar un pago | Muestra su constancia y el comprobante de la operación | Distingue el comprobante de pago CP de la factura o boleta. |
| Despachar y entregar | Registra el avance y una observación | Preparación, despacho y entrega siguen etapas consecutivas. El estado de entrega es independiente del estado de pago. |
| Anular una operación | Revierte las existencias y conserva el registro anulado | Impide anular operaciones cobradas o ventas ya despachadas; esos casos requieren un proceso de devolución o reembolso. |
| Ajustar inventario | Registra la variación y el motivo | Comprueba existencias finales y conserva el movimiento de auditoría. |
| Reiniciar datos comerciales | Deja el espacio listo para una nueva carga CSV | Solo administrador; exige respaldo y confirmación. Verifica que no existan cambios posteriores al respaldo y registra el reinicio en auditoría. |

## Identidad y experiencia

El nombre del producto es **Nix**. La empresa que lo utiliza conserva su propia razón social y RUC; no se reemplazan por el nombre del software. Los modales mantienen dimensiones limitadas y desplazan el contenido interior. Las consultas de operaciones conservan el módulo desde el que se abrieron.

El dashboard prioriza cuatro indicadores, un gráfico y cinco tareas pendientes. La agenda completa y los análisis adicionales se consultan por separado para evitar una página inicial excesivamente larga.

## Administración y despliegue

El acceso se controla mediante sesiones y roles en el servidor. Los permisos de lectura o escritura no dependen únicamente de que un botón aparezca en la interfaz. Los datos comerciales y sus relaciones se guardan en la base; los archivos privados requieren una sesión autorizada.

En Vercel, el reinicio se utiliza desde **Administración → Empresa → Reiniciar datos comerciales**. No requiere una terminal. El respaldo descargado contiene registros y referencias de documentos; los archivos adjuntos siguen en su almacenamiento privado y no se incluyen dentro de ese JSON. La recuperación del respaldo es una tarea técnica, no una función automática de importación CSV.

## Límites que deben quedar claros en la presentación

Los comprobantes son internos: el proyecto no está integrado con SUNAT. Las compras no implementan aprobación, recepción parcial ni múltiples almacenes. Tampoco hay un libro contable, conciliación bancaria o proceso completo de devoluciones y reembolsos. Estas funciones requieren desarrollos propios; no deben presentarse como terminadas.

El criterio de calidad es que los procesos incluidos sean consistentes, verificables y trazables. Añadir un módulo al menú sin completar sus efectos en inventario, documentos y saldos no amplía por sí solo el alcance funcional.
