/**
 * storage.js — localStorage abstraction
 */
import { Store } from './store.js';


export const Storage = (() => {
  const PREFIX = 'iptv_';
  let _dbPromise = null;

  const get = (key, fallback = null) => {
    try {
      const v = localStorage.getItem(PREFIX + key);
      return v !== null ? JSON.parse(v) : fallback;
    } catch { return fallback; }
  };

  const set = (key, val) => {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(val)); return true; }
    catch { return false; }
  };

  const del = (key) => localStorage.removeItem(PREFIX + key);

  const Prefs = {
    getLists: () => get('lists', []),
    saveLists: (lists) => set('lists', lists),
    getFavs: (listId) => {
      if (!listId) return get('favorites', []);
      return get('favorites_' + listId, []);
    },
    saveFavs: (listId, favs) => {
      if (!listId) return set('favorites', favs);
      return set('favorites_' + listId, favs);
    },
    getLastList: () => get('last_list', null),
    setLastList: (id) => set('last_list', id),
    getDefaultList: () => get('default_list', null),
    setDefaultList: (id) => set('default_list', id),
    getLastChannel: (listId = null) => get('last_channel_' + _getCurrentListId(listId), null),
    setLastChannel: (id, listId = null) => set('last_channel_' + _getCurrentListId(listId), id),
    getVisibleCountries: () => get('visible_countries', null),
    setVisibleCountries: (list) => set('visible_countries', list),
  };

  const _getCurrentListId = (listId = null) => {
    if (listId) return listId;
    if (typeof Store !== 'undefined') {
      const list = Store.get('currentList');
      if (list && list.id) return list.id;
    }
    return 'default';
  };

  function _listSignature(listOrId) {
    if (!listOrId || typeof listOrId === 'string') return '';
    const type = listOrId.type || 'list';
    const source = listOrId.type === 'xtream'
      ? [listOrId.server || '', listOrId.user || '', listOrId.pass || ''].join('|')
      : [listOrId.url || ''].join('|');
    return `${type}:${source}`;
  }

  function _cacheKey(prefix, listOrId) {
    const id = typeof listOrId === 'string' ? listOrId : (listOrId?.id || 'default');
    const sig = _listSignature(listOrId);
    return sig ? `${prefix}_${id}_${sig}` : `${prefix}_${id}`;
  }

  // ── IndexedDB for large data (Channel cache) ────────────
  const CHANNEL_TTL = 6 * 3600 * 1000;
  const DB_NAME = 'IPTV_DB_V11';
  const STORE_NAME = 'cache';
  
  function _getDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        _dbPromise = null;
        reject(req.error);
      };
    });
    return _dbPromise;
  }

  const _getFromDB = async (key, ttl) => {
    try {
      const db = await _getDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => {
          const v = req.result;
          if (!v || (Date.now() - v.ts) > ttl) resolve(null);
          else resolve(v.data);
        };
        req.onerror = () => resolve(null);
      });
    } catch { return null; }
  };

  const _setToDB = async (key, data) => {
    try {
      const db = await _getDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put({ ts: Date.now(), data }, key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      });
    } catch { return false; }
  };

  const _delFromDB = async (key) => {
    try {
      const db = await _getDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      });
    } catch { return false; }
  };

  const _clearByPrefix = async (prefix) => {
    try {
      const db = await _getDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.openCursor();
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (!cursor) { resolve(true); return; }
          if (String(cursor.key).startsWith(prefix)) cursor.delete();
          cursor.continue();
        };
        req.onerror = () => resolve(false);
      });
    } catch { return false; }
  };

  const Cache = {
    getChannelCache: (list) => _getFromDB(_cacheKey('ch_cache', list), CHANNEL_TTL),
    setChannelCache: (list, data) => _setToDB(_cacheKey('ch_cache', list), data),
    clearChannelCache: (list) => (typeof list === 'string' ? _clearByPrefix(`ch_cache_${list}`) : _delFromDB(_cacheKey('ch_cache', list))),
    getVodCache: (list) => _getFromDB(_cacheKey('vod_cache', list), CHANNEL_TTL),
    setVodCache: (list, data) => _setToDB(_cacheKey('vod_cache', list), data),
    clearVodCache: (list) => (typeof list === 'string' ? _clearByPrefix(`vod_cache_${list}`) : _delFromDB(_cacheKey('vod_cache', list))),
    getSeriesCache: (list) => _getFromDB(_cacheKey('series_cache', list), CHANNEL_TTL),
    setSeriesCache: (list, data) => _setToDB(_cacheKey('series_cache', list), data),
    clearSeriesCache: (list) => (typeof list === 'string' ? _clearByPrefix(`series_cache_${list}`) : _delFromDB(_cacheKey('series_cache', list))),
  };

  // ── Progreso de episodios (localStorage, persiste entre reinicios) ───
  const EP_PROG_PREFIX = 'ep_prog_';
  const Progress = {
    getEpisodeProgress: (epId) => get(EP_PROG_PREFIX + epId, null),
    setEpisodeProgress: (epId, ms) => set(EP_PROG_PREFIX + epId, ms),
    clearEpisodeProgress: (epId) => del(EP_PROG_PREFIX + epId),
  };

  return {
    get,
    set,
    del,
    ...Prefs,
    ...Cache,
    ...Progress,
    Prefs,
    Cache,
    Progress,
  };
})();

