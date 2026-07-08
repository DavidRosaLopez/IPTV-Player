/**
 * playlist.js - Catalog, filtering and search facade
 */
import { Watching } from './watching.js';
import { loadXtream as _loadXtream, loadVod as _loadVod, loadSeries as _loadSeries, loadM3U as _loadM3U } from './services/playlist-service.js';

export const Playlist = (() => {
  const VOD_GROUPS = [
    { id: '__all__', name: '<span class="material-symbols-rounded">movie</span> PelÃ­culas' },
    { id: '__favs__', name: '<span class="material-symbols-rounded">favorite</span> Favoritos' },
    { id: '__watching__', name: '<span class="material-symbols-rounded">play_circle</span> Seguir viendo' }
  ];
  const SERIES_GROUPS = [
    { id: '__all__', name: '<span class="material-symbols-rounded">live_tv</span> Series' },
    { id: '__favs__', name: '<span class="material-symbols-rounded">favorite</span> Favoritos' },
    { id: '__watching__', name: '<span class="material-symbols-rounded">play_circle</span> Seguir viendo' }
  ];
  const GLOBAL_GROUPS = new Set([
    'âœ¨ Ãšltimos Estrenos',
    'ðŸ’Ž Calidad 4K / UHD',
    'ðŸ’Ž Series en 4K / UHD',
    '__folder_plataformas__',
    'ðŸ¿ Plataformas',
    'ðŸŸ¥ Netflix',
    'ðŸŸ£ HBO Max',
    'ðŸŸ¦ Amazon Prime',
    'âœ¨ Disney+',
    'ðŸ Apple TV+',
    'â“‚ï¸ Movistar+',
    'â›°ï¸ Paramount+',
    'ðŸ“º Nacionales / Otras Apps'
  ]);

  function _normalize(str) {
    return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  let _groupIndex = new Map();
  let _indexedChannels = null;
  function _buildGroupIndex(channels) {
    if (_indexedChannels === channels) return;
    _groupIndex = new Map();
    for (const ch of channels) {
      if (!_groupIndex.has(ch.group)) _groupIndex.set(ch.group, []);
      _groupIndex.get(ch.group).push(ch);
    }
    _indexedChannels = channels;
  }
  function invalidateIndex() { _indexedChannels = null; }

  function _groupsForTab(tabId) {
    if (tabId === 'vod') return VOD_GROUPS;
    if (tabId === 'series') return SERIES_GROUPS;
    return null;
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
    return new Set([
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
    ]).has(groupName);
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
    if (tabId === 'vod') {
      return [
        { id: '__all__', name: '<span class="material-symbols-rounded">movie</span> Películas' },
        { id: '__favs__', name: '<span class="material-symbols-rounded">favorite</span> Favoritos' },
        { id: '__watching__', name: '<span class="material-symbols-rounded">play_circle</span> Seguir viendo' }
      ];
    }
    if (tabId === 'series') {
      return [
        { id: '__all__', name: '<span class="material-symbols-rounded">live_tv</span> Series' },
        { id: '__favs__', name: '<span class="material-symbols-rounded">favorite</span> Favoritos' },
        { id: '__watching__', name: '<span class="material-symbols-rounded">play_circle</span> Seguir viendo' }
      ];
    }

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
    const list = channels.filter(c => isItemVisibleInCountry(c, countryCode));

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

    dynamicGroups.sort((a, b) => a.id.localeCompare(b.id));
    return (_groupCache[cacheKey] = [...staticGroups, ...dynamicGroups]);
  }

  function clearGroupCache() {
    _groupCache = {};
    invalidateIndex();
  }

  function filterByGroup(channels, groupId, favIds, countryCode = 'ALL') {
    _buildGroupIndex(channels);

    if (groupId === '__favs__') {
      const base = countryCode === 'ALL' ? channels : channels.filter(c => isItemVisibleInCountry(c, countryCode));
      return base.filter(c => favIds && favIds.has(c.id));
    }
    if (groupId === '__watching__') {
      const watchingIds = Watching.getIds();
      const idMap = new Map(watchingIds.map((id, index) => [id, index]));
      const base = countryCode === 'ALL' ? channels : channels.filter(c => isItemVisibleInCountry(c, countryCode));
      return base.filter(c => idMap.has(c.id)).sort((a, b) => idMap.get(a.id) - idMap.get(b.id));
    }
    if (groupId === '__all__') {
      return countryCode === 'ALL' ? channels : channels.filter(c => isItemVisibleInCountry(c, countryCode));
    }

    const groupChannels = _groupIndex.get(groupId) || [];
    return countryCode === 'ALL' ? groupChannels : groupChannels.filter(c => isItemVisibleInCountry(c, countryCode));
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
      has(key) { return cache.has(key); }
    };
  }
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
    getGroups,
    clearGroupCache,
    getVodInfo,
    getSeriesInfo,
    isGlobalGroup,
    isItemVisibleInCountry,
    invalidateIndex
  };
})();
