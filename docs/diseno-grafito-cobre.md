# Nix · Grafito y cobre

Diseño basado en la propuesta visual n.º 3 elegida por el usuario.

| Uso | Color claro |
| --- | --- |
| Fondo | `#F8F7F4` |
| Superficie | `#FFFEFC` |
| Menú lateral | `#F1EFEA` |
| Títulos | `#242723` |
| Texto secundario | `#6F736B` |
| Acción principal | `#A8522D` |
| Selección | `#F2E5DC` |
| Borde | `#E3E1DB` |

La paleta común está en `Frontend/src/nix-theme.css`, cargada después de los estilos de componentes. Incluye variantes claras y oscuras para las superficies, los campos, las selecciones y los estados. Las preferencias de tema ya guardadas se conservan; una instalación sin preferencia comienza en modo claro.

El color cobre identifica acciones y navegación. Los estados conservan su significado: verde para éxito, ámbar para atención y rojo para errores. Los avatares personalizados conservan la elección de su usuario.

El login comparte los colores del sistema. El botón oficial de Google se adapta al ancho del formulario con `ResizeObserver`, sin reinicializar el desafío de autenticación en cada cambio de tamaño. El diseño respeta la preferencia de movimiento reducido.

Los modales conservan su altura limitada y el desplazamiento interno. Los reportes PDF, Excel y sus vistas previas utilizan grafito y cobre.

Las capturas `output/nix-cobre-dashboard.png` y `output/nix-cobre-venta.png` se obtuvieron de una vista temporal con datos ficticios y escrituras deshabilitadas. La captura `output/nix-cobre-login.png` muestra el acceso local real.
