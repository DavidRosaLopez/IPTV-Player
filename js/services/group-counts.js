import { Playlist } from '../playlist.js';
import { Favorites } from '../favorites.js';
import { Watching } from '../watching.js';

let _cache = null;

export function getGroupCounts(channels, currentCountry, currentTab, listId = null, favIds = [], watchingIds = []) {
  const favKey = Favorites.getVersion();
  const watchingKey = Watching.getVersion();
  const cacheKey = `${currentCountry}|${currentTab}|${listId || ''}|${favKey}|${watchingKey}`;
  if (_cache && _cache.channelsRef === channels && _cache.key === cacheKey) return _cache.counts;

  const favSet = new Set(favIds);
  const watchingSet = new Set(watchingIds);
  const counts = { '__all__': 0, '__favs__': 0, '__watching__': 0 };
  const visibleChannels = Playlist.getVisibleChannels(channels, currentCountry);

  for (const ch of visibleChannels) {
    counts.__all__++;
    counts[ch.group] = (counts[ch.group] || 0) + 1;
    if (favSet.has(ch.id)) counts.__favs__++;
    if (watchingSet.has(ch.id)) counts.__watching__++;
  }

  _cache = { channelsRef: channels, key: cacheKey, counts };
  return counts;
}

export function invalidateGroupCounts() {
  _cache = null;
}
