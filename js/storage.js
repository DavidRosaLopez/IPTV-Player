/**
 * storage.js — localStorage abstraction
 */
const Storage = (() => {
  const PREFIX = 'iptv_';

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
  const getFavs     = ()      => get('favorites', []);
  const saveFavs    = (favs)  => set('favorites', favs);

  const getLastList = ()      => get('last_list', null);
  const setLastList = (id)    => set('last_list', id);
  const getLastChannel = ()   => get('last_channel', null);
  const setLastChannel = (id) => set('last_channel', id);

  // ── Channel cache (TTL: 6 hours) ──────────────────────
  const CHANNEL_TTL = 6 * 3600 * 1000;
  const _cacheKey = (listId) => 'ch_cache_' + listId;
  const getChannelCache = (listId) => {
    const v = get(_cacheKey(listId), null);
    if (!v || (Date.now() - v.ts) > CHANNEL_TTL) return null;
    return v.data;
  };
  const setChannelCache = (listId, data) => set(_cacheKey(listId), { ts: Date.now(), data });
  const clearChannelCache = (listId) => del(_cacheKey(listId));

  return { get, set, del, getLists, saveLists, getFavs, saveFavs, getLastList, setLastList, getLastChannel, setLastChannel, getChannelCache, setChannelCache, clearChannelCache };
})();
