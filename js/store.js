/**
 * store.js — Centralized State Manager
 */
const Store = (() => {
  let state = {
    channels: [],
    groups: [],
    currentGroup: '__all__',
    currentList: null,
    groupCountsCache: null,
    currentCountry: 'ALL',
    countries: []
  };

  let listeners = {};

  return {
    get: (key) => {
      const val = state[key];
      if (Array.isArray(val)) return [...val];
      if (val !== null && typeof val === 'object') return { ...val };
      return val;
    },
    set: (key, val) => { 
      state[key] = val; 
      if (listeners[key]) {
        listeners[key].forEach(cb => { try { cb(val); } catch(e) { console.error(e); } });
      }
    },
    subscribe: (key, cb) => {
      if (!listeners[key]) listeners[key] = [];
      listeners[key].push(cb);
      return () => {
        listeners[key] = listeners[key].filter(item => item !== cb);
      };
    },
    getAll: () => {
      const copy = {};
      for (const k in state) {
        const val = state[k];
        if (Array.isArray(val)) copy[k] = [...val];
        else if (val !== null && typeof val === 'object') copy[k] = { ...val };
        else copy[k] = val;
      }
      return copy;
    }
  };
})();
