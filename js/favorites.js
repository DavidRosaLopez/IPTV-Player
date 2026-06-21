/**
 * favorites.js — Favorite channels management (list-specific)
 * Performance: in-memory cache to avoid repeated localStorage reads.
 */
const Favorites = (() => {
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
    
    // Guardar al principio
    items.unshift({
      id: idToFind,
      ep: ep
    });
    
    Storage.set(key, items);
  }

  function isWatching(id) {
    return getIds().includes(id);
  }

  return { getIds, getItems, add, isWatching };
})();
