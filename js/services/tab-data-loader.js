import { Storage } from '../storage.js';
import { Playlist } from '../playlist.js';

function _throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

async function _loadFresh(tabId, list, signal, onProgress = null) {
  if (tabId === 'tv') {
    return list.type === 'xtream'
      ? (await Playlist.loadXtream(list.server, list.user, list.pass, onProgress, signal)).channels || []
      : await Playlist.loadM3U(list.url, onProgress, signal);
  }

  if (tabId === 'vod') {
    return (await Playlist.loadVod(list.server, list.user, list.pass, onProgress, signal)) || [];
  }

  if (tabId === 'series') {
    return (await Playlist.loadSeries(list.server, list.user, list.pass, onProgress, signal)) || [];
  }

  return [];
}

export async function loadTabData(tabId, list, signal, onProgress = null) {
  return ensureTabData(tabId, list, signal, onProgress);
}

export async function ensureTabData(tabId, list, signal, onProgress = null, { forceReload = false } = {}) {
  const cacheLoader = tabId === 'tv'
    ? Storage.getChannelCache
    : tabId === 'vod'
      ? Storage.getVodCache
      : Storage.getSeriesCache;
  const cacheSaver = tabId === 'tv'
    ? Storage.setChannelCache
    : tabId === 'vod'
      ? Storage.setVodCache
      : Storage.setSeriesCache;

  if (!forceReload) {
    const cached = await cacheLoader(list);
    _throwIfAborted(signal);
    if (cached && cached.length > 0) return cached;
  }

  const fresh = await _loadFresh(tabId, list, signal, onProgress);
  _throwIfAborted(signal);
  if (fresh.length > 0) await cacheSaver(list, fresh);
  return fresh;
}
