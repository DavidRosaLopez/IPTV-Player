/**
 * favorites.js — Favorite channels management (list-specific)
 * Performance: in-memory cache to avoid repeated localStorage reads.
 */
import { Store } from './store.js';
import { Storage } from './storage.js';


export const Favorites = (() => {
  // In-memory cache: { key: string, ids: Set, arr: [] }
  let _cache = null;
  let _version = 0;

  function _getKey() {
    const list = typeof Store !== 'undefined' ? Store.peek('currentList') : null;
    const listId = list ? list.id : 'default';
    const tabId = typeof Store !== 'undefined' ? (Store.peek('currentTab') || 'tv') : 'tv';
    return `${listId}_${tabId}`;
  }

  function _loadCache() {
    const key = _getKey();
    if (_cache && _cache.key === key) return _cache;
    const arr = Storage.getFavs(key) || [];
    _cache = { key, ids: new Set(arr), arr };
    return _cache;
  }

  function _invalidate() {
    _cache = null;
    _version++;
  }

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
    _version++;
    return added;
  }

  function isFav(channelId) {
    return _loadCache().ids.has(channelId);
  }

  // Expose invalidate for external callers that switch tabs/lists
  function init() { _invalidate(); }

  function getVersion() { return _version; }

  return { init, toggle, isFav, getIds, getVersion };
})();
