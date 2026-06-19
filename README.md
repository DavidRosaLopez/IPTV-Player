# 📺 IPTV Player — Samsung Tizen TV

Aplicación IPTV nativa para **Samsung Smart TV** basada en Tizen, pensada para navegar listas de TV en vivo, VOD y series desde un único panel optimizado para control remoto.

![Samsung Tizen](https://img.shields.io/badge/Samsung-Tizen%209-1428A0?style=flat-square&logo=samsung)
![Plataforma](https://img.shields.io/badge/Plataforma-Smart%20TV-black?style=flat-square)
![Licencia](https://img.shields.io/badge/Licencia-MIT-green?style=flat-square)

---

## ✨ Qué incluye la app

| Área | Estado actual del proyecto |
|------|-----------------------------|
| 📡 **Fuentes IPTV** | Soporte para listas **Xtream Codes** y URLs **M3U/M3U8** (incluidas desde configuración remota o listas guardadas) |
| 📺 **TV en directo** | Reprodución con `AVPlay`, agrupación por categorías, filtro por país y navegación por lista |
| 🎬 **VOD / Series** | Exploración y reproducción de contenido desde Xtream, con ficha informativa y navegación por temporadas/episodios |
| ⭐ **Favoritos** | Guardado por lista y persistencia local |
| 🔍 **Búsqueda** | Búsqueda rápida con debounce y lista filtrada en tiempo real |
| 📅 **EPG** | Información de guía para canales en vivo cuando la API lo proporciona |
| 🧭 **UI TV-first** | Diseño pensado para navegación con mando, tabs laterales, foco visible y overlays OSD |
| 📱 **Sincronización remota** | Web remota para enviar configuraciones a la TV a través de PeerJS |
| 🧠 **Cache local** | Caché de canales, VOD y series para acelerar arranques y reutilizar datos |

---

## 🏗️ Estructura del proyecto

```text
IPTV-Player/
├── config.xml                # Manifest de la app Tizen (privilegios y permisos)
├── index.html                 # Vista principal de la TV y layouts base
├── css/
│   ├── main.css               # Estilos globales de la app
│   └── components.css         # Componentes, overlays, badges y detalles visuales
├── js/
│   ├── app.js                 # Inicialización general, carga de listas y sincronización en segundo plano
│   ├── router.js               # Cambio de vistas y toasts/loading overlay
│   ├── view-setup.js           # Pantalla de configuración, listas guardadas y filtros
│   ├── view-channels.js        # Navegación por canales, grupos, tabs y foco de la UI
│   ├── keyHandler.js           # Manejo del mando y eventos de teclado
│   ├── playlist.js             # Parseo de listas y lógica Xtream / VOD / series
│   ├── player.js               # Wrapper AVPlay, PiP, reintentos y manejo de errores
│   ├── player-osd.js           # OSD del reproductor para canales en directo
│   ├── vod-osd.js              # OSD para VOD/series con controles y audio
│   ├── info-popup.js           # Popup con metadata, temporadas y episodios
│   ├── epg.js                  # Consulta y parseo de EPG real para canales XTream
│   ├── search.js               # Búsqueda con debounce y restauración del listado
│   ├── favorites.js            # Favoritos y seguimiento visualizado
│   ├── storage.js              # Abstracción de localStorage / IndexedDB
│   ├── sync.js                 # Sincronización P2P para recibir listas desde la web remota
│   └── virtual-list.js         # Listado virtual para manejar muchas entradas sin degradar rendimiento
└── web-remote/                # Mini web para enviar configuraciones a la TV
```

---

## 🔄 Flujo típico de uso

1. La app inicia en la pantalla de configuración.
2. El usuario añade una lista Xtream o una URL M3U/M3U8 (o la recibe desde la web remota).
3. La app guarda la configuración, la carga y genera grupos/categorías.
4. El usuario puede filtrar por país, buscar por nombre o entrar al modo VOD/Series si la cuenta lo soporta.
5. Al reproducir un canal, la app muestra OSD, guía EPG si existe y permite volver al listado con modo PiP.

---

## 🎮 Controles principales

| Tecla / acción | Función |
|----------------|---------|
| ▲ ▼ ◀ ▶ | Navegar entre grupos, filtros y canales |
| OK | Abrir reproducir / confirmar selección |
| OK larga | Añadir o quitar favorito (según contexto) |
| BACK | Volver, cerrar overlays o salir del buscador |
| CH ▲ / CH ▼ | Cambiar canal durante reproducción |
| LEFT / RIGHT | Buscar / avanzar o retroceder en contenido (si el player está activo) |
| Botón de búsqueda | Abrir teclado de búsqueda en pantalla |

---

## ⚡ Optimizaciones visibles en el código

- Caché local de listas y contenido para evitar recargas innecesarias.
- Carga paralela de categorías y streams para Xtream.
- Listado virtual para listas grandes sin perder rendimiento.
- Búsqueda con índice normalizado y debounce.
- Reintentos automáticos y manejo de errores en reproducción.
- PiP para mantener una vista previa del canal mientras el usuario navega.
- Persistencia de progreso para VOD/series cuando la API lo permite.

---

## 📱 Web remota para enviar listas

La carpeta [web-remote](web-remote) contiene una interfaz pequeña para vincular la TV mediante PeerJS y enviar configuraciones de listas desde un navegador móvil o PC.

Funcionalidades incluidas:
- Conexión con PIN de 4 dígitos.
- Envío de listas Xtream o M3U.
- Persistencia de la última configuración enviada.

---

## 🛠️ Requisitos para desarrollo

- [Tizen Studio](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html)
- Extensión **Tizen TV** para VSCode/Cursor (recomendada)
- Permisos de red, entrada del mando y almacenamiento en [config.xml](config.xml)

### Cómo probar en un TV Samsung

1. Activar el modo desarrollador en el televisor.
2. Conectar el TV desde VSCode usando la herramienta de Tizen.
3. Crear el certificado de la app si es la primera vez.
4. Ejecutar la aplicación en el dispositivo.

---

## 📦 Vista previa local en navegador

```bash
npx serve . -l 3000
```

Abre `http://localhost:3000` para revisar la interfaz.

> El reproductor real (`AVPlay`) no funciona fuera del entorno Tizen, pero la UI, navegación, filtros, EPG y vistas auxiliares sí se pueden probar en navegador.

---

## 📄 Licencia

MIT © 2025 drosalop
