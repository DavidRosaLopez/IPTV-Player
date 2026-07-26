const DEFAULT_PREFIX = 'iptv_';

export function createJsonStorage(prefix = DEFAULT_PREFIX) {
  function get(key, fallback = null) {
    try {
      const v = localStorage.getItem(prefix + key);
      return v !== null ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  }

  function set(key, val) {
    try {
      localStorage.setItem(prefix + key, JSON.stringify(val));
      return true;
    } catch {
      return false;
    }
  }

  function del(key) {
    localStorage.removeItem(prefix + key);
  }

  return { get, set, del };
}
