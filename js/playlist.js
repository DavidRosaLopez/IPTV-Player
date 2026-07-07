/**
 * playlist.js — Xtream Codes API
 * Performance optimized for large playlists (10k+ channels)
 */
import { normalizeCountryCode } from './countries.js';
import { Watching } from './watching.js';

export const Playlist = (() => {

  // ── SEARCH INDEX ─────────────────────────────────────
  function _normalize(str) {
    return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  // ── INVERTED GROUP INDEX — O(1) filterByGroup ────────
  // Maps: groupId → channel[] (rebuilt when channels change)
  let _groupIndex     = new Map();  // groupId → []
  let _countryIndex   = new Map();  // countryCode → []
  let _indexedChannels = null;      // reference to the array the index was built from

  function _buildGroupIndex(channels) {
    if (_indexedChannels === channels) return; // already up-to-date
    _groupIndex   = new Map();
    _countryIndex = new Map();
    for (const ch of channels) {
      // group index
      if (!_groupIndex.has(ch.group)) _groupIndex.set(ch.group, []);
      _groupIndex.get(ch.group).push(ch);
      // country index
      const cc = ch.countryCode || 'OTROS';
      if (!_countryIndex.has(cc)) _countryIndex.set(cc, []);
      _countryIndex.get(cc).push(ch);
    }
    _indexedChannels = channels;
  }

  function invalidateIndex() { _indexedChannels = null; }

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

  // Memoize detectCountry by group name (most channels share groups, saves 90%+ calls)
  const _countryDetectCache = new Map();

  function detectCountry(name, group) {
    const cat = group || '';
    if (_countryDetectCache.has(cat)) return _countryDetectCache.get(cat);

    const chName = name || '';
    const prefixRegex = /^\[?([A-Z]{2,3})\]?[\s*|:.-]/i;
    
    let match = cat.match(prefixRegex) || chName.match(prefixRegex);
    if (match) {
      const code = normalizeCountryCode(match[1]);
      if (code) { _countryDetectCache.set(cat, code); return code; }
    }
    
    const catLower = cat.toLowerCase();
    let result = 'OTROS';
    if (catLower.includes('spain') || catLower.includes('españa') || catLower.includes('spanish')) result = 'ES';
    else if (catLower.includes('usa') || catLower.includes('united states') || catLower.includes('english')) result = 'US';
    else if (catLower.includes('france') || catLower.includes('french') || catLower.includes('francia')) result = 'FR';
    else if (catLower.includes('arab') || catLower.includes('arabic')) result = 'AR';
    else if (catLower.includes('germany') || catLower.includes('deutsch') || catLower.includes('germania')) result = 'DE';
    else if (catLower.includes('italy') || catLower.includes('italia') || catLower.includes('italian')) result = 'IT';
    else if (catLower.includes('portugal') || catLower.includes('portuguese')) result = 'PT';
    else if (catLower.includes('latino') || catLower.includes('latin') || catLower.includes('latam')) result = 'LAT';
    
    _countryDetectCache.set(cat, result);
    return result;
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
        // Usamos .ts (Raw MPEG-TS) en lugar de .m3u8 para Live TV.
        // Esto evita que el servidor Xtream transcodifique o degrade la señal de canales UHD.
        url:         `${server}/live/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${s.stream_id}.ts`,
        streamId:    s.stream_id
      };
    });

    if (onProgress) onProgress(100);
    return { channels, serverInfo: info.server_info };
  }

  async function _fetchJson(url, noCache = false, signal) {
    try {
      // 'default' respects server Cache-Control headers; 'force-cache' ignores them indefinitely
      const res = await fetch(url, { cache: noCache ? 'no-store' : 'default', signal });
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

    let nUnaccented = n.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

    // 1. Novedades y Calidad Premium
    if (nUnaccented.match(/202[0-9]|ESTRENOS|NUEVAS|NEW RELEASE/)) return '✨ Últimos Estrenos';
    if (nUnaccented.match(/4K|3840P|UHD|BLURAY|DOLBY|HDR/)) return '💎 Calidad 4K / UHD';
    
    // 2. Plataformas separadas (para submenú)
    if (nUnaccented.match(/NETFLIX/)) return '🟥 Netflix';
    if (nUnaccented.match(/HBO|MAX/)) return '🟣 HBO Max';
    if (nUnaccented.match(/\b(PRIME|AMAZON)\b/)) return '🟦 Amazon Prime';
    if (nUnaccented.match(/DISNEY/)) return '✨ Disney+';
    if (nUnaccented.match(/APPLE/)) return '🍏 Apple TV+';
    if (nUnaccented.match(/MOVISTAR/)) return 'Ⓜ️ Movistar+';
    if (nUnaccented.match(/PARAMOUNT/)) return '⛰️ Paramount+';
    if (nUnaccented.match(/ATRESPLAYER|RTVE|MITELE|SKYSHOWTIME/)) return '📺 Nacionales / Otras Apps';
    
    // 3. Géneros Principales (Simplificados)
    if (nUnaccented.match(/INFANTIL|KIDS|ANIMACION|ANIMATION|FAMILIA|BARN|DZIECI|CARTOON|ANIME|MANGA/)) return '🦄 Infantil y Animación';
    if (nUnaccented.match(/ACCION|ACTION|GUERRE|CRIME|CRIMEN|ACAO|AVENTURA|ADVENTURE|BELICO|WAR|MAFIA/)) return '💥 Acción y Aventuras';
    if (nUnaccented.match(/SCI-FI|FANTASIA|FANTASY|CIENCIA FICCION|SYFY|FICTION|FICION/)) return '🛸 Ciencia Ficción y Fantasía';
    if (nUnaccented.match(/COMEDIA|COMEDY|STAND UP|MONOLOGO/)) return '😂 Comedia';
    if (nUnaccented.match(/TERROR|HORROR|SUSPENSE|THRILLER|MISTERIO|MYSTERY|MIEDO/)) return '👻 Terror y Suspense';
    if (nUnaccented.match(/DRAMA|ROMANCE|AMOR|ROMANTICA|BIOGRAFIA|BIOPIC/)) return '🎭 Drama y Romance';
    if (nUnaccented.match(/DOCUMENTAL|DOCUMENTARY|DOCU|HISTORIA|HISTORY|NATURE|NATURALEZA/)) return '🌍 Documentales';
    
    // 4. Colecciones y Deportes
    if (nUnaccented.match(/CLASICO|OLD|ANTIGUA|SAGA|COLECCION|COLLECTION/)) return '📺 Clásicos y Colecciones';
    if (nUnaccented.match(/\b(MUSICA|MUSIC|MUSICAL|CONCERT|CONCIERTO|CONCIERTOS)\b/)) return '🎵 Música y Conciertos';
    if (nUnaccented.match(/WESTERN|OESTE/)) return '🤠 Western';
    if (nUnaccented.match(/NAVIDAD|CHRISTMAS|XMAS/)) return '🎄 Especial Navidad';
    if (nUnaccented.match(/LALIGA|MOTOGP|FORMULA|F1|FOOTBALL|RUGBY|GOLF|MOTO|SPORT|DEPORTE/)) return '⚽ Deportes en Diferido';

    // Todo lo demás
    return '➕ Otras';
  }

  function _cleanSeriesCategoryName(rawName) {
    if (!rawName) return '📺 Series Generales';
    let n = rawName.toUpperCase();
    
    // Eliminar prefijos de país (códigos o nombres completos)
    n = n.replace(/^[A-Z]{2,3}(?:\/[A-Z]{2,3})?\s*-\s*/, '');
    n = n.replace(/^(ESPA[ÑN]A|FRANCE|ITALY|GERMANY|NORDIC|QU[EÉ]BEC|TURKISH|GREECE|GREEK|INDIA|HINDI|SOMALIA|PAKISTAN|NETHERLANDS|BELGIUM|POLSKA|LATINO|PT\/BR|PERSIAN|KURDISH|HEBREW|ROMANIAN|BULGARIYA|HUNGARY|RUSSAIN|AFRICA|SOUTH AFRICA|CHINA|PHILIPPINES|SVENSK|SVENSKA|DANSK|DANSKE|NORSK|SUOMI|SUOMEN|ÍSLANDS)\s*/, '').trim();

    let nUnaccented = n.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

    // Novedades y Calidad Premium
    if (nUnaccented.match(/202[0-9]|ESTRENOS|NUEVAS|NEW RELEASE/)) return '✨ Últimos Estrenos';
    if (nUnaccented.match(/4K|3840P|UHD|BLURAY|DOLBY|HDR/)) return '💎 Series en 4K / UHD';

    // Plataformas separadas
    if (nUnaccented.match(/NETFLIX/)) return '🟥 Netflix';
    if (nUnaccented.match(/HBO|MAX/)) return '🟣 HBO Max';
    if (nUnaccented.match(/\b(PRIME|AMAZON)\b/)) return '🟦 Amazon Prime';
    if (nUnaccented.match(/DISNEY/)) return '✨ Disney+';
    if (nUnaccented.match(/APPLE/)) return '🍏 Apple TV+';
    if (nUnaccented.match(/MOVISTAR/)) return 'Ⓜ️ Movistar+';
    if (nUnaccented.match(/PARAMOUNT/)) return '⛰️ Paramount+';
    if (nUnaccented.match(/ATRESPLAYER|RTVE|MITELE|SKYSHOWTIME/)) return '📺 Nacionales / Otras Apps';
    
    // Géneros y Temáticas de Series
    if (nUnaccented.match(/TURCA|TURKISH|NOVELA/)) return '🇹🇷 Telenovelas y Turcas';
    if (nUnaccented.match(/INFANTIL|KIDS|ANIMACION|ANIMATION|FAMILIA|BARN|DZIECI|CARTOON|ANIME|MANGA/)) return '🦄 Infantil y Animación';
    if (nUnaccented.match(/ANIME|MANGA/)) return '🎌 Anime';
    if (nUnaccented.match(/DOCUMENTAL|DOCUMENTARY|DOCU|HISTORIA|HISTORY|NATURE|NATURALEZA/)) return '🌍 Documentales';
    if (nUnaccented.match(/REALITY/)) return '🎭 Reality Shows';
    
    // Añadidos los mismos de Películas
    if (nUnaccented.match(/ACCION|ACTION|GUERRE|CRIME|CRIMEN|ACAO|AVENTURA|ADVENTURE|BELICO|WAR|MAFIA/)) return '💥 Acción y Aventuras';
    if (nUnaccented.match(/SCI-FI|FANTASIA|FANTASY|CIENCIA FICCION|SYFY|FICTION|FICION/)) return '🛸 Ciencia Ficción y Fantasía';
    if (nUnaccented.match(/COMEDIA|COMEDY|STAND UP|MONOLOGO/)) return '😂 Comedia';
    if (nUnaccented.match(/TERROR|HORROR|SUSPENSE|THRILLER|MISTERIO|MYSTERY|MIEDO/)) return '👻 Terror y Suspense';
    if (nUnaccented.match(/DRAMA|ROMANCE|AMOR|ROMANTICA|BIOGRAFIA|BIOPIC/)) return '🎭 Drama y Romance';
    if (nUnaccented.match(/\b(MUSICA|MUSIC|MUSICAL|CONCERT|CONCIERTO|CONCIERTOS)\b/)) return '🎵 Música y Conciertos';
    
    return '📺 Series Generales';
  }

  function _extractYear(item) {
    const maxYear = new Date().getFullYear() + 1;
    let y = 0;
    
    const d1 = String(item.releaseDate || '');
    if (d1.match(/^(19|20)\d{2}/)) y = parseInt(d1.substring(0, 4), 10);
    if (y > 1900 && y <= maxYear) return y;
    
    const d2 = String(item.release_date || '');
    if (d2.match(/^(19|20)\d{2}/)) y = parseInt(d2.substring(0, 4), 10);
    if (y > 1900 && y <= maxYear) return y;
    
    const m = String(item.name || '').match(/\b(19\d{2}|20\d{2})\b/);
    if (m) {
      y = parseInt(m[1], 10);
      if (y > 1900 && y <= maxYear) return y;
    }
    return 0;
  }

  function _cleanStreamName(n) {
    if (!n) return '';
    return n.trim();
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
    const streamsWithKeys = _toArray(streams).map(s => {
      let addedNum = parseInt(s.added, 10) || 0;
      let yr = _extractYear(s);
      if (yr === 0 && addedNum > 0) {
        const ms = addedNum < 100000000000 ? addedNum * 1000 : addedNum;
        yr = new Date(ms).getFullYear();
      }
      return {
        ...s,
        _year: yr,
        _added: addedNum
      };
    });

    // Ordenar por año de lanzamiento más reciente, cayendo de vuelta a la fecha de adición
    streamsWithKeys.sort((a, b) => {
      if (b._year !== a._year) return b._year - a._year;
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
        throw e;
      } finally {
        _fetchPromises.vod = null;
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
    const seriesWithKeys = _toArray(seriesList).map(s => {
      let addedNum = parseInt(s.added || s.last_modified, 10) || 0;
      let yr = _extractYear(s);
      if (yr === 0 && addedNum > 0) {
        const ms = addedNum < 100000000000 ? addedNum * 1000 : addedNum;
        yr = new Date(ms).getFullYear();
      }
      return {
        ...s,
        _year: yr,
        _added: addedNum
      };
    });

    // Ordenar por año de lanzamiento más reciente, cayendo de vuelta a la fecha de adición
    seriesWithKeys.sort((a, b) => {
      if (b._year !== a._year) return b._year - a._year;
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
        throw e;
      } finally {
        _fetchPromises.series = null;
      }
    })();
    return _fetchPromises.series;
  }

  // ── LRU CACHE para info de VOD/Series (max 100 entradas, evita RAM ilimitada en sesiones largas) ──
  const LRU_MAX = 100;
  function _makeLRU() {
    const cache = new Map();
    return {
      get(key) {
        if (!cache.has(key)) return undefined;
        const val = cache.get(key);
        cache.delete(key);
        cache.set(key, val); // move to end (most-recently-used)
        return val;
      },
      set(key, val) {
        if (cache.has(key)) cache.delete(key);
        else if (cache.size >= LRU_MAX) cache.delete(cache.keys().next().value); // evict oldest
        cache.set(key, val);
      },
      has(key) { return cache.has(key); }
    };
  }
  const _infoCache = { vod: _makeLRU(), series: _makeLRU() };

  async function getVodInfo(server, user, pass, vod_id, signal) {
    if (_infoCache.vod.has(vod_id)) return _infoCache.vod.get(vod_id);
    const base = `${server}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;
    const data = await _fetchJson(`${base}&action=get_vod_info&vod_id=${vod_id}`, true, signal);
    if (data) _infoCache.vod.set(vod_id, data);
    return data;
  }

  async function getSeriesInfo(server, user, pass, series_id, signal) {
    if (_infoCache.series.has(series_id)) return _infoCache.series.get(series_id);
    const base = `${server}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;
    const data = await _fetchJson(`${base}&action=get_series_info&series_id=${series_id}`, true, signal);
    if (data) _infoCache.series.set(series_id, data);
    return data;
  }

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

  function isItemVisibleInCountry(ch, countryCode) {
    if (countryCode === 'ALL') return true;
    if (ch.countryCode === countryCode) return true;
    if (isGlobalGroup(ch.group) && (ch.countryCode === 'OTROS' || ch.countryCode === 'US' || ch.countryCode === 'LAT' || ch.countryCode === 'ES')) {
        if (ch.countryCode === 'OTROS' || ch.countryCode === 'US') return true;
    }
    return false;
  }

  function isGlobalGroup(groupName) {
    return GLOBAL_GROUPS.has(groupName);
  }

  // ── GROUPS (cached by country) ─────────────────────────
  let _groupCache = {};
  function getGroups(channels, countryCode = 'ALL', tabId = 'tv') {
    if (tabId === 'vod') {
      return [
        { id: '__all__', name: '<span class="material-symbols-rounded">movie</span> Películas' },
        { id: '__favs__', name: '<span class="material-symbols-rounded">favorite</span> Favoritos' },
        { id: '__watching__', name: '<span class="material-symbols-rounded">play_circle</span> Seguir viendo' }
      ];
    } else if (tabId === 'series') {
      return [
        { id: '__all__', name: '<span class="material-symbols-rounded">live_tv</span> Series' },
        { id: '__favs__', name: '<span class="material-symbols-rounded">favorite</span> Favoritos' },
        { id: '__watching__', name: '<span class="material-symbols-rounded">play_circle</span> Seguir viendo' }
      ];
    }

    const cacheKey = `${countryCode}_${tabId}`;
    if (_groupCache[cacheKey]) return _groupCache[cacheKey];
    const seen = new Set();
    
    let mainGroupName = '<span class="material-symbols-rounded">tv</span> Canales';

    const staticGroups = [{ id: '__all__', name: mainGroupName },
                          { id: '__favs__', name: '<span class="material-symbols-rounded">favorite</span> Favoritos' }];
    
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

    const dynamicGroups = [];
    const seenFolders = new Set();
    const list = channels.filter(c => isItemVisibleInCountry(c, countryCode));
    
    for (const ch of list) {
      if (!seen.has(ch.group)) {
        seen.add(ch.group);
        
        const parentId = childToFolder[ch.group];
        if (parentId) {
          if (!seenFolders.has(parentId)) {
            seenFolders.add(parentId);
            dynamicGroups.push({ id: parentId, name: FOLDERS[parentId].name, isFolder: true });
          }
          dynamicGroups.push({ id: ch.group, name: ch.group, parentId: parentId });
        } else {
          dynamicGroups.push({ id: ch.group, name: ch.group });
        }
      }
    }

    dynamicGroups.sort((a, b) => a.id.localeCompare(b.id));

    const finalGroups = [...staticGroups, ...dynamicGroups];
    _groupCache[cacheKey] = finalGroups;
    return finalGroups;
  }

  function clearGroupCache() { _groupCache = {}; invalidateIndex(); }

  function filterByGroup(channels, groupId, favIds, countryCode = 'ALL') {
    // Build inverted index on first call or if channels array changed
    _buildGroupIndex(channels);

    if (groupId === '__favs__') {
      // Filter by country then favs
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
      if (countryCode === 'ALL') return channels;
      return channels.filter(c => isItemVisibleInCountry(c, countryCode));
    }

    // O(1) group lookup via inverted index
    const groupChannels = _groupIndex.get(groupId) || [];
    if (countryCode === 'ALL') return groupChannels;
    return groupChannels.filter(c => isItemVisibleInCountry(c, countryCode));
  }

  // Fast search using pre-built index
  function search(channels, query) {
    if (!query) return channels;
    const qTokens = _normalize(query).split(' ').filter(Boolean);
    return channels.filter(c => qTokens.every(t => c._search.includes(t)));
  }

  // ── M3U LOADER (Web Worker) ─────────────────────────
  async function loadM3U(url, onProgress, signal) {
    if (onProgress) onProgress(10);
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error('Error al descargar la lista M3U');
    
    if (onProgress) onProgress(30);
    const text = await res.text();
    
    if (onProgress) onProgress(50);
    
    return new Promise((resolve, reject) => {
      const worker = new Worker('js/m3u-worker.js');
      
      worker.onmessage = (e) => {
        if (e.data.progress && onProgress) {
          // Map worker progress (0-100) to 50-100 range
          onProgress(50 + (e.data.progress * 0.5));
        } else if (e.data.channelsBuffer) {
          const str = new TextDecoder().decode(e.data.channelsBuffer);
          const channels = JSON.parse(str);
          worker.terminate();
          if (onProgress) onProgress(100);
          resolve(channels);
        } else if (e.data.channels) {
          worker.terminate();
          if (onProgress) onProgress(100);
          resolve(e.data.channels);
        } else if (e.data.error) {
          worker.terminate();
          reject(new Error(e.data.error));
        }
      };

      worker.onerror = (err) => {
        worker.terminate();
        reject(err);
      };

      worker.postMessage({ content: text });
    });
  }

  return { loadXtream, loadVod, loadSeries, loadM3U, search, filterByGroup, getGroups, clearGroupCache, getVodInfo, getSeriesInfo, isGlobalGroup, isItemVisibleInCountry, invalidateIndex };
})();
