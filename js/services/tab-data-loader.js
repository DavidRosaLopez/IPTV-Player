import { Storage } from '../storage.js';
import { Playlist } from '../playlist.js';

export async function loadTabData(tabId, list, signal, onProgress = null) {
  if (tabId === 'tv') {
    return Storage.getChannelCache(list) || [];
  }

  if (tabId === 'vod') {
    let cached = await Storage.getVodCache(list);
    if (cached && cached.length > 0) return cached;
    cached = await Playlist.loadVod(list.server, list.user, list.pass, onProgress, signal);
    if (cached && cached.length > 0) await Storage.setVodCache(list, cached);
    return cached || [];
  }

  if (tabId === 'series') {
    let cached = await Storage.getSeriesCache(list);
    if (cached && cached.length > 0) return cached;
    cached = await Playlist.loadSeries(list.server, list.user, list.pass, onProgress, signal);
    if (cached && cached.length > 0) await Storage.setSeriesCache(list, cached);
    return cached || [];
  }

  return [];
}
