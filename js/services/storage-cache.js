const CHANNEL_TTL = 6 * 3600 * 1000;
const DB_NAME = 'IPTV_DB_V11';
const STORE_NAME = 'cache';

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

export function createCacheStorage() {
  let _dbPromise = null;

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
    } catch {
      return null;
    }
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
    } catch {
      return false;
    }
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
    } catch {
      return false;
    }
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
    } catch {
      return false;
    }
  };

  return {
    getChannelCache: (list) => _getFromDB(_cacheKey('ch_cache', list), CHANNEL_TTL),
    setChannelCache: (list, data) => _setToDB(_cacheKey('ch_cache', list), data),
    clearChannelCache: (list) => (typeof list === 'string' ? _clearByPrefix(`ch_cache_${list}`) : _delFromDB(_cacheKey('ch_cache', list))),
    getVodCache: (list) => _getFromDB(_cacheKey('vod_cache_v4', list), CHANNEL_TTL),
    setVodCache: (list, data) => _setToDB(_cacheKey('vod_cache_v4', list), data),
    clearVodCache: (list) => (typeof list === 'string' ? _clearByPrefix(`vod_cache_v4_${list}`) : _delFromDB(_cacheKey('vod_cache_v4', list))),
    getSeriesCache: (list) => _getFromDB(_cacheKey('series_cache_v4', list), CHANNEL_TTL),
    setSeriesCache: (list, data) => _setToDB(_cacheKey('series_cache_v4', list), data),
    clearSeriesCache: (list) => (typeof list === 'string' ? _clearByPrefix(`series_cache_v4_${list}`) : _delFromDB(_cacheKey('series_cache_v4', list))),
  };
}
