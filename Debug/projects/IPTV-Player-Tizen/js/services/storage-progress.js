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

export const StorageProgress = {
  getEpisodeProgress: (epId) => _get('ep_prog_' + epId, null),
  setEpisodeProgress: (epId, ms) => _set('ep_prog_' + epId, ms),
  clearEpisodeProgress: (epId) => _del('ep_prog_' + epId),
};
