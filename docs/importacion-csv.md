# Carga inicial para la presentación

El ERP inicia sin productos, clientes, proveedores ni operaciones precargadas. Los usuarios, los datos de la empresa y el historial de auditoría protegido se conservan.

Hay tres archivos de ejemplo con **5 registros ficticios cada uno** en `Frontend/public/samples/`:

- `productos-5.csv`: productos, precios en PEN y stock inicial.
- `clientes-5.csv`: dos clientes con RUC y tres con DNI; conserva los ceros iniciales.
- `proveedores-5.csv`: cinco proveedores con RUC.

## Importar desde la aplicación

1. Inicia sesión con una cuenta de **Administrador**.
2. Abre **Administración → Importaciones**. Las cargas CSV se agrupan en Inventario (productos), Clientes y Proveedores; no aparecen en el dashboard ni en los catálogos.
3. Descarga la plantilla del módulo y pulsa **Importar productos**, **Importar clientes** o **Importar proveedores**.
4. Selecciona el archivo. Nix reconoce automáticamente su tipo, comprueba que corresponda al módulo elegido y muestra la vista previa. El modal no incluye un selector de tipos.
5. Revisa la tabla y pulsa **Confirmar importación**.

El servidor restringe tanto la vista previa como la carga a administradores, incluidas las rutas anteriores de importación. Los otros perfiles conservan sus permisos habituales para las operaciones individuales de sus módulos.

La vista previa no guarda datos. La confirmación vuelve a validar el archivo y guarda todos los registros en una sola transacción. Los identificadores repetidos, documentos inválidos o importes incorrectos detienen toda la carga. Importar productos con stock inicial también registra su movimiento de inventario.

Formato: UTF-8, con o sin BOM, separado por coma o punto y coma. Máximo 1 MB y 500 registros. Para importes decimales se admite punto; con separador de punto y coma también se admite coma decimal.

Cabecera de productos: `nombre,sku,categoria,precio,costo,stock,stock_minimo`.

Cabecera de clientes y proveedores: `tipo_registro,nombre,tipo_documento,documento,correo,telefono`. La columna `tipo_registro` contiene `clientes` o `proveedores` en todas las filas. Permite reconocer el contenido incluso si renombras el archivo. Los CSV anteriores sin esa columna siguen siendo reconocidos si su nombre incluye `clientes` o `proveedores`. Si no existe información para distinguirlos, se muestra un error en lugar de importar en el catálogo equivocado.

También se admiten las columnas opcionales `direccion` y `persona_contacto`. El paquete `Frontend/public/samples/prueba-completa/` incluye cinco registros completos de cada catálogo y una guía para probar ventas con RUC y DNI, crédito, pagos parciales y reposición. Los registros son ficticios.

Después de cargar los archivos, crea ventas y compras desde sus módulos. La carga CSV corresponde a los catálogos; no inventa facturas, pagos ni operaciones comerciales.

## Reiniciar una presentación local

Desde **Administración → Vaciar datos**, prepara y descarga el respaldo, escribe BORRAR DATOS y confirma con la contraseña de tu cuenta de Nix. Después, el botón **Ir a Importaciones** abre las cargas por módulo.

Como alternativa técnica en desarrollo, desde `Backend`, ejecuta `python -m app.reset_demo --confirm` únicamente si deseas vaciar los datos comerciales de nuevo. Antes de borrar, el comando crea y verifica una copia SQLite en `output/backups/`. Conserva usuarios, sesiones, identidad de Google, empresa y auditoría. Solo funciona con SQLite en desarrollo dentro de `Backend`; no permite reiniciar una base de producción.

Las migraciones y el arranque de la API no cargan datos ficticios. `python -m app.seed` sigue siendo una herramienta explícita para pruebas antiguas, y no debe ejecutarse para la presentación vacía.
