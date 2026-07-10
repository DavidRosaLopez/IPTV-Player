/**
 * playlist.js - Catalog, filtering and search facade
 */
import { Watching } from './watching.js';
import { loadXtream as _loadXtream, loadVod as _loadVod, loadSeries as _loadSeries, loadM3U as _loadM3U } from './services/playlist-service.js';

export const Playlist = (() => {
  const VOD_GROUPS = [
    { id: '__all__', name: '<span class="material-symbols-rounded">movie</span> Películas' },
    { id: '__favs__', name: '<span class="material-symbols-rounded">favorite</span> Favoritos' },
    { id: '__watching__', name: '<span class="material-symbols-rounded">play_circle</span> Seguir viendo' }
  ];
  const SERIES_GROUPS = [
    { id: '__all__', name: '<span class="material-symbols-rounded">live_tv</span> Series' },
    { id: '__favs__', name: '<span class="material-symbols-rounded">favorite</span> Favoritos' },
    { id: '__watching__', name: '<span class="material-symbols-rounded">play_circle</span> Seguir viendo' }
  ];
  const GLOBAL_GROUPS = new Set([
    '✨ Últimos Estrenos',
    '💎 Calidad 4K / UHD',
    '💎 Series en 4K / UHD',
    '__folder_plataformas__',
    '🍿 Plataformas',
    '🟥 Netflix',
    '🟣 HBO Max',
    '🟦 Amazon Prime',
    '✨ Disney+',
    '🍏 Apple TV+',
    'Ⓜ️ Movistar+',
    '⛰️ Paramount+',
    '📺 Nacionales / Otras Apps'
  ]);

  function _normalize(str) {
    return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function _groupSortKey(rawName) {
    return _normalize(String(rawName || '').replace(/<span[^>]*>.*?<\/span>\s*/g, ''))
      .replace(/^[^a-z0-9]+/i, '')
      .trim();
  }

  let _groupIndex = new Map();
  let _indexedChannels = null;
  let _visibleCache = null;

  function _buildGroupIndex(channels) {
    if (_indexedChannels === channels) return;
    _groupIndex = new Map();
    for (const ch of channels) {
      if (!_groupIndex.has(ch.group)) _groupIndex.set(ch.group, []);
      _groupIndex.get(ch.group).push(ch);
    }
    _indexedChannels = channels;
  }

  function invalidateIndex() {
    _indexedChannels = null;
  }

  function _groupsForTab(tabId) {
    if (tabId === 'vod') return VOD_GROUPS;
    if (tabId === 'series') return SERIES_GROUPS;
    return null;
  }

  function getVisibleChannels(channels, countryCode = 'ALL') {
    if (countryCode === 'ALL') return channels;
    if (_visibleCache && _visibleCache.channels === channels && _visibleCache.countryCode === countryCode) {
      return _visibleCache.list;
    }
    const list = channels.filter(c => isItemVisibleInCountry(c, countryCode));
    _visibleCache = { channels, countryCode, list };
    return list;
  }

  function search(channels, query) {
    if (!query) return channels;
    const qTokens = _normalize(query).split(' ').filter(Boolean);
    return channels.filter(c => {
      const s = c._search || _normalize(c.name);
      return qTokens.every(t => s.includes(t));
    });
  }

  function isGlobalGroup(groupName) {
    return GLOBAL_GROUPS.has(groupName);
  }

  function isItemVisibleInCountry(ch, countryCode) {
    if (countryCode === 'ALL') return true;
    if (ch.countryCode === countryCode) return true;
    if (isGlobalGroup(ch.group) && (ch.countryCode === 'OTROS' || ch.countryCode === 'US' || ch.countryCode === 'LAT' || ch.countryCode === 'ES')) {
      if (ch.countryCode === 'OTROS' || ch.countryCode === 'US') return true;
    }
    return false;
  }

  let _groupCache = {};

  function getGroups(channels, countryCode = 'ALL', tabId = 'tv') {
    const tabGroups = _groupsForTab(tabId);
    if (tabGroups) return tabGroups;

    const cacheKey = `${countryCode}_${tabId}`;
    if (_groupCache[cacheKey]) return _groupCache[cacheKey];

    const FOLDERS = {
      '__folder_plataformas__': {
        name: '🍿 Plataformas',
        children: ['🟥 Netflix', '🟣 HBO Max', '🟦 Amazon Prime', '✨ Disney+', '🍏 Apple TV+', 'Ⓜ️ Movistar+', '⛰️ Paramount+', '📺 Nacionales / Otras Apps']
      }
    };

    const childToFolder = {};
    for (const [fId, f] of Object.entries(FOLDERS)) {
      f.children.forEach(c => childToFolder[c] = fId);
    }

    const seen = new Set();
    const seenFolders = new Set();
    const dynamicGroups = [];
    const list = getVisibleChannels(channels, countryCode);

    const staticGroups = [
      { id: '__all__', name: '<span class="material-symbols-rounded">tv</span> Canales' },
      { id: '__favs__', name: '<span class="material-symbols-rounded">favorite</span> Favoritos' }
    ];

    for (const ch of list) {
      if (seen.has(ch.group)) continue;
      seen.add(ch.group);
      const parentId = childToFolder[ch.group];
      if (parentId) {
        if (!seenFolders.has(parentId)) {
          seenFolders.add(parentId);
          dynamicGroups.push({ id: parentId, name: FOLDERS[parentId].name, isFolder: true });
        }
        dynamicGroups.push({ id: ch.group, name: ch.group, parentId });
      } else {
        dynamicGroups.push({ id: ch.group, name: ch.group });
      }
    }

    dynamicGroups.sort((a, b) => {
      const aBucket = a.parentId ? _groupSortKey(FOLDERS[a.parentId]?.name || a.name) : _groupSortKey(a.name);
      const bBucket = b.parentId ? _groupSortKey(FOLDERS[b.parentId]?.name || b.name) : _groupSortKey(b.name);
      if (aBucket !== bBucket) return aBucket.localeCompare(bBucket, 'es');
      if (Boolean(a.isFolder) !== Boolean(b.isFolder)) return a.isFolder ? -1 : 1;
      return _groupSortKey(a.name).localeCompare(_groupSortKey(b.name), 'es');
    });

    return (_groupCache[cacheKey] = [...staticGroups, ...dynamicGroups]);
  }

  function clearGroupCache() {
    _groupCache = {};
    invalidateIndex();
    _filterCache.clear();
    _visibleCache = null;
  }

  function filterByGroup(channels, groupId, favIds, countryCode = 'ALL') {
    _buildGroupIndex(channels);
    const favKey = Array.isArray(favIds) ? favIds.join(',') : Array.from(favIds || []).join(',');
    const watchingKey = groupId === '__watching__' ? Watching.getIds().join(',') : '';
    const cacheKey = `${groupId}|${countryCode}|${favKey}|${watchingKey}`;
    const cached = _filterCache.get(cacheKey);
    if (cached) return cached;

    let result;
    const visibleChannels = getVisibleChannels(channels, countryCode);
    if (groupId === '__favs__') {
      result = visibleChannels.filter(c => favIds && favIds.has(c.id));
      _filterCache.set(cacheKey, result);
      return result;
    }

    if (groupId === '__watching__') {
      const watchingIds = Watching.getIds();
      const idMap = new Map(watchingIds.map((id, index) => [id, index]));
      result = visibleChannels.filter(c => idMap.has(c.id)).sort((a, b) => idMap.get(a.id) - idMap.get(b.id));
      _filterCache.set(cacheKey, result);
      return result;
    }

    if (groupId === '__all__') {
      result = visibleChannels;
      _filterCache.set(cacheKey, result);
      return result;
    }

    const groupChannels = _groupIndex.get(groupId) || [];
    result = countryCode === 'ALL' ? groupChannels : groupChannels.filter(c => isItemVisibleInCountry(c, countryCode));
    _filterCache.set(cacheKey, result);
    return result;
  }

  const LRU_MAX = 100;
  function _makeLRU() {
    const cache = new Map();
    return {
      get(key) {
        if (!cache.has(key)) return undefined;
        const val = cache.get(key);
        cache.delete(key);
        cache.set(key, val);
        return val;
      },
      set(key, val) {
        if (cache.has(key)) cache.delete(key);
        else if (cache.size >= LRU_MAX) cache.delete(cache.keys().next().value);
        cache.set(key, val);
      },
      has(key) { return cache.has(key); },
      clear() { cache.clear(); }
    };
  }

  const _filterCache = _makeLRU();
  const _infoCache = { vod: _makeLRU(), series: _makeLRU() };

  async function _fetchInfo(cache, url, signal) {
    if (cache.has(url)) return cache.get(url);
    const data = await fetch(url, { cache: 'no-store', signal }).then(r => r.ok ? r.json() : null).catch(e => {
      if (e.name === 'AbortError') throw e;
      return null;
    });
    if (data) cache.set(url, data);
    return data;
  }

  async function getVodInfo(server, user, pass, vod_id, signal) {
    const base = `${server}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;
    return _fetchInfo(_infoCache.vod, `${base}&action=get_vod_info&vod_id=${vod_id}`, signal);
  }

  async function getSeriesInfo(server, user, pass, series_id, signal) {
    const base = `${server}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;
    return _fetchInfo(_infoCache.series, `${base}&action=get_series_info&series_id=${series_id}`, signal);
  }

  async function loadXtream(server, user, pass, onProgress, signal) { return _loadXtream(server, user, pass, onProgress, signal); }
  async function loadVod(server, user, pass, onProgress, signal) { return _loadVod(server, user, pass, onProgress, signal); }
  async function loadSeries(server, user, pass, onProgress, signal) { return _loadSeries(server, user, pass, onProgress, signal); }
  async function loadM3U(url, onProgress, signal) { return _loadM3U(url, onProgress, signal); }

  return {
    loadXtream,
    loadVod,
    loadSeries,
    loadM3U,
    search,
    filterByGroup,
    getVisibleChannels,
    getGroups,
    clearGroupCache,
    getVodInfo,
    getSeriesInfo,
    isGlobalGroup,
    isItemVisibleInCountry,
    invalidateIndex
  };
})();
