/**
 * playlist.js - Catalog, filtering and search facade
 */
import { Watching } from './watching.js';
import { Favorites } from './favorites.js';
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

  function _isOtrasGroup(name) {
    return _groupSortKey(name) === 'otras';
  }

  function _isLatestGroup(name) {
    return _groupSortKey(name) === 'ultimos estrenos';
  }

  function _is4kGroup(name) {
    const n = _groupSortKey(name);
    return n.includes('4k / uhd') || n.includes('4k uhd') || n.includes('series en 4k') || n.includes('calidad 4k');
  }

  function _isPlatformGroup(name) {
    return ['netflix', 'hbo max', 'amazon prime', 'disney+', 'apple tv+', 'movistar+', 'paramount+']
      .includes(_groupSortKey(name));
  }

  function _vodSeriesGroupRank(name, tabId) {
    const n = _groupSortKey(name);
    if (n === 'ultimos estrenos') return 0;
    if (n === 'calidad 4k / uhd' || n === 'series en 4k / uhd') return 1;
    if (n === 'plataformas') return 2;
    if (n === 'nacionales / otras apps') return 3;
    if (tabId === 'series' && n === 'telenovelas y turcas') return 4;
    if (n === 'infantil y animacion') return 5;
    if (tabId === 'series' && n === 'anime') return 6;
    if (n === 'accion y aventuras') return 7;
    if (n === 'ciencia ficcion y fantasia') return 8;
    if (n === 'comedia') return 9;
    if (n === 'terror y suspense') return 10;
    if (n === 'drama y romance') return 11;
    if (n === 'documentales') return 12;
    if (tabId === 'vod' && n === 'clasicos y colecciones') return 13;
    if (n === 'musica y conciertos') return 14;
    if (tabId === 'vod' && n === 'western') return 15;
    if (tabId === 'vod' && n === 'especial navidad') return 16;
    if (tabId === 'vod' && n === 'deportes en diferido') return 17;
    if (tabId === 'series' && n === 'reality shows') return 13;
    if (tabId === 'series' && n === 'series generales') return 99;
    if (_isOtrasGroup(name)) return 999;
    return 50;
  }

  function _recencyKey(ch) {
    if (!ch) return 0;
    if (Number.isFinite(ch._added) && ch._added > 0) return ch._added;
    if (Number.isFinite(ch._year) && ch._year > 0) return ch._year;
    return 0;
  }

  let _groupIndex = new Map();
  let _indexedChannels = null;
  let _groupCache = new WeakMap();
  let _visibleCache = new WeakMap();

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
    _groupIndex = new Map();
  }

  function _groupsForTab(tabId) {
    if (tabId === 'vod') return VOD_GROUPS;
    if (tabId === 'series') return SERIES_GROUPS;
    return null;
  }

  function getVisibleChannels(channels, countryCode = 'ALL') {
    if (countryCode === 'ALL') return channels;
    let cache = _visibleCache.get(channels);
    if (!cache) {
      cache = new Map();
      _visibleCache.set(channels, cache);
    }
    if (cache.has(countryCode)) return cache.get(countryCode);
    const list = channels.filter(c => isItemVisibleInCountry(c, countryCode));
    cache.set(countryCode, list);
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
    // Los grupos globales deben seguir apareciendo aunque el canal venga etiquetado como genérico.
    if (isGlobalGroup(ch.group) && ['OTROS', 'US', 'LAT', 'ES'].includes(ch.countryCode)) return true;
    return false;
  }

  function getGroups(channels, countryCode = 'ALL', tabId = 'tv') {
    if (tabId === 'vod' || tabId === 'series') {
      let cache = _groupCache.get(channels);
      if (!cache) {
        cache = new Map();
        _groupCache.set(channels, cache);
      }
      const cacheKey = `${countryCode}_${tabId}`;
      if (cache.has(cacheKey)) return cache.get(cacheKey);

      const staticGroups = _groupsForTab(tabId);
      const list = getVisibleChannels(channels, countryCode);
      const seen = new Map();
      for (const ch of list) {
        const group = ch.group || 'Sin categoría';
        const score = _recencyKey(ch);
        const prev = seen.get(group);
        if (!prev || score > prev.score) seen.set(group, { score, group });
      }

      const dynamicGroups = Array.from(seen.values())
        .sort((a, b) => {
          const rankA = _vodSeriesGroupRank(a.group, tabId);
          const rankB = _vodSeriesGroupRank(b.group, tabId);
          if (rankA !== rankB) return rankA - rankB;
          if (b.score !== a.score) return b.score - a.score;
          return _groupSortKey(a.group).localeCompare(_groupSortKey(b.group), 'es');
        })
        .map(g => ({ id: g.group, name: g.group }));

      const platformFolder = { id: '__folder_plataformas__', name: '🍿 Plataformas', isFolder: true };
      const platformChildren = new Set(['🟥 Netflix', '🟣 HBO Max', '🟦 Amazon Prime', '✨ Disney+', '🍏 Apple TV+', 'Ⓜ️ Movistar+', '⛰️ Paramount+']);
      const withParents = dynamicGroups.map(g => (platformChildren.has(g.name) ? { ...g, parentId: platformFolder.id } : g));
      const groups = [];
      const used = new Set();
      const push = (g) => {
        if (!g || used.has(g.id)) return;
        used.add(g.id);
        groups.push(g);
      };
      const pushBy = (label) => withParents.filter(g => _groupSortKey(g.name) === label).forEach(push);

      staticGroups.forEach(push);
      pushBy('ultimos estrenos');
      pushBy('calidad 4k / uhd');
      push(platformFolder);
      withParents.filter(g => g.parentId === platformFolder.id).forEach(push);

      if (tabId === 'series') {
        pushBy('nacionales / otras apps');
        pushBy('infantil y animacion');
        pushBy('anime');
        pushBy('documentales');
        pushBy('reality shows');
        pushBy('accion y aventuras');
        pushBy('ciencia ficcion y fantasia');
        pushBy('comedia');
        pushBy('terror y suspense');
        pushBy('drama y romance');
        pushBy('musica y conciertos');
        pushBy('series generales');
      } else {
        pushBy('nacionales / otras apps');
        pushBy('infantil y animacion');
        pushBy('accion y aventuras');
        pushBy('ciencia ficcion y fantasia');
        pushBy('comedia');
        pushBy('terror y suspense');
        pushBy('drama y romance');
        pushBy('documentales');
        pushBy('clasicos y colecciones');
        pushBy('musica y conciertos');
        pushBy('western');
        pushBy('especial navidad');
        pushBy('deportes en diferido');
      }
      if (tabId === 'vod') pushBy('otras');

      cache.set(cacheKey, groups);
      return groups;
    }

    let cache = _groupCache.get(channels);
    if (!cache) {
      cache = new Map();
      _groupCache.set(channels, cache);
    }
    const cacheKey = `${countryCode}_${tabId}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

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
      const rankA = _vodSeriesGroupRank(a.name);
      const rankB = _vodSeriesGroupRank(b.name);
      if (rankA !== rankB) return rankA - rankB;
      const aBucket = a.parentId ? _groupSortKey(FOLDERS[a.parentId]?.name || a.name) : _groupSortKey(a.name);
      const bBucket = b.parentId ? _groupSortKey(FOLDERS[b.parentId]?.name || b.name) : _groupSortKey(b.name);
      if (aBucket !== bBucket) return aBucket.localeCompare(bBucket, 'es');
      if (Boolean(a.isFolder) !== Boolean(b.isFolder)) return a.isFolder ? -1 : 1;
      return _groupSortKey(a.name).localeCompare(_groupSortKey(b.name), 'es');
    });

    const groups = [...staticGroups, ...dynamicGroups];
    cache.set(cacheKey, groups);
    return groups;
  }

  function clearGroupCache() {
    _groupCache = new WeakMap();
    _visibleCache = new WeakMap();
    invalidateIndex();
  }

  const _filterCacheByChannels = new WeakMap();

  function filterByGroup(channels, groupId, favIds, countryCode = 'ALL') {
    _buildGroupIndex(channels);
    let cache = _filterCacheByChannels.get(channels);
    if (!cache) {
      cache = _makeLRU();
      _filterCacheByChannels.set(channels, cache);
    }
    const favKey = groupId === '__favs__' ? Favorites.getVersion() : '';
    const watchingKey = groupId === '__watching__' ? Watching.getVersion() : '';
    const cacheKey = `${groupId}|${countryCode}|${favKey}|${watchingKey}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    let result;
    const visibleChannels = getVisibleChannels(channels, countryCode);
    if (groupId === '__favs__') {
      const favSet = favIds instanceof Set ? favIds : new Set(favIds || []);
      result = visibleChannels.filter(c => favSet.has(c.id));
      cache.set(cacheKey, result);
      return result;
    }

    if (groupId === '__watching__') {
      const watchingIds = Watching.getSet ? Watching.getSet() : Watching.getIds();
      const watchingList = watchingIds instanceof Set ? Array.from(watchingIds) : watchingIds;
      const idMap = new Map(watchingList.map((id, index) => [id, index]));
      result = visibleChannels.filter(c => idMap.has(c.id)).sort((a, b) => idMap.get(a.id) - idMap.get(b.id));
      cache.set(cacheKey, result);
      return result;
    }

    if (groupId === '__all__') {
      result = visibleChannels;
      cache.set(cacheKey, result);
      return result;
    }

    const groupChannels = _groupIndex.get(groupId) || [];
    result = countryCode === 'ALL' ? groupChannels : groupChannels.filter(c => isItemVisibleInCountry(c, countryCode));
    cache.set(cacheKey, result);
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
