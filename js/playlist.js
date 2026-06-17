/**
 * playlist.js — Xtream Codes API
 * Performance optimized for large playlists (10k+ channels)
 */
const Playlist = (() => {

  // ── SEARCH INDEX ─────────────────────────────────────
  function _normalize(str) {
    return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function _toArray(obj) {
    if (!obj) return [];
    if (Array.isArray(obj)) return obj;
    if (typeof obj === 'object') return Object.values(obj);
    return [];
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
    _toArray(cats).forEach(c => { catMap[c.category_id] = c.category_name; });

    const channels = _toArray(streams).map((s, i) => {
      const groupName = _cleanTvCategoryName(catMap[s.category_id]);
      const cleanName = _cleanStreamName(s.name);
      return {
        id:          i,
        name:        cleanName,
        _search:     _normalize(s.name),
        logo:        s.stream_icon || '',
        group:       groupName,
        countryCode: detectCountry(s.name, catMap[s.category_id] || 'Sin categoría'),
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
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      return null;
    }
  }

  function _cleanTvCategoryName(rawName) {
    if (!rawName) return 'Sin categoría';
    let n = rawName;
    n = n.replace(/^(\[.*?\]|\{.*?\}|\|.*?\||[A-Z0-9]{2,6}\s*[-|:]\s*)\s*/i, '');
    n = n.replace(/^(ESPA[ÑN]A|FRANCE|ITALY|GERMANY|NORDIC|LATINO|DEPORTES|SPORTS|VIP)\s*[-|:]\s*/i, '');
    return n.trim() || rawName;
  }

  function _cleanVodCategoryName(rawName) {
    if (!rawName) return '➕ Otras';
    let n = rawName.toUpperCase();
    
    // Eliminar prefijo de país
    n = n.replace(/^[A-Z]{2,3}(?:\/[A-Z]{2,3})?\s*-\s*/, '').trim();

    // 1. Novedades y Calidad Premium
    if (n.match(/202[0-9]|ESTRENOS|NUEVAS|NEW RELEASE/)) return '✨ Últimos Estrenos';
    if (n.match(/4K|3840P|UHD|BLURAY|DOLBY|HDR|VISION/)) return '💎 Calidad 4K / UHD';
    
    // 2. Plataformas (Netflix, HBO, Disney...)
    if (n.match(/NETFLIX|PRIME|AMAZON|DISNEY|APPLE|HBO|PARAMOUNT|SHOWTIME/)) return '🍿 Originales (Plataformas)';
    
    // 3. Géneros Principales (Simplificados)
    if (n.match(/INFANTIL|KIDS|ANIMACION|ANIMATION|FAMILIA|BARN|DZIECI|CARTOON|ANIME|MANGA/)) return '🦄 Infantil y Animación';
    if (n.match(/ACCION|ACTION|GUERRE|CRIME|AÇÃO/)) return '💥 Acción y Aventuras';
    if (n.match(/COMEDIA|COMEDY/)) return '😂 Comedia';
    if (n.match(/TERROR|HORROR|SUSPENSE|THRILLER/)) return '👻 Terror y Suspense';
    if (n.match(/DOCUMENTAL|DOCUMENTARY|DOCU/)) return '🌍 Documentales';
    
    // 4. Colecciones y Deportes
    if (n.match(/CLASICO|OLD|ANTIGUA|SAGA/)) return '📺 Clásicos y Colecciones';
    if (n.match(/NAVIDAD|CHRISTMAS/)) return '🎄 Especial Navidad';
    if (n.match(/LALIGA|MOTOGP|FORMULA|F1|FOOTBALL|RUGBY|GOLF|MOTO|SPORT/)) return '⚽ Deportes en Diferido';

    // Todo lo demás
    return '➕ Otras';
  }

  function _cleanSeriesCategoryName(rawName) {
    if (!rawName) return '📺 Series Generales';
    let n = rawName.toUpperCase();
    
    // Eliminar prefijos de país (códigos o nombres completos)
    n = n.replace(/^[A-Z]{2,3}(?:\/[A-Z]{2,3})?\s*-\s*/, '');
    n = n.replace(/^(ESPA[ÑN]A|FRANCE|ITALY|GERMANY|NORDIC|QU[EÉ]BEC|TURKISH|GREECE|GREEK|INDIA|HINDI|SOMALIA|PAKISTAN|NETHERLANDS|BELGIUM|POLSKA|LATINO|PT\/BR|PERSIAN|KURDISH|HEBREW|ROMANIAN|BULGARIYA|HUNGARY|RUSSAIN|AFRICA|SOUTH AFRICA|CHINA|PHILIPPINES|SVENSK|SVENSKA|DANSK|DANSKE|NORSK|SUOMI|SUOMEN|ÍSLANDS)\s*/, '').trim();

    // Plataformas separadas
    if (n.match(/NETFLIX/)) return '🟥 Netflix';
    if (n.match(/HBO/)) return '🟣 HBO Max';
    if (n.match(/PRIME|AMAZON/)) return '🟦 Amazon Prime';
    if (n.match(/DISNEY/)) return '✨ Disney+';
    if (n.match(/APPLE/)) return '🍏 Apple TV+';
    if (n.match(/MOVISTAR/)) return 'Ⓜ️ Movistar+';
    if (n.match(/PARAMOUNT/)) return '⛰️ Paramount+';
    if (n.match(/ATRESPLAYER|RTVE|MITELE|SKYSHOWTIME/)) return '📺 Nacionales / Otras Apps';
    
    // Novedades
    if (n.match(/202[0-9]|ESTRENOS|NUEVAS|NEW RELEASE/)) return '✨ Últimos Estrenos';
    
    // Calidad
    if (n.match(/4K|3840P|UHD|BLURAY|DOLBY|HDR|VISION/)) return '💎 Series en 4K / UHD';
    
    // Géneros y Temáticas de Series
    if (n.match(/TURCA|TURKISH|NOVELA/)) return '🇹🇷 Telenovelas y Turcas';
    if (n.match(/INFANTIL|KIDS|ANIMACION|ANIMATION|FAMILIA|BARN|DZIECI/)) return '🦄 Infantil y Animación';
    if (n.match(/ANIME|MANGA/)) return '🎌 Anime';
    if (n.match(/DOCUMENTAL|DOCUMENTARY|DOCU/)) return '🌍 Documentales';
    if (n.match(/REALITY/)) return '🎭 Reality Shows';
    
    return '📺 Series Generales';
  }

  function _extractYear(item) {
    const d1 = String(item.releaseDate || '');
    if (d1.match(/^(19|20)\d{2}/)) return parseInt(d1.substring(0, 4));
    
    const d2 = String(item.release_date || '');
    if (d2.match(/^(19|20)\d{2}/)) return parseInt(d2.substring(0, 4));
    
    const m = String(item.name || '').match(/\b(19\d{2}|20\d{2})\b/);
    if (m) return parseInt(m[1], 10);
    return 0;
  }

  function _cleanStreamName(n) {
    if (!n) return '';
    let res = n.replace(/^(\[.*?\]|\{.*?\}|\|.*?\||[A-Z0-9]{2,6}\s*[-|:]\s*)\s*/i, '');
    let parts = res.split(' - ');
    while (parts.length > 1) {
      if (!/[a-z]/i.test(parts[0]) || parts[0].length <= 6) {
        parts.shift();
      } else {
        break;
      }
    }
    res = parts.join(' - ');
    res = res.replace(/\s*[\[\(\{][A-Z]{2,3}[\]\)\}]$/i, '');
    return res.trim() || n;
  }

  const _fetchPromises = { vod: null, series: null };

  async function loadVod(server, user, pass, onProgress, signal) {
    if (_fetchPromises.vod) return _fetchPromises.vod;

    _fetchPromises.vod = (async () => {
      try {
        const base = `${server}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;
        
        if (onProgress) onProgress(10);
    const [streams, cats] = await Promise.all([
      _fetchJson(`${base}&action=get_vod_streams`, false, signal),
      _fetchJson(`${base}&action=get_vod_categories`, false, signal)
    ]);
    if (onProgress) onProgress(80);

    const catMap = {};
    _toArray(cats).forEach(c => { catMap[c.category_id] = c.category_name; });

    // Optimización de rendimiento: Precalcular claves de ordenación (Schwartzian transform)
    const streamsWithKeys = _toArray(streams).map(s => ({
      ...s,
      _year: _extractYear(s),
      _added: parseInt(s.added || '0', 10)
    }));

    // Ordenar de más reciente a más antiguo
    streamsWithKeys.sort((a, b) => {
      if (a._year !== b._year) return b._year - a._year;
      return b._added - a._added;
    });

    const movies = streamsWithKeys.map((s, i) => {
      const groupName = _cleanVodCategoryName(catMap[s.category_id]);
      const cleanName = _cleanStreamName(s.name);
      return {
        id:          `vod_${s.stream_id}`,
        name:        cleanName,
        _search:     _normalize(s.name),
        logo:        s.stream_icon || '',
        group:       groupName,
        countryCode: detectCountry(s.name, catMap[s.category_id]),
        url:         `${server}/movie/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${s.stream_id}.${s.container_extension || 'mp4'}`,
        streamId:    s.stream_id,
        type:        'vod'
      };
    });

      if (onProgress) onProgress(100);
      return movies;
      } catch (e) {
        _fetchPromises.vod = null;
        throw e;
      }
    })();
    return _fetchPromises.vod;
  }

  async function loadSeries(server, user, pass, onProgress, signal) {
    if (_fetchPromises.series) return _fetchPromises.series;

    _fetchPromises.series = (async () => {
      try {
        const base = `${server}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;
        
        if (onProgress) onProgress(10);
    const [seriesList, cats] = await Promise.all([
      _fetchJson(`${base}&action=get_series`, false, signal),
      _fetchJson(`${base}&action=get_series_categories`, false, signal)
    ]);
    if (onProgress) onProgress(80);

    const catMap = {};
    _toArray(cats).forEach(c => { catMap[c.category_id] = c.category_name; });

    // Optimización de rendimiento: Precalcular claves de ordenación
    const seriesWithKeys = _toArray(seriesList).map(s => ({
      ...s,
      _year: _extractYear(s),
      _added: parseInt(s.added || s.last_modified || '0', 10)
    }));

    // Ordenar de más reciente a más antiguo
    seriesWithKeys.sort((a, b) => {
      if (a._year !== b._year) return b._year - a._year;
      return b._added - a._added;
    });

    const series = seriesWithKeys.map((s, i) => {
      const groupName = _cleanSeriesCategoryName(catMap[s.category_id]);
      const cleanName = _cleanStreamName(s.name);
      return {
        id:          `series_${s.series_id}`,
        name:        cleanName,
        _search:     _normalize(s.name),
        logo:        s.cover || s.stream_icon || '',
        group:       groupName,
        countryCode: detectCountry(s.name, catMap[s.category_id]),
        // url is not available until we fetch series info, so this is just the entry
        streamId:    s.series_id,
        type:        'series'
      };
    });

      if (onProgress) onProgress(100);
      return series;
      } catch (e) {
        _fetchPromises.series = null;
        throw e;
      }
    })();
    return _fetchPromises.series;
  }

  const _infoCache = { vod: {}, series: {} };

  async function getVodInfo(server, user, pass, vod_id, signal) {
    if (_infoCache.vod[vod_id]) return _infoCache.vod[vod_id];
    const base = `${server}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;
    const data = await _fetchJson(`${base}&action=get_vod_info&vod_id=${vod_id}`, true, signal);
    if (data) _infoCache.vod[vod_id] = data;
    return data;
  }

  async function getSeriesInfo(server, user, pass, series_id, signal) {
    if (_infoCache.series[series_id]) return _infoCache.series[series_id];
    const base = `${server}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;
    const data = await _fetchJson(`${base}&action=get_series_info&series_id=${series_id}`, true, signal);
    if (data) _infoCache.series[series_id] = data;
    return data;
  }

  // ── GROUPS (cached by country) ─────────────────────────
  let _groupCache = {};
  function getGroups(channels, countryCode = 'ALL', tabId = 'tv') {
    const cacheKey = `${countryCode}_${tabId}`;
    if (_groupCache[cacheKey]) return _groupCache[cacheKey];
    const seen = new Set();
    
    let mainGroupName = '<span class="material-symbols-rounded">tv</span> Canales';
    if (tabId === 'vod') {
      mainGroupName = '<span class="material-symbols-rounded">movie</span> Películas';
    } else if (tabId === 'series') {
      mainGroupName = '<span class="material-symbols-rounded">live_tv</span> Series';
    }

    const staticGroups = [{ id: '__all__', name: mainGroupName },
                          { id: '__favs__', name: '<span class="material-symbols-rounded">favorite</span> Favoritos' }];
    
    const dynamicGroups = [];
    const list = countryCode === 'ALL' ? channels : channels.filter(c => c.countryCode === countryCode);
    for (const ch of list) {
      if (!seen.has(ch.group)) {
        seen.add(ch.group);
        dynamicGroups.push({ id: ch.group, name: ch.group });
      }
    }
    
    const seriesOrder = [
      '✨ Últimos Estrenos',
      '🟥 Netflix',
      '🟣 HBO Max',
      '🟦 Amazon Prime',
      '✨ Disney+',
      '🍏 Apple TV+',
      'Ⓜ️ Movistar+',
      '⛰️ Paramount+',
      '📺 Nacionales / Otras Apps',
      '🇹🇷 Telenovelas y Turcas',
      '🦄 Infantil y Animación',
      '🌍 Documentales',
      '🎌 Anime',
      '🎭 Reality Shows',
      '💎 Series en 4K / UHD',
      '📺 Series Generales'
    ];

    const vodOrder = [
      '✨ Últimos Estrenos',
      '💎 Calidad 4K / UHD',
      '🍿 Originales (Plataformas)',
      '🦄 Infantil y Animación',
      '💥 Acción y Aventuras',
      '😂 Comedia',
      '👻 Terror y Suspense',
      '🌍 Documentales',
      '📺 Clásicos y Colecciones',
      '🎄 Especial Navidad',
      '⚽ Deportes en Diferido',
      '➕ Otras'
    ];

    let orderList = [];
    if (tabId === 'series') orderList = seriesOrder;
    else if (tabId === 'vod') orderList = vodOrder;

    dynamicGroups.sort((a, b) => {
      let idxA = orderList.indexOf(a.id);
      let idxB = orderList.indexOf(b.id);
      if (idxA === -1) idxA = 999;
      if (idxB === -1) idxB = 999;
      
      if (idxA !== idxB) return idxA - idxB;
      return a.id.localeCompare(b.id);
    });

    const finalGroups = [...staticGroups, ...dynamicGroups];
    _groupCache[cacheKey] = finalGroups;
    return finalGroups;
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
