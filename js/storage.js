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

  const getLists    = ()      => get('lists', []);
  const saveLists   = (lists) => set('lists', lists);
  const getFavs     = (listId) => {
    if (!listId) return get('favorites', []);
    return get('favorites_' + listId, []);
  };
  const saveFavs    = (listId, favs) => {
    if (!listId) return set('favorites', favs);
    return set('favorites_' + listId, favs);
  };


  const getLastList = ()      => get('last_list', null);
  const setLastList = (id)    => set('last_list', id);
  const getDefaultList = ()   => get('default_list', null);
  const setDefaultList = (id) => set('default_list', id);
  const _getCurrentListId = (listId = null) => {
    if (listId) return listId;
    if (typeof Store !== 'undefined') {
      const list = Store.get('currentList');
      if (list && list.id) return list.id;
    }
    return 'default';
  };

  const getLastChannel = (listId = null) => get('last_channel_' + _getCurrentListId(listId), null);
  const setLastChannel = (id, listId = null) => set('last_channel_' + _getCurrentListId(listId), id);

  const getVisibleCountries = ()      => get('visible_countries', null);
  const setVisibleCountries = (list)  => set('visible_countries', list);

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

  const getChannelCache = (list) => _getFromDB(_cacheKey('ch_cache', list), CHANNEL_TTL);
  const setChannelCache = (list, data) => _setToDB(_cacheKey('ch_cache', list), data);
  const clearChannelCache = (list) => (typeof list === 'string' ? _clearByPrefix(`ch_cache_${list}`) : _delFromDB(_cacheKey('ch_cache', list)));

  const getVodCache = (list) => _getFromDB(_cacheKey('vod_cache', list), CHANNEL_TTL);
  const setVodCache = (list, data) => _setToDB(_cacheKey('vod_cache', list), data);
  const clearVodCache = (list) => (typeof list === 'string' ? _clearByPrefix(`vod_cache_${list}`) : _delFromDB(_cacheKey('vod_cache', list)));

  const getSeriesCache = (list) => _getFromDB(_cacheKey('series_cache', list), CHANNEL_TTL);
  const setSeriesCache = (list, data) => _setToDB(_cacheKey('series_cache', list), data);
  const clearSeriesCache = (list) => (typeof list === 'string' ? _clearByPrefix(`series_cache_${list}`) : _delFromDB(_cacheKey('series_cache', list)));

  // ── Progreso de episodios (localStorage, persiste entre reinicios) ───
  const EP_PROG_PREFIX = 'ep_prog_';
  const getEpisodeProgress = (epId) => get(EP_PROG_PREFIX + epId, null);
  const setEpisodeProgress = (epId, ms) => set(EP_PROG_PREFIX + epId, ms);
  const clearEpisodeProgress = (epId) => del(EP_PROG_PREFIX + epId);

  return { get, set, del, getLists, saveLists, getFavs, saveFavs, getLastList, setLastList, getDefaultList, setDefaultList, getLastChannel, setLastChannel, getChannelCache, setChannelCache, clearChannelCache, getVodCache, setVodCache, clearVodCache, getSeriesCache, setSeriesCache, clearSeriesCache, getVisibleCountries, setVisibleCountries, getEpisodeProgress, setEpisodeProgress, clearEpisodeProgress };
})();

