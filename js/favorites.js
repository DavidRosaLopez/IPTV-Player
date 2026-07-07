/**
 * favorites.js — Favorite channels management (list-specific)
 * Performance: in-memory cache to avoid repeated localStorage reads.
 */
import { Store } from './store.js';
import { Storage } from './storage.js';


export const Favorites = (() => {
  // In-memory cache: { key: string, ids: Set, arr: [] }
  let _cache = null;

  function _getKey() {
    const list = typeof Store !== 'undefined' ? Store.get('currentList') : null;
    const listId = list ? list.id : 'default';
    const tabId = typeof Store !== 'undefined' ? (Store.get('currentTab') || 'tv') : 'tv';
    return `${listId}_${tabId}`;
  }

  function _loadCache() {
    const key = _getKey();
    if (_cache && _cache.key === key) return _cache;
    const arr = Storage.getFavs(key) || [];
    _cache = { key, ids: new Set(arr), arr };
    return _cache;
  }

  function _invalidate() { _cache = null; }

  function getIds() {
    return _loadCache().arr;
  }

  function toggle(channelId) {
    const key = _getKey();
    const cache = _loadCache();
    let added = false;
    if (cache.ids.has(channelId)) {
      cache.ids.delete(channelId);
    } else {
      cache.ids.add(channelId);
      added = true;
    }
    cache.arr = Array.from(cache.ids);
    Storage.saveFavs(key, cache.arr);
    return added;
  }

  function isFav(channelId) {
    return _loadCache().ids.has(channelId);
  }

  // Expose invalidate for external callers that switch tabs/lists
  function init() { _invalidate(); }

  return { init, toggle, isFav, getIds };
})();

const Watching = (() => {
  function _getKey() {
    const list = typeof Store !== 'undefined' ? Store.get('currentList') : null;
    const listId = list ? list.id : 'default';
    return `${listId}_watching_series`;
  }

  function getItems() {
    return Storage.get(_getKey()) || [];
  }

  function getIds() {
    return getItems().map(item => typeof item === 'string' ? item : item.id);
  }

  function add(ch, ep = null) {
    const key = _getKey();
    let items = getItems();
    
    const idToFind = typeof ch === 'string' ? ch : ch.id;
    
    // Eliminar duplicados
    items = items.filter(item => {
      const id = typeof item === 'string' ? item : item.id;
      return id !== idToFind;
    });
    
    // Recuperar progreso actual del episodio si lo hay
    const epId = ep ? `ep_${ep.id}` : null;
    const progressMs = epId ? (Storage.getEpisodeProgress(epId) || null) : null;

    // Guardar al principio con timestamp de progreso
    items.unshift({
      id: idToFind,
      ep: ep,
      progressMs: progressMs
    });
    
    Storage.set(key, items);
  }

  // Actualiza solo el progreso del episodio activo sin cambiar el orden
  function updateProgress(seriesId, epId, ms) {
    const key = _getKey();
    const items = getItems();
    const idx = items.findIndex(item => {
      const id = typeof item === 'string' ? item : item.id;
      return id === seriesId;
    });
    if (idx !== -1 && typeof items[idx] === 'object') {
      items[idx].progressMs = ms;
      Storage.set(key, items);
    }
  }

  function isWatching(id) {
    return getIds().includes(id);
  }

  return { getIds, getItems, add, isWatching, updateProgress };
})();
