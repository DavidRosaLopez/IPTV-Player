import { Store } from './store.js';
import { Storage } from './storage.js';

export const Watching = (() => {
  function _getKey() {
    const list = Store.get('currentList');
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

    items = items.filter(item => {
      const id = typeof item === 'string' ? item : item.id;
      return id !== idToFind;
    });

    const epId = ep ? `ep_${ep.id}` : null;
    const progressMs = epId ? (Storage.getEpisodeProgress(epId) || null) : null;

    items.unshift({
      id: idToFind,
      ep,
      progressMs
    });

    Storage.set(key, items);
  }

  function updateProgress(seriesId, epId, ms) {
    const key = _getKey();
    const items = getItems();
    const idx = items.findIndex(item => {
      const id = typeof item === 'string' ? item : item.id;
      return id === seriesId;
    });

    if (idx !== -1 && typeof items[idx] === 'object') {
      items[idx].progressMs = ms;
      items[idx].epId = epId;
      Storage.set(key, items);
    }
  }

  function isWatching(id) {
    return getIds().includes(id);
  }

  return { getIds, getItems, add, isWatching, updateProgress };
})();
