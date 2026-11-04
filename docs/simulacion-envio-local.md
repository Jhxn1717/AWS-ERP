# Simulación de envío

La simulación se habilita en desarrollo y producción. Se identifica como demostración y no como GPS real. Su publicación en Vercel fue solicitada expresamente por el usuario.

## Preparar y probar

1. Abre `http://localhost:5173/` e inicia sesión en tu entorno local.
2. Abre una venta pendiente y entra a **Seguimiento**.
3. En **Asignar transporte** o **Editar transporte**, completa los datos del envío y la dirección de entrega con calle, número, distrito y ciudad. Al salir del campo, Photon busca en Perú y completa las coordenadas automáticamente. Si solo encuentra la calle, se indica que la referencia es aproximada; puedes revisar el mapa, elegir otra coincidencia o ajustar el punto manualmente. Una dirección sin coincidencias no se sustituye por el centro de la ciudad. Para un punto referencial en Surco puedes probar latitud `-12.150556` y longitud `-77.007778`.
4. Usa **Registrar ubicación** para el origen. Como punto referencial de Lima puedes usar latitud `-12.046667` y longitud `-77.032222`, e indicar que se trata de una prueba.
5. Pulsa **Pasar a preparando**, escribe el detalle y confirma. Tras guardarse correctamente el estado Preparando, aparece la simulación y comienza la animación del vehículo.
6. Usa **Pausar**, **Continuar**, **Reiniciar** y la velocidad **0.5×**, **1×** o **2×**. La duración de demostración es de 5 minutos a 1×.
7. Arrastra el mapa con el mouse o el dedo para explorar. El recorrido y el vehículo se desplazan junto al mapa sin detener la simulación. El zoom conserva el centro de la vista; **Ajustar** vuelve a mostrar toda la ruta. También puedes enfocar el mapa y usar las flechas, o Inicio para centrar.
8. Cierra y vuelve a abrir el detalle: el avance se recupera en pausa en la misma sesión del navegador. Si un pedido local ya estaba en Preparando o Despachado y tiene origen y destino, puedes pulsar **Iniciar simulación de envío**.

## Alcance

- La ruta se consulta a OSRM con perfil de conducción y geometría completa. La animación recorre sus tramos proporcionalmente a la distancia, gira en sus cruces y muestra la distancia del trazado. La velocidad de 5 minutos es demostrativa: no representa tráfico ni un tiempo de entrega real.
- La posición del vehículo es simulada y no se guarda como ubicación real ni evento de auditoría. El progreso se almacena únicamente en `sessionStorage`, separado por venta.
- El avance se detiene en el destino. No marca la venta como Entregada, ni la paga, ni modifica el stock. Las etapas siguen registrándose manualmente y en orden.
- Pasar a Preparando sí guarda el avance real de esa operación en la base local; iniciar o reiniciar la animación no crea nuevos avances de entrega.
- Editar la asignación o registrar una nueva ubicación descarta el recorrido simulado anterior, para preparar uno con los datos actualizados.
- El mapa utiliza teselas de OpenStreetMap con atribución visible y caché normal del navegador. Si el mapa base falla, el trazado y los controles siguen disponibles. No se descargan mapas completos ni áreas fuera de la vista.
- El origen y el destino se fijan al iniciar cada simulación y se ajustan a vías cercanas en un radio máximo de 250 metros. No hay GPS conectado ni envío de telemetría automática. El servicio OSRM recibe únicamente las coordenadas del recorrido, sin nombres, documentos ni datos de la venta.
- Si OSRM falla, no encuentra ruta o tarda más de 15 segundos, la animación no comienza y se muestra Reintentar ruta. No se dibuja una línea recta como sustituto. La ruta calculada se conserva en la sesión del navegador, sin consultar nuevamente al pausar o cambiar la velocidad.
- Las simulaciones de la primera versión, sin geometría de calles, se reinician para calcular la nueva ruta.
- Se admiten coordenadas de demostración dentro del rango representable del mapa (latitud entre -85 y 85; longitud entre -180 y 180). Las coordenadas del destino se validan por parejas también en la API.

Referencia del proveedor del mapa: [política de uso de teselas OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/).

## Comprobación

Hay pruebas sobre inicio y llegada, límites del avance, pausa, velocidad, encuadre, coordenadas inválidas y recuperación del progreso por pedido. Las pruebas de API comprueban que el destino se guarde y que no se acepte una sola coordenada o valores fuera del rango.

Servicio de rutas: [documentación de OSRM](https://project-osrm.org/docs/v5.24.0/api/). Verificación externa con los puntos de ejemplo Lima-Surco: respuesta Ok, 361 puntos de geometría y 13.53 km. Este resultado no implica GPS ni prueba visual de la pantalla.

Geocodificación local: [Photon](https://github.com/komoot/photon). Consultas al salir del campo, caché en memoria, cancelación al editar y límite de espera de 12 segundos. Solo se envía la dirección; los nombres y datos comerciales no se incluyen. Disponible en el despliegue completo de Nix.
