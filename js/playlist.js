/**
 * playlist.js — Xtream Codes API
 * Performance optimized for large playlists (10k+ channels)
 */
const Playlist = (() => {

  // ── SEARCH INDEX ─────────────────────────────────────
  function _normalize(str) {
    return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  // Pre-build normalized name for instant search
  function _buildSearchIndex(channels) {
    for (const ch of channels) {
      ch._search = _normalize(ch.name);
    }
    return channels;
  }

  // ── COUNTRY DETECTION ──────────────────────────────────
  const COUNTRY_MAP = {
    'ES': 'España',
    'US': 'USA',
    'USA': 'USA',
    'UK': 'UK',
    'GB': 'UK',
    'FR': 'Francia',
    'DE': 'Alemania',
    'GER': 'Alemania',
    'IT': 'Italia',
    'PT': 'Portugal',
    'AR': 'Árabe',
    'MX': 'México',
    'CO': 'Colombia',
    'CL': 'Chile',
    'PE': 'Perú',
    'VE': 'Venezuela',
    'BR': 'Brasil',
    'LAT': 'Latino',
    'TR': 'Turquía',
    'PL': 'Polonia',
    'RO': 'Rumania',
    'NL': 'Holanda',
    'BE': 'Bélgica',
    'CH': 'Suiza'
  };

  function detectCountry(name, group) {
    const cat = group || '';
    const chName = name || '';
    const prefixRegex = /^\[?([A-Z]{2,3})\]?[\s*|:.-]/i;
    
    let match = cat.match(prefixRegex) || chName.match(prefixRegex);
    if (match) {
      const code = match[1].toUpperCase();
      if (COUNTRY_MAP[code]) return code;
    }
    
    const catLower = cat.toLowerCase();
    if (catLower.includes('spain') || catLower.includes('españa') || catLower.includes('spanish')) return 'ES';
    if (catLower.includes('usa') || catLower.includes('united states') || catLower.includes('english')) return 'US';
    if (catLower.includes('france') || catLower.includes('french') || catLower.includes('francia')) return 'FR';
    if (catLower.includes('arab') || catLower.includes('arabic')) return 'AR';
    if (catLower.includes('germany') || catLower.includes('deutsch') || catLower.includes('germania')) return 'DE';
    if (catLower.includes('italy') || catLower.includes('italia') || catLower.includes('italian')) return 'IT';
    if (catLower.includes('portugal') || catLower.includes('portuguese')) return 'PT';
    if (catLower.includes('latino') || catLower.includes('latin') || catLower.includes('latam')) return 'LAT';
    
    return 'OTROS';
  }

  // ── XTREAM CODES ─────────────────────────────────────
  async function loadXtream(server, user, pass, onProgress, signal) {
    const base = `${server}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;

    if (onProgress) onProgress(10);
    const info = await _fetchJson(`${base}`, true, signal); // auth: always fresh
    if (!info || info.user_info?.auth === 0) throw new Error('Credenciales incorrectas');

    if (onProgress) onProgress(30);
    const [streams, cats] = await Promise.all([
      _fetchJson(`${base}&action=get_live_streams`, false, signal),    // browser-cached
      _fetchJson(`${base}&action=get_live_categories`, false, signal), // browser-cached
    ]);
    if (onProgress) onProgress(80);

    const catMap = {};
    (cats || []).forEach(c => { catMap[c.category_id] = c.category_name; });

    const channels = (streams || []).map((s, i) => {
      const groupName = catMap[s.category_id] || 'Sin categoría';
      return {
        id:          i,
        name:        s.name,
        _search:     _normalize(s.name),
        logo:        s.stream_icon || '',
        group:       groupName,
        countryCode: detectCountry(s.name, groupName),
        url:         `${server}/live/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${s.stream_id}.m3u8`,
        streamId:    s.stream_id
      };
    });

    if (onProgress) onProgress(100);
    return { channels, serverInfo: info.server_info };
  }

  async function _fetchJson(url, noCache = false, signal) {
    try {
      const res = await fetch(url, { cache: noCache ? 'no-store' : 'force-cache', signal });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }

  async function loadVod(server, user, pass, onProgress, signal) {
    const base = `${server}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;
    
    if (onProgress) onProgress(10);
    const [streams, cats] = await Promise.all([
      _fetchJson(`${base}&action=get_vod_streams`, false, signal),
      _fetchJson(`${base}&action=get_vod_categories`, false, signal)
    ]);
    if (onProgress) onProgress(80);

    const catMap = {};
    (cats || []).forEach(c => { catMap[c.category_id] = c.category_name; });

    const movies = (streams || []).map((s, i) => {
      const groupName = catMap[s.category_id] || 'Sin categoría';
      return {
        id:          `vod_${s.stream_id}`,
        name:        s.name,
        _search:     _normalize(s.name),
        logo:        s.stream_icon || '',
        group:       groupName,
        countryCode: 'VOD',
        url:         `${server}/movie/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${s.stream_id}.${s.container_extension || 'mp4'}`,
        streamId:    s.stream_id,
        type:        'vod'
      };
    });

    if (onProgress) onProgress(100);
    return movies;
  }

  async function loadSeries(server, user, pass, onProgress, signal) {
    const base = `${server}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;
    
    if (onProgress) onProgress(10);
    const [seriesList, cats] = await Promise.all([
      _fetchJson(`${base}&action=get_series`, false, signal),
      _fetchJson(`${base}&action=get_series_categories`, false, signal)
    ]);
    if (onProgress) onProgress(80);

    const catMap = {};
    (cats || []).forEach(c => { catMap[c.category_id] = c.category_name; });

    const series = (seriesList || []).map((s, i) => {
      const groupName = catMap[s.category_id] || 'Sin categoría';
      return {
        id:          `series_${s.series_id}`,
        name:        s.name,
        _search:     _normalize(s.name),
        logo:        s.cover || s.stream_icon || '',
        group:       groupName,
        countryCode: 'SERIES',
        // url is not available until we fetch series info, so this is just the entry
        streamId:    s.series_id,
        type:        'series'
      };
    });

    if (onProgress) onProgress(100);
    return series;
  }

  async function getVodInfo(server, user, pass, vod_id, signal) {
    const base = `${server}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;
    return await _fetchJson(`${base}&action=get_vod_info&vod_id=${vod_id}`, true, signal);
  }

  async function getSeriesInfo(server, user, pass, series_id, signal) {
    const base = `${server}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;
    return await _fetchJson(`${base}&action=get_series_info&series_id=${series_id}`, true, signal);
  }

  // ── GROUPS (cached by country) ─────────────────────────
  let _groupCache = {};
  function getGroups(channels, countryCode = 'ALL', tabId = 'tv') {
    if (_groupCache[countryCode]) return _groupCache[countryCode];
    const seen = new Set();
    
    let mainGroupName = '<span class="material-symbols-rounded">tv</span> Canales';
    if (tabId === 'vod') {
      mainGroupName = '<span class="material-symbols-rounded">movie</span> Películas';
    } else if (tabId === 'series') {
      mainGroupName = '<span class="material-symbols-rounded">live_tv</span> Series';
    }

    const groups = [{ id: '__all__', name: mainGroupName },
                    { id: '__favs__', name: '<span class="material-symbols-rounded">favorite</span> Favoritos' }];
    
    const list = countryCode === 'ALL' ? channels : channels.filter(c => c.countryCode === countryCode);
    for (const ch of list) {
      if (!seen.has(ch.group)) {
        seen.add(ch.group);
        groups.push({ id: ch.group, name: ch.group });
      }
    }
    _groupCache[countryCode] = groups;
    return groups;
  }

  function clearGroupCache() { _groupCache = {}; }

  function filterByGroup(channels, groupId, favIds, countryCode = 'ALL') {
    let list = channels;
    if (countryCode !== 'ALL') {
      list = channels.filter(c => c.countryCode === countryCode);
    }
    if (groupId === '__all__')  return list;
    if (groupId === '__favs__') return list.filter(c => favIds && favIds.has(c.id));
    return list.filter(c => c.group === groupId);
  }

  // Fast search using pre-built index
  function search(channels, query) {
    if (!query) return channels;
    const qTokens = _normalize(query).split(' ').filter(Boolean);
    return channels.filter(c => qTokens.every(t => c._search.includes(t)));
  }

  return { loadXtream, loadVod, loadSeries, search, filterByGroup, getGroups, clearGroupCache, getVodInfo, getSeriesInfo };
})();
