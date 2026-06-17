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

  return { get, set, del, getLists, saveLists, getFavs, saveFavs, getLastList, setLastList, getDefaultList, setDefaultList, getLastChannel, setLastChannel, getChannelCache, setChannelCache, clearChannelCache, getVisibleCountries, setVisibleCountries };
})();

