# IPTV Player - Samsung Tizen TV

Aplicacion IPTV nativa para Samsung Smart TV basada en Tizen, pensada para navegar listas de TV en vivo, VOD y series desde un solo panel optimizado para control remoto.

![Samsung Tizen](https://img.shields.io/badge/Samsung-Tizen%209-1428A0?style=flat-square&logo=samsung)
![Plataforma](https://img.shields.io/badge/Plataforma-Smart%20TV-black?style=flat-square)
![Licencia](https://img.shields.io/badge/Licencia-MIT-green?style=flat-square)

## Que incluye

| Area | Estado actual |
|------|---------------|
| Fuentes IPTV | Soporte para listas Xtream Codes y URLs M3U/M3U8, cargadas desde configuracion local o remota |
| TV en directo | Reproduccion con AVPlay, agrupacion por categorias, filtro por pais y navegacion por lista |
| VOD / Series | Exploracion y reproduccion de contenido Xtream con ficha informativa, temporadas y episodios |
| Favoritos | Guardado por lista y persistencia local |
| Busqueda | Busqueda rapida con debounce sobre el catalogo actual |
| EPG | Lectura de guia cuando la API la proporciona |
| UI TV-first | Diseno pensado para mando, foco visible, overlays y PiP |
| Sincronizacion remota | Web remota para enviar listas a la TV mediante PeerJS |
| Cache local | Cache de canales, VOD y series para acelerar arranques |
| Perfil TV | Ajustes centralizados para el modelo objetivo, PiP, mando, prefetch y lista virtual |

## Estructura

```text
IPTV-Player/
|-- config.xml
|-- index.html
|-- css/
|   |-- main.css
|   `-- components.css
|-- img/
|   `-- logo.png
|-- js/
|   |-- app.js
|   |-- config.js
|   |-- countries.js
|   |-- device-profile.js
|   |-- epg.js
|   |-- eventBus.js
|   |-- favorites.js
|   |-- info-popup.js
|   |-- keyHandler.js
|   |-- m3u-worker.js
|   |-- player.js
|   |-- player-osd.js
|   |-- playlist.js
|   |-- router.js
|   |-- search.js
|   |-- setup-progress.js
|   |-- storage.js
|   |-- store.js
|   |-- sync.js
|   |-- view-channels.js
|   |-- view-setup.js
|   |-- virtual-list.js
|   |-- vod-osd.js
|   |-- watching.js
|   `-- services/
|       |-- channels-input-controller.js
|       |-- focus-controller.js
|       |-- list-loader.js
|       |-- playlist-service.js
|       |-- storage-cache.js
|       |-- storage-prefs.js
|       |-- storage-progress.js
|       |-- tab-data-loader.js
|       |-- view-renderer.js
|       `-- view-state.js
|-- scripts/
|   `-- check-js.mjs
`-- web-remote/
    |-- index.html
    |-- css/style.css
    |-- js/remote.js
    |-- icon.svg
    |-- manifest.json
    `-- sw.js
```

## Flujo tipico

1. La app arranca en la pantalla de configuracion.
2. El usuario anade una lista Xtream o una URL M3U/M3U8, o la recibe desde la web remota.
3. La app guarda la configuracion, descarga la lista y genera grupos/categorias.
4. El usuario filtra por pais, busca por nombre o entra en VOD/Series si la cuenta lo soporta.
5. Al reproducir un canal, la app muestra OSD, usa PiP y permite volver al listado.

## Controles

| Tecla / accion | Funcion |
|----------------|---------|
| Arriba / Abajo / Izquierda / Derecha | Navegar entre grupos, filtros, tabs y canales |
| OK | Reproducir o confirmar seleccion |
| OK larga | Anadir o quitar favorito segun contexto |
| Back | Volver, cerrar overlays o salir del buscador |
| CH arriba / CH abajo | Cambiar canal durante la reproduccion |
| Left / Right | Buscar o avanzar/retroceder en reproduccion |
| Boton de busqueda | Abrir el teclado de busqueda |

## Arquitectura actual

- `view-channels.js` coordina la vista principal de canales y delega estado, foco, input y render en servicios.
- `services/channels-input-controller.js` concentra teclado, OK largo, Back, tabs y clicks principales de la vista de canales.
- `services/focus-controller.js` gestiona zonas de foco para mando: tabs, paises, grupos, canales y salida.
- `services/view-state.js` aplica cambios de pais, grupo y sincronizacion con el canal activo.
- `services/view-renderer.js` renderiza paises, grupos y cabeceras sin mezclar logica de navegacion.
- `view-setup.js` gestiona listas guardadas, configuracion y navegacion por mando.
- `player.js` encapsula AVPlay, PiP, reintentos y progreso.
- `info-popup.js` muestra la ficha de VOD y series.
- `playlist.js` concentra el catalogo, filtros, grupos y acceso a metadata Xtream.
- `storage.js` actua como fachada sobre preferencias, cache y progreso:
  - `services/storage-prefs.js`
  - `services/storage-cache.js`
  - `services/storage-progress.js`
- `store.js` mantiene el estado de sesion de la UI.
- `eventBus.js` centraliza eventos entre vistas y servicios.
- `virtual-list.js` renderiza listas grandes sin perder rendimiento.
- `device-profile.js` centraliza parametros del televisor objetivo: resolucion de layout, PiP, bitrate, buffers, throttling, prefetch y carga de logos.

## Optimizaciones visibles

- Cache local de listas y contenido mediante IndexedDB.
- Carga y cache de datos Xtream con prefetch prudente de VOD/Series para no competir con AVPlay.
- Listado virtual para catalogos grandes.
- Cola de imagenes con concurrencia limitada y pausa breve de logos durante navegacion rapida por mando.
- Busqueda con indice normalizado y debounce.
- **Micro-pausas asíncronas (yielding) en la inicialización de listas masivas para no congelar la UI de Tizen**.
- Transiciones CSS aceleradas por GPU (transform y opacity) sin reflows para asegurar 60 FPS en el OSD.
- Reintentos automáticos en reproduccion.
- PiP con retardo configurable para evitar reinicios de AVPlay al moverse rapido por la lista.
- Persistencia de progreso para VOD y series.

## Ajustes para TV

Los parametros sensibles al dispositivo viven en `js/device-profile.js`.

Incluyen:
- Resolucion de layout y posicion del PiP.
- Throttle de navegacion y duracion de OK largo.
- Bitrates maximos, buffers y timeout de AVPlay.
- Retardo de preview PiP.
- Retardo y separacion del prefetch de VOD/Series.
- Concurrencia de logos y pausa de carga durante navegacion.

Tambien se puede sobrescribir el perfil en runtime con `window.__IPTV_DEVICE_PROFILE__` antes de inicializar la app.

## Web remota

La carpeta [`web-remote`](web-remote) contiene una interfaz pequena para vincular la TV mediante PeerJS y enviar configuraciones de listas desde un navegador movil o PC.

Incluye:
- Conexion con PIN de 4 digitos.
- Envio de listas Xtream o M3U.
- Persistencia de la ultima configuracion enviada.

## Desarrollo

### Requisitos

- Tizen Studio
- Extension Tizen TV para VSCode o Cursor
- Permisos de red, mando y almacenamiento en `config.xml`

### Comprobacion rapida

```bash
npm run check
```

### Vista previa local

```bash
npx serve . -l 3000
```

Abre `http://localhost:3000` para revisar la interfaz.

> El reproductor real AVPlay no funciona fuera de Tizen, pero la UI, navegacion, filtros, vistas auxiliares y busqueda si se pueden probar en navegador.

### Ejecutable portable para Windows

```bash
npm install
npm run dev:desktop
npm run dist:portable
```

La salida portable queda en `dist/` como un ejecutable de Windows con Electron.

## Probar en un Samsung TV

1. Activar el modo desarrollador en el televisor.
2. Conectar el TV desde VSCode con la herramienta de Tizen.
3. Crear el certificado de la app si es la primera vez.
4. Ejecutar la aplicacion en el dispositivo.

## Licencia

MIT 2025 drosalop
