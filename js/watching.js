import { Store } from './store.js';
import { Storage } from './storage.js';

export const Watching = (() => {
  function _getKey(listId = null) {
    const resolvedListId = listId || (Store.get('currentList')?.id || 'default');
    return `${resolvedListId}_watching_series`;
  }

  function getItems(listId = null) {
    return Storage.get(_getKey(listId)) || [];
  }

  function getIds(listId = null) {
    return getItems(listId).map(item => typeof item === 'string' ? item : item.id);
  }

  function add(ch, ep = null, listId = null) {
    const key = _getKey(listId);
    let items = getItems(listId);
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

  function updateProgress(seriesId, epId, ms, listId = null) {
    const key = _getKey(listId);
    const items = getItems(listId);
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

  function isWatching(id, listId = null) {
    return getIds(listId).includes(id);
  }

  return { getIds, getItems, add, isWatching, updateProgress };
})();
