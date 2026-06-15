# 📺 IPTV Player — Samsung Tizen TV

Aplicación IPTV nativa para **Samsung Smart TV con Tizen 9** (probada en S91F OLED 4K 2025).  
Interfaz de guía de TV con soporte de listas M3U8, Xtream Codes, guía EPG, favoritos y búsqueda.

![Samsung Tizen](https://img.shields.io/badge/Samsung-Tizen%209-1428A0?style=flat-square&logo=samsung)
![Plataforma](https://img.shields.io/badge/Plataforma-Smart%20TV-black?style=flat-square)
![Licencia](https://img.shields.io/badge/Licencia-MIT-green?style=flat-square)

---

## ✨ Funcionalidades

| Módulo | Descripción |
|--------|-------------|
| 📋 **M3U8** | Carga listas `.m3u8` por URL, parseadas en Web Worker (sin bloquear la UI) |
| 🔑 **Xtream Codes** | Autenticación con servidor + usuario + contraseña, descarga paralela de canales y categorías |
| 🎬 **Reproductor** | AVPlay nativo con soporte RAW / HD / FHD / UHD / 4K / 8K, buffer adaptativo por calidad |
| 📅 **Guía EPG** | Cuadrícula horaria XMLTV estilo guía TV, navegable con el mando |
| ⭐ **Favoritos** | Añadir/quitar con tecla amarilla, persistidos en `localStorage` |
| 🔍 **Búsqueda** | Filtrado instantáneo con índice pre-construido y debounce de 120ms |
| 🗂️ **Grupos** | Navegación por categorías (sidebar) + "Todos los canales" y "Favoritos" |
| 🔄 **Multi-lista** | Guarda y alterna entre varias fuentes IPTV |

---

## 🏗️ Arquitectura

```
IPTV-App/
├── config.xml              # Manifest Tizen (privilegios, versión)
├── index.html              # Punto de entrada y estructura HTML de todas las vistas
├── css/
│   ├── main.css            # Design system completo (dark mode, variables, todas las vistas)
│   └── components.css      # Micro-animaciones y componentes extra
└── js/
    ├── app.js              # Controlador principal y router de vistas
    ├── keyHandler.js       # Gestión del mando a distancia (Tizen TVInputDevice API)
    ├── playlist.js         # Parser M3U8 + cliente Xtream Codes API
    ├── m3u-worker.js       # Web Worker — parseo M3U8 off-thread
    ├── virtual-list.js     # Scroll virtual para listas de miles de canales
    ├── epg.js              # Carga XMLTV, caché 12h y renderizado de cuadrícula EPG
    ├── player.js           # Wrapper AVPlay con tuning por calidad (4K/8K)
    ├── favorites.js        # CRUD de favoritos con localStorage
    ├── search.js           # Búsqueda debounced con índice pre-construido
    └── storage.js          # Abstracción de localStorage
```

---

## ⚡ Optimizaciones de rendimiento

- **Web Worker** para parsear M3U8 — listas de +10.000 canales sin congelar la UI
- **Scroll virtual** (`virtual-list.js`) — solo renderiza los cards visibles, ~30 nodos DOM activos independientemente del tamaño de la lista
- **AVPlay `prepareAsync()`** — preparación no bloqueante del stream
- **Buffer adaptativo** según calidad detectada del canal:
  - SD/RAW → 3s · HD → 4s · UHD/4K → 6s · 8K → 8s
- **Caché EPG** de 12h en localStorage — no descarga la guía en cada arranque
- **Descarga paralela** de streams y categorías en Xtream Codes (`Promise.all`)
- **Búsqueda instantánea** con índice `_search` en minúsculas pre-construido al cargar

---

## 🎮 Controles del mando

| Tecla | Acción |
|-------|--------|
| ▲ ▼ ◀ ▶ | Navegar entre grupos / canales |
| **OK** | Reproducir canal seleccionado |
| **BACK** | Volver / Cerrar búsqueda |
| **INFO** | Mostrar/ocultar overlay de información |
| 🟡 **Amarilla** | Añadir / quitar de favoritos |
| 🔴 **Roja** | Abrir búsqueda |
| 🟢 **Verde** | Abrir guía EPG |
| **CH ▲▼** | Cambiar canal durante reproducción |

---

## 🛠️ Requisitos de desarrollo

- [Tizen Studio](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html) con **TV 9.0 Extension** y **Samsung Certificate Extension**
- O extensión **Tizen TV** para VSCode/Cursor

### Probar en el TV (recomendado)

1. **Activar Developer Mode** en el TV:  
   `Smart Hub → Apps → pulsar 1 2 3 4 5 → Developer Mode ON → introducir IP del PC → Reiniciar`

2. **Conectar desde VSCode** (`Ctrl+Shift+P`):
   ```
   Tizen: Connect Device → IP del TV, puerto 26101
   ```

3. **Crear certificado** (primera vez):
   ```
   Tizen: Certificate Manager → Samsung → TV
   ```

4. **Ejecutar**:
   ```
   Tizen: Run on Device   (o F5)
   ```

---

## 📦 Instalación local para UI preview

```bash
npx serve . -l 3000
# Abre http://localhost:3000
```
> El reproductor AVPlay no funcionará en navegador (es API exclusiva de Tizen), pero toda la UI, navegación y EPG son completamente funcionales.

---

## 📡 Compatibilidad

| TV / Tizen | Soporte |
|------------|---------|
| Tizen 9 (2025) | ✅ Completo |
| Tizen 7–8 (2022–2024) | ✅ Completo |
| Tizen 6 (2021) | ✅ Con pequeños ajustes |
| Tizen 4–5 (2018–2020) | ⚠️ Sin `prepareAsync`, usar `prepare()` |
| Tizen < 4 | ❌ No soportado |

---

## 📄 Licencia

MIT © 2025 drosalop
