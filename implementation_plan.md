# Análisis y Optimización — IPTV Player

Revisión completa del código para identificar puntos de mejora en rendimiento, mantenibilidad y robustez.

## Resumen Ejecutivo

La arquitectura es sólida: buen uso de módulos ES, Web Worker para M3U, virtual scrolling, LRU caching, y un event bus desacoplado. Las mejoras se centran en **eliminar código duplicado**, **prevenir memory leaks**, **reducir DOM thrashing** y **mejorar robustez ante errores**.

---

## 🔴 Problemas Críticos (Alto Impacto)

### 1. Memory Leak — Event listeners nunca se desregistran en `view-setup.js`

[view-setup.js](file:///c:/Users/drosalop/Proyectos/IPTV-Player/js/view-setup.js#L540-L546)

`KeyHandler.on()` registra listeners globales desde `onShow()` que nunca se eliminan. Cada vez que `ViewSetup` recibe `onShow` los eventos se acumulan si `_setupEventsBound` falla.

Más importante: los listeners de teclas de `ViewSetup` y `ViewChannels` están activos **simultáneamente**. `ViewSetup` registra `ENTER`, `BACK`, `UP`, etc. en `KeyHandler`, pero `ViewChannels.initKeys()` también lo hace. El guard `Router.isView('setup')` evita conflictos, pero **añade overhead** en cada pulsación de tecla al ejecutar callbacks inactivos.

> [!IMPORTANT]
> **Propuesta**: Implementar `KeyHandler.offAll(scope)` que permita registrar listeners con un scope (e.g., `'setup'`, `'channels'`) y desregistrarlos al cambiar de vista. Esto elimina comprobaciones redundantes de `Router.isView()` dentro de cada handler.

### 2. `document.getElementById()` repetidos sin caché — player.js

[player.js L154-L160](file:///c:/Users/drosalop/Proyectos/IPTV-Player/js/player.js#L154-L160)

`_videoLayerEl` se cachea en `init()` (L104) pero luego se ignora en `play()` (L154: `document.getElementById('video-layer')`) y en múltiples sitios como `pip-box`, `player-error`, `buffer-spinner`, `seek-feedback-left/right`. En un TV con navegador limitado, cada `getElementById` durante playback es innecesario.

> [!IMPORTANT]
> **Propuesta**: Cachear todas las referencias a elementos DOM al inicio en un objeto `_els = {}` y usarlas en todo el módulo. Ya se hace con `_videoLayerEl` pero no consistentemente.

### 3. `innerHTML` en hot paths — info-popup.js y view-setup.js

[info-popup.js L184-L196](file:///c:/Users/drosalop/Proyectos/IPTV-Player/js/info-popup.js#L184-L196)

`_resetUI()` usa `innerHTML = ''` para limpiar listas. Esto destruye nodos y genera GC pressure innecesario. El mismo patrón aparece en [view-setup.js L241](file:///c:/Users/drosalop/Proyectos/IPTV-Player/js/view-setup.js#L241) con `el.innerHTML = '<p class="empty-msg">...'`.

> **Propuesta**: Reemplazar `innerHTML = ''` con `replaceChildren()` (ya se usa en otros sitios del código). Para el mensaje vacío, crear el nodo con `createElement`.

---

## 🟠 Mejoras de Rendimiento (Medio Impacto)

### 4. Código duplicado: `_detectStreamMeta` y `detectStreamMeta`

La función existe **3 veces** con implementación casi idéntica:
- [m3u-worker.js L23-L39](file:///c:/Users/drosalop/Proyectos/IPTV-Player/js/m3u-worker.js#L23-L39)
- [playlist-service.js L128-L144](file:///c:/Users/drosalop/Proyectos/IPTV-Player/js/services/playlist-service.js#L128-L144)
- Patrones regex también duplicados en [player.js L63-L76](file:///c:/Users/drosalop/Proyectos/IPTV-Player/js/player.js#L63-L76)

> **Propuesta**: Extraer a un módulo compartido `js/utils/stream-meta.js`. El worker no puede importar módulos ES, pero puede recibir la lógica por mensaje o usar un `importScripts()`.

### 5. Código duplicado: `detectCountry`

Duplicada entre [m3u-worker.js L61-L87](file:///c:/Users/drosalop/Proyectos/IPTV-Player/js/m3u-worker.js#L61-L87) y [playlist-service.js L16-L41](file:///c:/Users/drosalop/Proyectos/IPTV-Player/js/services/playlist-service.js#L16-L41).

> **Propuesta**: Consolidar igual que `_detectStreamMeta`.

### 6. Código duplicado: `_escapeHtml`

Duplicada en [info-popup.js L29-L37](file:///c:/Users/drosalop/Proyectos/IPTV-Player/js/info-popup.js#L29-L37) y [view-setup.js L31-L39](file:///c:/Users/drosalop/Proyectos/IPTV-Player/js/view-setup.js#L31-L39). Además, **ninguna de las dos se usa realmente** — el código genera DOM con `textContent` (seguro por defecto), no con `innerHTML`.

> **Propuesta**: Eliminar `_escapeHtml` de ambos archivos si no se usa. Si se necesita, mover a un util compartido.

### 7. `Store.get()` clona arrays innecesariamente

[store.js L16-L33](file:///c:/Users/drosalop/Proyectos/IPTV-Player/js/store.js#L16-L33)

`Store.get()` hace shallow clone (`[...val]`) en cada llamada. Para `channels` (potencialmente 10K+ items), esto crea un array nuevo cada vez. El código ya tiene `Store.peek()` para acceso sin clonar, pero `Store.get('countries')` y `Store.get('groups')` se llaman frecuentemente en render loops.

> [!WARNING]
> **Propuesta**: Auditar todos los call sites de `Store.get()`. La mayoría pueden ser `Store.peek()` ya que no mutan el resultado. El clone solo es necesario si el consumidor modifica el array.

### 8. `_renderSavedLists` recrea todo el DOM en cada toggle

[view-setup.js L237-L295](file:///c:/Users/drosalop/Proyectos/IPTV-Player/js/view-setup.js#L237-L295)

Al cambiar la lista por defecto (`_toggleDefaultList`), se llama `_renderSavedLists()` que destruye y recrea todos los nodos. Solo es necesario actualizar el icono de estrella.

> **Propuesta**: Actualizar solo el icono de la estrella en `_toggleDefaultList` en lugar de re-renderizar toda la lista.

### 9. `VirtualList.update()` usa `innerHTML = ''` para limpiar

[virtual-list.js L166](file:///c:/Users/drosalop/Proyectos/IPTV-Player/js/virtual-list.js#L166)

`_container.innerHTML = ''` destruye todos los nodos reciclados del pool. Sería más eficiente reciclarlos al pool antes de limpiar.

> **Propuesta**: En `update()`, reciclar nodos existentes al pool antes de limpiarlos para reutilizarlos inmediatamente en el siguiente `_renderVisible()`.

---

## 🟡 Mejoras de Robustez (Bajo-Medio Impacto)

### 10. Sin manejo de `localStorage` lleno

[storage.js L30-L36](file:///c:/Users/drosalop/Proyectos/IPTV-Player/js/storage.js#L30-L36)

El `try/catch` devuelve `false` pero ningún consumidor verifica el resultado. Con listas de 10K+ canales cacheadas, `localStorage` puede llenarse (5-10 MB en Tizen).

> **Propuesta**: En `Storage.set`, al capturar el error, verificar si es `QuotaExceededError` e intentar liberar caché antigua antes de fallar silenciosamente.

### 11. `_playChannel` busca elementos por ID sin caché

[view-channels.js L562-L582](file:///c:/Users/drosalop/Proyectos/IPTV-Player/js/view-channels.js#L562-L582)

`document.getElementById('view-player').focus()` se repite 3 veces. Cachear la referencia.

### 12. Timer del reloj podría ser más eficiente

[app.js L91-L103](file:///c:/Users/drosalop/Proyectos/IPTV-Player/js/app.js#L91-L103)

El reloj se actualiza cada 10 segundos. Para un display de HH:MM, 60 segundos es suficiente, reduciendo 6x las actualizaciones.

> **Propuesta**: Cambiar intervalo a 60000ms y sincronizar con el inicio del minuto.

### 13. `_getStreamMode` se llama múltiples veces con el mismo canal

[player.js L63-L76](file:///c:/Users/drosalop/Proyectos/IPTV-Player/js/player.js#L63-L76)

En `_applyDisplayRect` (L248) y `_applyPlaybackTuning` (L79) se llama `_getStreamMode()` por separado. Podría calcularse una vez y pasarse como argumento.

### 14. Lógica muerta en `restoreFocusAfterRender`

[view-channels.js L171](file:///c:/Users/drosalop/Proyectos/IPTV-Player/js/view-channels.js#L171)

```js
const landingZone = _currentTab === 'tv' ? 'groups' : 'groups';
```

Ambas ramas del ternario devuelven `'groups'`. Simplificar a `const landingZone = 'groups';` o implementar la lógica correcta si VOD/Series debería tener un landing diferente.

### 15. `_renderEpisodes` calcula progreso con duración hardcodeada

[info-popup.js L353](file:///c:/Users/drosalop/Proyectos/IPTV-Player/js/info-popup.js#L353)

```js
const pct = Math.min(100, Math.round((ms / 2700000) * 100));
```

`2700000ms = 45 min` está hardcodeado como duración del episodio. Debería usar la duración real del episodio si está disponible en la metadata.

---

## 🟢 Mejoras Menores / Calidad de Código

### 16. Imports no utilizados
- [player.js L14](file:///c:/Users/drosalop/Proyectos/IPTV-Player/js/player.js#L14): `PlayerOSD` se importa y luego se verifica con `typeof PlayerOSD !== 'undefined'`, lo cual siempre es true al estar importado.

### 17. `view-channels.js` es demasiado grande (717 líneas)
Ya se ha extraído bastante lógica a `services/`, pero el módulo sigue siendo el más complejo. El patrón de pasar docenas de callbacks al constructor de `createViewState`, `createFocusController`, y `createChannelsInputController` es verboso.

> **Propuesta futura**: Considerar pasar un contexto/state object en lugar de 30+ callbacks individuales.

### 18. `ImageQueue` priority sort es O(n) por item
[virtual-list.js L43-L45](file:///c:/Users/drosalop/Proyectos/IPTV-Player/js/virtual-list.js#L43-L45)

El bucle busca el elemento de mayor prioridad linealmente. Con pocas imágenes concurrentes (MAX=3) el impacto es mínimo, pero si se aumenta la concurrencia sería mejor usar un min-heap.

---

## Verificación

### Automatizada
- No hay test framework configurado. Se verificaría manualmente en el emulador Tizen.

### Manual
- Validar rendimiento de navegación con listas de 10K+ canales
- Verificar que no hay memory leaks con el DevTools de Tizen
- Comprobar que el PIP y el fullscreen siguen funcionando tras cambios

---

## Open Questions

> [!IMPORTANT]
> 1. **¿Quieres que aplique todas las mejoras o prefieres seleccionar cuáles?** Algunas son refactors menores y otras requieren cambios en varios archivos.
> 2. **¿Priorizo rendimiento (items 1-3, 7, 9) o mantenibilidad (items 4-6, 14, 16-17)?**
> 3. **El `typeof X !== 'undefined'` check en imports (item 16)** — ¿Es un patrón que usas intencionadamente para compatibilidad con algún entorno de pruebas sin esos módulos?
> 4. **La duración hardcodeada de 45 min (item 15)** — ¿Tienes acceso a la duración real del episodio en la metadata de la API Xtream?
