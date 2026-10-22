import { Playlist } from '../playlist.js';
import { Storage } from '../storage.js';

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

/**
 * Devuelve datos del tabId para la lista dada.
 * Para VOD y Series usa la caché de IndexedDB (TTL 6h) para arranque instantáneo.
 * TV siempre se recarga fresco (la caché la gestiona el propio Playlist/list-loader).
 */
export async function ensureTabData(tabId, list, signal, onProgress = null) {
  // TV: sin caché adicional aquí (list-loader ya gestiona su restauración)
  if (tabId === 'tv') {
    const fresh = await _loadFresh(tabId, list, signal, onProgress);
    _throwIfAborted(signal);
    return fresh;
  }

  // VOD / Series: intentar caché primero
  const getCached = tabId === 'vod' ? Storage.getVodCache : Storage.getSeriesCache;
  const setCached = tabId === 'vod' ? Storage.setVodCache : Storage.setSeriesCache;

  const cached = await getCached(list);
  if (cached && cached.length > 0) {
    // Notificar progreso inmediato con datos cacheados
    if (onProgress) onProgress(100);
    _throwIfAborted(signal);
    // Refrescar en segundo plano sin bloquear UI
    _refreshInBackground(tabId, list, setCached);
    return cached;
  }

  // Sin caché: carga normal
  const fresh = await _loadFresh(tabId, list, signal, onProgress);
  _throwIfAborted(signal);
  if (fresh && fresh.length > 0) {
    setCached(list, fresh).catch(() => {});
  }
  return fresh;
}

async function _refreshInBackground(tabId, list, setCached) {
  try {
    const fresh = await _loadFresh(tabId, list, null, null);
    if (fresh && fresh.length > 0) {
      await setCached(list, fresh);
    }
  } catch {
    // Fallo silencioso en segundo plano
  }
}
