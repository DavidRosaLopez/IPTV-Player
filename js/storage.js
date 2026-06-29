/**
 * storage.js — localStorage abstraction
 */
const Storage = (() => {
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
  const _getCurrentListId = () => {
    if (typeof Store !== 'undefined') {
      const list = Store.get('currentList');
      if (list && list.id) return list.id;
    }
    return 'default';
  };

  const getLastChannel = ()   => get('last_channel_' + _getCurrentListId(), null);
  const setLastChannel = (id) => set('last_channel_' + _getCurrentListId(), id);

  const getVisibleCountries = ()      => get('visible_countries', null);
  const setVisibleCountries = (list)  => set('visible_countries', list);

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

  const getChannelCache = (listId) => _getFromDB('ch_cache_' + listId, CHANNEL_TTL);
  const setChannelCache = (listId, data) => _setToDB('ch_cache_' + listId, data);
  const clearChannelCache = (listId) => _delFromDB('ch_cache_' + listId);

  const getVodCache = (listId) => _getFromDB('vod_cache_' + listId, CHANNEL_TTL);
  const setVodCache = (listId, data) => _setToDB('vod_cache_' + listId, data);
  const clearVodCache = (listId) => _delFromDB('vod_cache_' + listId);

  const getSeriesCache = (listId) => _getFromDB('series_cache_' + listId, CHANNEL_TTL);
  const setSeriesCache = (listId, data) => _setToDB('series_cache_' + listId, data);
  const clearSeriesCache = (listId) => _delFromDB('series_cache_' + listId);

  // ── Progreso de episodios (localStorage, persiste entre reinicios) ───
  const EP_PROG_PREFIX = 'ep_prog_';
  const getEpisodeProgress = (epId) => get(EP_PROG_PREFIX + epId, null);
  const setEpisodeProgress = (epId, ms) => set(EP_PROG_PREFIX + epId, ms);
  const clearEpisodeProgress = (epId) => del(EP_PROG_PREFIX + epId);

  return { get, set, del, getLists, saveLists, getFavs, saveFavs, getLastList, setLastList, getDefaultList, setDefaultList, getLastChannel, setLastChannel, getChannelCache, setChannelCache, clearChannelCache, getVodCache, setVodCache, clearVodCache, getSeriesCache, setSeriesCache, clearSeriesCache, getVisibleCountries, setVisibleCountries, getEpisodeProgress, setEpisodeProgress, clearEpisodeProgress };
})();

