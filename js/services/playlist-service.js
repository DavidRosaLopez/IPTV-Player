import { normalizeCountryCode } from '../countries.js';

function _normalize(str) {
  return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function _toArray(obj) {
  if (!obj) return [];
  if (Array.isArray(obj)) return obj;
  if (typeof obj === 'object') return Object.values(obj);
  return [];
}

const _countryDetectCache = new Map();

function detectCountry(name, group) {
  const cat = group || '';
  if (_countryDetectCache.has(cat)) return _countryDetectCache.get(cat);

  const chName = name || '';
  const prefixRegex = /^\[?([A-Z]{2,3})\]?[\s*|:.-]/i;
  const match = cat.match(prefixRegex) || chName.match(prefixRegex);
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
  n = n.replace(/^[A-Z]{2,3}(?:\/[A-Z]{2,3})?\s*-\s*/, '').trim();
  const nUnaccented = n.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (nUnaccented.match(/202[0-9]|ESTRENOS|NUEVAS|NEW RELEASE/)) return '✨ Últimos Estrenos';
  if (nUnaccented.match(/4K|3840P|UHD|BLURAY|DOLBY|HDR/)) return '💎 Calidad 4K / UHD';
  if (nUnaccented.match(/NETFLIX/)) return '🟥 Netflix';
  if (nUnaccented.match(/HBO|MAX/)) return '🟣 HBO Max';
  if (nUnaccented.match(/\b(PRIME|AMAZON)\b/)) return '🟦 Amazon Prime';
  if (nUnaccented.match(/DISNEY/)) return '✨ Disney+';
  if (nUnaccented.match(/APPLE/)) return '🍏 Apple TV+';
  if (nUnaccented.match(/MOVISTAR/)) return 'Ⓜ️ Movistar+';
  if (nUnaccented.match(/PARAMOUNT/)) return '⛰️ Paramount+';
  if (nUnaccented.match(/ATRESPLAYER|RTVE|MITELE|SKYSHOWTIME/)) return '📺 Nacionales / Otras Apps';
  if (nUnaccented.match(/INFANTIL|KIDS|ANIMACION|ANIMATION|FAMILIA|BARN|DZIECI|CARTOON|ANIME|MANGA/)) return '🦄 Infantil y Animación';
  if (nUnaccented.match(/ACCION|ACTION|GUERRE|CRIME|CRIMEN|ACAO|AVENTURA|ADVENTURE|BELICO|WAR|MAFIA/)) return '💥 Acción y Aventuras';
  if (nUnaccented.match(/SCI-FI|FANTASIA|FANTASY|CIENCIA FICCION|SYFY|FICTION|FICION/)) return '🛸 Ciencia Ficción y Fantasía';
  if (nUnaccented.match(/COMEDIA|COMEDY|STAND UP|MONOLOGO/)) return '😂 Comedia';
  if (nUnaccented.match(/TERROR|HORROR|SUSPENSE|THRILLER|MISTERIO|MYSTERY|MIEDO/)) return '👻 Terror y Suspense';
  if (nUnaccented.match(/DRAMA|ROMANCE|AMOR|ROMANTICA|BIOGRAFIA|BIOPIC/)) return '🎭 Drama y Romance';
  if (nUnaccented.match(/DOCUMENTAL|DOCUMENTARY|DOCU|HISTORIA|HISTORY|NATURE|NATURALEZA/)) return '🌍 Documentales';
  if (nUnaccented.match(/CLASICO|OLD|ANTIGUA|SAGA|COLECCION|COLLECTION/)) return '📺 Clásicos y Colecciones';
  if (nUnaccented.match(/\b(MUSICA|MUSIC|MUSICAL|CONCERT|CONCIERTO|CONCIERTOS)\b/)) return '🎵 Música y Conciertos';
  if (nUnaccented.match(/WESTERN|OESTE/)) return '🤠 Western';
  if (nUnaccented.match(/NAVIDAD|CHRISTMAS|XMAS/)) return '🎄 Especial Navidad';
  if (nUnaccented.match(/LALIGA|MOTOGP|FORMULA|F1|FOOTBALL|RUGBY|GOLF|MOTO|SPORT|DEPORTE/)) return '⚽ Deportes en Diferido';
  return '➕ Otras';
}

function _cleanSeriesCategoryName(rawName) {
  if (!rawName) return '📺 Series Generales';
  let n = rawName.toUpperCase();
  n = n.replace(/^[A-Z]{2,3}(?:\/[A-Z]{2,3})?\s*-\s*/, '');
  n = n.replace(/^(ESPA[ÑN]A|FRANCE|ITALY|GERMANY|NORDIC|QU[EÉ]BEC|TURKISH|GREECE|GREEK|INDIA|HINDI|SOMALIA|PAKISTAN|NETHERLANDS|BELGIUM|POLSKA|LATINO|PT\/BR|PERSIAN|KURDISH|HEBREW|ROMANIAN|BULGARIYA|HUNGARY|RUSSAIN|AFRICA|SOUTH AFRICA|CHINA|PHILIPPINES|SVENSK|SVENSKA|DANSK|DANSKE|NORSK|SUOMI|SUOMEN|ÍSLANDS)\s*/, '').trim();
  const nUnaccented = n.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (nUnaccented.match(/202[0-9]|ESTRENOS|NUEVAS|NEW RELEASE/)) return '✨ Últimos Estrenos';
  if (nUnaccented.match(/4K|3840P|UHD|BLURAY|DOLBY|HDR/)) return '💎 Series en 4K / UHD';
  if (nUnaccented.match(/NETFLIX/)) return '🟥 Netflix';
  if (nUnaccented.match(/HBO|MAX/)) return '🟣 HBO Max';
  if (nUnaccented.match(/\b(PRIME|AMAZON)\b/)) return '🟦 Amazon Prime';
  if (nUnaccented.match(/DISNEY/)) return '✨ Disney+';
  if (nUnaccented.match(/APPLE/)) return '🍏 Apple TV+';
  if (nUnaccented.match(/MOVISTAR/)) return 'Ⓜ️ Movistar+';
  if (nUnaccented.match(/PARAMOUNT/)) return '⛰️ Paramount+';
  if (nUnaccented.match(/ATRESPLAYER|RTVE|MITELE|SKYSHOWTIME/)) return '📺 Nacionales / Otras Apps';
  if (nUnaccented.match(/TURCA|TURKISH|NOVELA/)) return '🇹🇷 Telenovelas y Turcas';
  if (nUnaccented.match(/INFANTIL|KIDS|ANIMACION|ANIMATION|FAMILIA|BARN|DZIECI|CARTOON|ANIME|MANGA/)) return '🦄 Infantil y Animación';
  if (nUnaccented.match(/ANIME|MANGA/)) return '🎌 Anime';
  if (nUnaccented.match(/DOCUMENTAL|DOCUMENTARY|DOCU|HISTORIA|HISTORY|NATURE|NATURALEZA/)) return '🌍 Documentales';
  if (nUnaccented.match(/REALITY/)) return '🎭 Reality Shows';
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

function _detectStreamMeta(...values) {
  const raw = values.filter(Boolean).join(' ').toUpperCase();
  const heightMatch = raw.match(/\b(4320|2160|1440|1080|720|576|480)P?\b/);
  const height = heightMatch ? parseInt(heightMatch[1], 10) : 0;
  const is8K = /\b(8K|4320P?)\b/.test(raw) || height >= 4320;
  const is4K = /\b(4K|UHD|ULTRA\s*HD|2160P?|3840P?)\b/.test(raw) || height >= 2160;
  const isFhd = /\b(FHD|FULL\s*HD|1080P?)\b/.test(raw) || height >= 1080;
  const isHd = isFhd || /\b(HD|720P?)\b/.test(raw) || height >= 720;
  const isHevc = /\b(HEVC|H\.?265|X265|H265)\b/.test(raw);
  const isRaw = /\b(RAW|DIRECT|REMUX|BLURAY|BDREMUX|LOSSLESS)\b/.test(raw);
  return {
    quality: is8K ? '8k' : is4K ? 'uhd' : isFhd ? 'fhd' : isHd ? 'hd' : 'sd',
    codec: isHevc ? 'hevc' : /\b(AVC|H\.?264|X264|H264)\b/.test(raw) ? 'h264' : '',
    isRaw,
    height
  };
}

async function _fetchJson(url, signal, noCache = false) {
  try {
    const res = await fetch(url, { cache: noCache ? 'no-store' : 'default', signal });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    return null;
  }
}

export async function loadXtream(server, user, pass, onProgress, signal) {
  const base = `${server}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;
  if (onProgress) onProgress(10);
  const info = await _fetchJson(base, signal, true);
  if (!info || info.user_info?.auth === 0) throw new Error('Credenciales incorrectas');
  if (onProgress) onProgress(30);
  const [streams, cats] = await Promise.all([
    _fetchJson(`${base}&action=get_live_streams`, signal, false),
    _fetchJson(`${base}&action=get_live_categories`, signal, false),
  ]);
  if (onProgress) onProgress(80);
  const catMap = {};
  _toArray(cats).forEach(c => { catMap[c.category_id] = c.category_name; });
  const channels = _toArray(streams).map((s, i) => ({
    id: i,
    name: s.name?.trim() || '',
    _search: _normalize(s.name),
    logo: s.stream_icon || '',
    group: _cleanTvCategoryName(catMap[s.category_id]),
    countryCode: detectCountry(s.name, catMap[s.category_id] || 'Sin categoría'),
    url: `${server}/live/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${s.stream_id}.ts`,
    streamId: s.stream_id,
    streamMeta: _detectStreamMeta(s.name, catMap[s.category_id], s.stream_type, s.container_extension, s.direct_source)
  }));
  if (onProgress) onProgress(100);
  return { channels, serverInfo: info.server_info };
}

export async function loadVod(server, user, pass, onProgress, signal) {
  const base = `${server}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;
  if (onProgress) onProgress(10);
  const [streams, cats] = await Promise.all([
    _fetchJson(`${base}&action=get_vod_streams`, signal, false),
    _fetchJson(`${base}&action=get_vod_categories`, signal, false)
  ]);
  if (onProgress) onProgress(80);
  const catMap = {};
  _toArray(cats).forEach(c => { catMap[c.category_id] = c.category_name; });
  const streamsWithKeys = _toArray(streams).map(s => {
    let addedNum = parseInt(s.added, 10) || 0;
    let yr = _extractYear(s);
    if (yr === 0 && addedNum > 0) {
      const ms = addedNum < 100000000000 ? addedNum * 1000 : addedNum;
      yr = new Date(ms).getFullYear();
    }
    return { ...s, _year: yr, _added: addedNum };
  });
  streamsWithKeys.sort((a, b) => (b._year !== a._year ? b._year - a._year : b._added - a._added));
  const movies = streamsWithKeys.map(s => ({
    id: `vod_${s.stream_id}`,
    name: s.name?.trim() || '',
    _search: _normalize(s.name),
    logo: s.stream_icon || '',
    group: _cleanVodCategoryName(catMap[s.category_id]),
    countryCode: detectCountry(s.name, catMap[s.category_id]),
    url: `${server}/movie/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${s.stream_id}.${s.container_extension || 'mp4'}`,
    streamId: s.stream_id,
    type: 'vod',
    streamMeta: _detectStreamMeta(s.name, catMap[s.category_id], s.container_extension, s.stream_type)
  }));
  if (onProgress) onProgress(100);
  return movies;
}

export async function loadSeries(server, user, pass, onProgress, signal) {
  const base = `${server}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;
  if (onProgress) onProgress(10);
  const [seriesList, cats] = await Promise.all([
    _fetchJson(`${base}&action=get_series`, signal, false),
    _fetchJson(`${base}&action=get_series_categories`, signal, false)
  ]);
  if (onProgress) onProgress(80);
  const catMap = {};
  _toArray(cats).forEach(c => { catMap[c.category_id] = c.category_name; });
  const seriesWithKeys = _toArray(seriesList).map(s => {
    let addedNum = parseInt(s.added || s.last_modified, 10) || 0;
    let yr = _extractYear(s);
    if (yr === 0 && addedNum > 0) {
      const ms = addedNum < 100000000000 ? addedNum * 1000 : addedNum;
      yr = new Date(ms).getFullYear();
    }
    return { ...s, _year: yr, _added: addedNum };
  });
  seriesWithKeys.sort((a, b) => (b._year !== a._year ? b._year - a._year : b._added - a._added));
  const series = seriesWithKeys.map(s => ({
    id: `series_${s.series_id}`,
    name: s.name?.trim() || '',
    _search: _normalize(s.name),
    logo: s.cover || s.stream_icon || '',
    group: _cleanSeriesCategoryName(catMap[s.category_id]),
    countryCode: detectCountry(s.name, catMap[s.category_id]),
    streamId: s.series_id,
    type: 'series'
  }));
  if (onProgress) onProgress(100);
  return series;
}

export async function loadM3U(url, onProgress, signal) {
  if (onProgress) onProgress(10);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error('Error al descargar la lista M3U');
  if (onProgress) onProgress(30);
  const text = await res.text();
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (onProgress) onProgress(50);
  return new Promise((resolve, reject) => {
    const worker = new Worker('js/m3u-worker.js');
    const abort = () => {
      worker.terminate();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
    const finish = (fn, value) => {
      signal?.removeEventListener('abort', abort);
      worker.terminate();
      fn(value);
    };
    worker.onmessage = (e) => {
      if (e.data.progress && onProgress) {
        onProgress(50 + (e.data.progress * 0.5));
      } else if (e.data.channelsBuffer) {
        const str = new TextDecoder().decode(e.data.channelsBuffer);
        const channels = JSON.parse(str);
        if (onProgress) onProgress(100);
        finish(resolve, channels);
      } else if (e.data.channels) {
        if (onProgress) onProgress(100);
        finish(resolve, e.data.channels);
      } else if (e.data.error) {
        finish(reject, new Error(e.data.error));
      }
    };
    worker.onerror = (err) => {
      finish(reject, err);
    };
    worker.postMessage({ content: text });
  });
}
