/**
 * storage.js - storage facade
 */
import { Store } from './store.js';
import { createPrefsStorage } from './services/storage-prefs.js';
import { createCacheStorage } from './services/storage-cache.js';
import { StorageProgress } from './services/storage-progress.js';

const _getCurrentListId = (listId = null) => {
  if (listId) return listId;
  if (typeof Store !== 'undefined') {
    const list = Store.peek('currentList');
    if (list && list.id) return list.id;
  }
  return 'default';
};

const Prefs = createPrefsStorage(_getCurrentListId);
const Cache = createCacheStorage();

export const Storage = {
  get: (key, fallback = null) => {
    try {
      const v = localStorage.getItem(`iptv_${key}`);
      return v !== null ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  set: (key, val) => {
    try {
      localStorage.setItem(`iptv_${key}`, JSON.stringify(val));
      return true;
    } catch {
      return false;
    }
  },
  del: (key) => localStorage.removeItem(`iptv_${key}`),
  ...Prefs,
  ...Cache,
  ...StorageProgress,
  Prefs,
  Cache,
  Progress: StorageProgress,
};
