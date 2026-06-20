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

