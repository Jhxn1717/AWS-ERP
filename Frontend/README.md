# Frontend: lo que ves y utilizas

Esta carpeta contiene la interfaz en React + TypeScript. Su nombre es `Frontend`, tal como se solicitó; el término técnico habitual para esta parte es frontend.

## Archivos para empezar

| Archivo | Qué hace |
|---|---|
| `index.html` | Página inicial que carga el código de React. |
| `src/main.tsx` | Monta React y contiene la navegación, el dashboard, las tablas y los formularios principales. |
| `src/WorkspacePanels.tsx` | Pantalla de acceso, documentos, edición de registros, tipos compartidos y función `request` para llamar a la API. |
| `src/AdminPanel.tsx` | Pantalla administrativa de usuarios, roles, sesiones, empresa y auditoría. |
| `src/UserProfile.tsx` | Menú del avatar, perfil, foto y preferencias personales. |
| `src/styles.css` | Estilos generales de la aplicación. |
| `src/workspace.css` | Tema nocturno, ajustes del espacio de trabajo y navegación agrupada. |
| `src/admin.css` | Estilos del panel administrativo. |
| `src/profile.css` | Estilos del perfil y los avatares. |
| `vite.config.ts` | Configuración de desarrollo, compilación y conexión con la API. |
| `package.json` | Bibliotecas de JavaScript y comandos del proyecto. |
| `tsconfig.json` | Configuración de TypeScript. |

`node_modules/` se genera al instalar bibliotecas y `dist/` al compilar. No son el lugar para modificar tus pantallas: trabaja dentro de `src/`.

## Arrancar

Abre otra terminal desde la raíz del proyecto y ejecuta:

```powershell
cd Frontend
npm ci
npm run dev
```

Con el Backend también iniciado, abre http://127.0.0.1:5173.

## Exportar reportes

El botón **Exportar** abre una vista previa y permite elegir **Excel (.xlsx)**, **PDF** o **CSV** antes de descargar. Excel es la opción recomendada para abrir en Microsoft Excel: cada sección se guarda en una hoja con una tabla nativa, filtros, filas alternadas, encabezados fijos, anchos ajustados y formatos numéricos y de fecha. Los RUC, teléfonos y códigos se conservan como texto.

El PDF incluye identidad de empresa, fecha de generación en Lima, encabezados y páginas numeradas. El CSV usa encabezados en español, UTF-8 y separador configurable (punto y coma o coma); conserva datos, sin colores ni estilos. La opción **Apertura automática en Excel**, activada inicialmente, agrega una directiva `sep=` para que Excel distribuya los datos en columnas al abrir el archivo. Desactivarla produce un CSV sin esa directiva para importar en otros programas.

Las tablas comerciales y Documentos exportan los registros que coinciden con sus filtros. En Administración se exporta la auditoría; el acceso sigue reservado al administrador. Documentos exporta un listado de metadatos, no el contenido de los archivos adjuntos.

El Dashboard exporta indicadores, gráfico y datos de evolución diaria, ventas y compras del período, las cinco ventas recientes mostradas, cuentas por cobrar/pagar, alertas de stock e inventario completo. Los saldos e inventario son acumulados a la fecha; las ventas y compras del período respetan el selector del Dashboard. Las secciones vacías se indican en la vista previa y el PDF.

## Comprobar los cambios

Desde esta carpeta:

```powershell
npm run build
```

Esto revisa TypeScript y genera la versión compilada en `dist/`.

Continúa con la [guía del código](../docs/guia-del-codigo.md).
