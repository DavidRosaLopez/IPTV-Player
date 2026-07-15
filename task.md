# Optimización IPTV Player — Tareas

## 🔴 Críticos
- `[ ]` 1. KeyHandler: añadir soporte de scopes y limpiar listeners al cambiar vista
- `[ ]` 2. player.js: cachear todas las refs DOM en un objeto `_els`
- `[ ]` 3. Reemplazar `innerHTML = ''` con `replaceChildren()` en info-popup y view-setup

## 🟠 Rendimiento Medio
- `[ ]` 4. Extraer `_detectStreamMeta` duplicado (playlist-service + m3u-worker + player)
- `[ ]` 5. Extraer `detectCountry` duplicado (playlist-service + m3u-worker)
- `[ ]` 6. Eliminar `_escapeHtml` no utilizado de info-popup y view-setup
- `[ ]` 7. Auditar Store.get() → Store.peek() donde no se muta
- `[ ]` 8. _toggleDefaultList: actualizar solo icono en vez de re-render completo
- `[ ]` 9. VirtualList.update: reciclar nodos al pool antes de limpiar

## 🟡 Robustez
- `[ ]` 10. Storage.set: manejar QuotaExceededError
- `[ ]` 11. view-channels.js: cachear ref a view-player
- `[ ]` 12. Clock interval: 60s en vez de 10s
- `[ ]` 13. player.js: cachear resultado de _getStreamMode
- `[ ]` 14. Fix lógica muerta landingZone ternario
- `[ ]` 15. info-popup.js: usar duración real del episodio si disponible

## 🟢 Menores
- `[ ]` 16. Eliminar typeof checks innecesarios en imports
- `[ ]` 17. (Skip) view-channels.js refactor de callbacks — demasiado invasivo
- `[ ]` 18. (Skip) ImageQueue heap — impacto mínimo con MAX=3
