/**
 * favorites.js — Favorite channels management (list-specific)
 */
const Favorites = (() => {
  function _getKey() {
    const list = typeof Store !== 'undefined' ? Store.get('currentList') : null;
    const listId = list ? list.id : 'default';
    const tabId = typeof Store !== 'undefined' ? (Store.get('currentTab') || 'tv') : 'tv';
    return `${listId}_${tabId}`;
  }

  function getIds() {
    return Storage.getFavs(_getKey()) || [];
  }

  function toggle(channelId) {
    const key = _getKey();
    const favs = new Set(Storage.getFavs(key) || []);
    let added = false;
    if (favs.has(channelId)) {
      favs.delete(channelId);
    } else {
      favs.add(channelId);
      added = true;
    }
    Storage.saveFavs(key, Array.from(favs));
    return added;
  }

  function isFav(channelId) {
    const favs = new Set(getIds());
    return favs.has(channelId);
  }

  return { init: () => {}, toggle, isFav, getIds };
})();

const Watching = (() => {
  function _getKey() {
    const list = typeof Store !== 'undefined' ? Store.get('currentList') : null;
    const listId = list ? list.id : 'default';
    return `${listId}_watching_series`;
  }

  function getIds() {
    return Storage.get(_getKey()) || [];
  }

  function add(seriesId) {
    const key = _getKey();
    const watching = new Set(Storage.get(key) || []);
    if (watching.has(seriesId)) {
      watching.delete(seriesId);
    }
    const arr = Array.from(watching);
    arr.unshift(seriesId);
    Storage.set(key, arr);
  }

  function isWatching(seriesId) {
    const watching = new Set(getIds());
    return watching.has(seriesId);
  }

  return { getIds, add, isWatching };
})();

