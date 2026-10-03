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

export async function ensureTabData(tabId, list, signal, onProgress = null) {
  const fresh = await _loadFresh(tabId, list, signal, onProgress);
  _throwIfAborted(signal);
  return fresh;
}
