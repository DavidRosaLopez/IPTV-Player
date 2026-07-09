import { Storage } from '../storage.js';
import { Playlist } from '../playlist.js';

function _throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

async function _loadAndCache(tabId, list, signal, onProgress = null) {
  if (tabId === 'tv') {
    return Storage.getChannelCache(list) || [];
  }

  if (tabId === 'vod') {
    let cached = await Storage.getVodCache(list);
    _throwIfAborted(signal);
    if (cached && cached.length > 0) return cached;
    cached = await Playlist.loadVod(list.server, list.user, list.pass, onProgress, signal);
    _throwIfAborted(signal);
    if (cached && cached.length > 0) await Storage.setVodCache(list, cached);
    return cached || [];
  }

  if (tabId === 'series') {
    let cached = await Storage.getSeriesCache(list);
    _throwIfAborted(signal);
    if (cached && cached.length > 0) return cached;
    cached = await Playlist.loadSeries(list.server, list.user, list.pass, onProgress, signal);
    _throwIfAborted(signal);
    if (cached && cached.length > 0) await Storage.setSeriesCache(list, cached);
    return cached || [];
  }

  return [];
}

export async function loadTabData(tabId, list, signal, onProgress = null) {
  return _loadAndCache(tabId, list, signal, onProgress);
}

export async function ensureTabData(tabId, list, signal, onProgress = null, { forceReload = false } = {}) {
  if (tabId === 'tv') {
    if (!forceReload) {
      const cached = await Storage.getChannelCache(list);
      _throwIfAborted(signal);
      if (cached && cached.length > 0) return cached;
    }
    const channels = list.type === 'xtream'
      ? (await Playlist.loadXtream(list.server, list.user, list.pass, onProgress, signal)).channels || []
      : await Playlist.loadM3U(list.url, onProgress, signal);
    _throwIfAborted(signal);
    if (channels.length > 0) await Storage.setChannelCache(list, channels);
    return channels;
  }

  if (!forceReload) {
    const cached = tabId === 'vod' ? await Storage.getVodCache(list) : await Storage.getSeriesCache(list);
    _throwIfAborted(signal);
    if (cached && cached.length > 0) return cached;
  }

  return _loadAndCache(tabId, list, signal, onProgress);
}
