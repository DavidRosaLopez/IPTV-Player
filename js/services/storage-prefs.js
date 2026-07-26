import { createJsonStorage } from './storage-json.js';

const { get: _get, set: _set, del: _del } = createJsonStorage();

export function createPrefsStorage(getCurrentListId) {
  return {
    getLists: () => _get('lists', []),
    saveLists: (lists) => _set('lists', lists),
    getFavs: (listId) => {
      if (!listId) return _get('favorites', []);
      return _get('favorites_' + listId, []);
    },
    saveFavs: (listId, favs) => {
      if (!listId) return _set('favorites', favs);
      return _set('favorites_' + listId, favs);
    },
    getLastList: () => _get('last_list', null),
    setLastList: (id) => _set('last_list', id),
    getDefaultList: () => _get('default_list', null),
    setDefaultList: (id) => _set('default_list', id),
    getLastChannel: (listId = null) => _get('last_channel_' + getCurrentListId(listId), null),
    setLastChannel: (id, listId = null) => _set('last_channel_' + getCurrentListId(listId), id),
    getLastViewState: (listId = null) => _get('last_view_state_' + getCurrentListId(listId), null),
    setLastViewState: (state, listId = null) => _set('last_view_state_' + getCurrentListId(listId), state),
    getVisibleCountries: () => _get('visible_countries', null),
    setVisibleCountries: (list) => _set('visible_countries', list),
  };
}
