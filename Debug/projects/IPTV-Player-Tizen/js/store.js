/**
 * store.js — Centralized State Manager
 */
export const Store = (() => {
  const state = {
    channels: [],
    groups: [],
    currentGroup: '__all__',
    currentList: null,
    currentCountry: 'ALL',
    countries: []
  };

  const listeners = new Map();

  function _clone(val) {
    if (Array.isArray(val)) return [...val];
    if (val !== null && typeof val === 'object') return { ...val };
    return val;
  }

  function _notify(key, val) {
    const list = listeners.get(key);
    if (!list) return;
    list.slice().forEach(cb => {
      try { cb(val); } catch (e) { console.error(e); }
    });
  }

  return {
    get: (key) => {
      return _clone(state[key]);
    },
    peek: (key) => state[key],
    set: (key, val) => { 
      state[key] = val; 
      _notify(key, val);
    },
    subscribe: (key, cb) => {
      const list = listeners.get(key) || [];
      list.push(cb);
      listeners.set(key, list);
      return () => {
        const next = (listeners.get(key) || []).filter(item => item !== cb);
        if (next.length) listeners.set(key, next);
        else listeners.delete(key);
      };
    },
    getAll: () => {
      const copy = {};
      for (const k in state) {
        copy[k] = _clone(state[k]);
      }
      return copy;
    },
    clearListeners: () => listeners.clear()
  };
})();
