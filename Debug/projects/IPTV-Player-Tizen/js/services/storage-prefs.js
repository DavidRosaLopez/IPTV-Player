const PREFIX = 'iptv_';

function _get(key, fallback = null) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v !== null ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function _set(key, val) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(val));
    return true;
  } catch {
    return false;
  }
}

function _del(key) {
  localStorage.removeItem(PREFIX + key);
}

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
    getVisibleCountries: () => _get('visible_countries', null),
    setVisibleCountries: (list) => _set('visible_countries', list),
  };
}
