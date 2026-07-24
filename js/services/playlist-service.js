import { normalizeCountryCode } from '../countries.js';
import { Platform } from '../platform.js';

function _normalize(str) {
  return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function _toArray(obj) {
  if (!obj) return [];
  if (Array.isArray(obj)) return obj;
  if (typeof obj === 'object') return Object.values(obj);
  return [];
}

function _normalizeMediaUrl(base, value) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (/^(https?:|data:image\/)/i.test(url)) return url;
  try {
    return new URL(url, base).toString();
  } catch (e) {
    return '';
  }
}

function _buildLiveUrl(server, user, pass, streamId) {
  const ext = Platform.isWindows ? 'm3u8' : 'ts';
  return `${server}/live/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${streamId}.${ext}`;
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
  if (nUnaccented.match(/\b(4K|UHD|2160P|3840P|8K)\b/)) return '💎 4K / UHD';
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
  if (nUnaccented.match(/\b(4K|UHD|2160P|3840P|8K)\b/)) return '💎 4K / UHD';
  if (nUnaccented.match(/NETFLIX/)) return '🟥 Netflix';
  if (nUnaccented.match(/HBO|MAX/)) return '🟣 HBO Max';
  if (nUnaccented.match(/\b(PRIME|AMAZON)\b/)) return '🟦 Amazon Prime';
  if (nUnaccented.match(/DISNEY/)) return '✨ Disney+';
  if (nUnaccented.match(/APPLE/)) return '🍏 Apple TV+';
  if (nUnaccented.match(/MOVISTAR/)) return 'Ⓜ️ Movistar+';
  if (nUnaccented.match(/PARAMOUNT/)) return '⛰️ Paramount+';
  if (nUnaccented.match(/ATRESPLAYER|RTVE|MITELE|SKYSHOWTIME/)) return '📺 Nacionales / Otras Apps';
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

function _isSpanishTitle(name) {
  const n = String(name || '').trim().toUpperCase();
  return /^(?:ES(?:\b|[-_.: ]|$)|(?:(?:4K|UHD|HDR|8K)(?:\s*[-_.: ]\s*)+)*ES(?:\b|[-_.: ]|$)|ES(?:\s*[-_.: ]\s*)+(?:4K|UHD|HDR|8K)\b)/i.test(n);
}

function _sortByGroupThenRecency(a, b) {
  const ga = String(a.group || '');
  const gb = String(b.group || '');
  if (ga !== gb) return ga.localeCompare(gb, 'es');
  if (b._year !== a._year) return b._year - a._year;
  if (b._added !== a._added) return b._added - a._added;
  return String(a.name || '').localeCompare(String(b.name || ''), 'es');
}

function _is4kName(name) {
  return /\b(4K|UHD|2160P|3840P|8K)\b/i.test(String(name || ''));
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

let _m3uWorker = null;
let _m3uJobId = 0;
let _m3uPending = null;

function _disposeM3UWorker() {
  if (!_m3uWorker) return;
  _m3uWorker.onmessage = null;
  _m3uWorker.onerror = null;
  _m3uWorker.terminate();
  _m3uWorker = null;
}

function _clearM3UPending() {
  const pending = _m3uPending;
  _m3uPending = null;
  if (pending?.signal) pending.signal.removeEventListener('abort', pending.abort);
  return pending;
}

function _ensureM3UWorker() {
  if (_m3uWorker) return _m3uWorker;
  _m3uWorker = new Worker('js/m3u-worker.js');
  _m3uWorker.onmessage = (e) => {
    const { jobId, progress, channelsBuffer, channels, error } = e.data || {};
    if (!_m3uPending || jobId !== _m3uPending.jobId) return;
    if (typeof progress === 'number') {
      if (_m3uPending.onProgress) _m3uPending.onProgress(50 + (progress * 0.5));
      return;
    }
    const pending = _clearM3UPending();
    if (channelsBuffer) {
      const str = new TextDecoder().decode(channelsBuffer);
      pending.resolve(JSON.parse(str));
    } else if (channels) {
      pending.resolve(channels);
    } else if (error) {
      pending.reject(new Error(error));
    }
  };
  _m3uWorker.onerror = (err) => {
    if (!_m3uPending) return;
    const pending = _clearM3UPending();
    _disposeM3UWorker();
    pending.reject(err);
  };
  return _m3uWorker;
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
    id: `tv_${s.stream_id}`,
    name: s.name?.trim() || '',
    _search: _normalize(s.name),
    logo: _normalizeMediaUrl(server, s.stream_icon),
    group: _cleanTvCategoryName(catMap[s.category_id]),
    countryCode: detectCountry(s.name, catMap[s.category_id] || 'Sin categoría'),
    url: _buildLiveUrl(server, user, pass, s.stream_id),
    streamId: s.stream_id,
    epgChannelId: s.epg_channel_id || s.epg_id || s.epgId || s.tvg_id || null,
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
  const streamsWithKeys = _toArray(streams).filter(s => _isSpanishTitle(s.name || s.title)).map(s => {
    let addedNum = parseInt(s.added, 10) || 0;
    let yr = _extractYear(s);
    if (yr === 0 && addedNum > 0) {
      const ms = addedNum < 100000000000 ? addedNum * 1000 : addedNum;
      yr = new Date(ms).getFullYear();
    }
    return { ...s, _year: yr, _added: addedNum };
  });
  streamsWithKeys.sort(_sortByGroupThenRecency);
  const movies = streamsWithKeys.map(s => {
    const meta = _detectStreamMeta(s.name, catMap[s.category_id], s.container_extension, s.stream_type);
    const rawGroup = _cleanVodCategoryName(catMap[s.category_id]);
    const group = _is4kName(s.name) ? '💎 4K / UHD' : rawGroup;
    return {
      id: `vod_${s.stream_id}`,
      name: s.name?.trim() || '',
      _search: _normalize(s.name),
      logo: _normalizeMediaUrl(server, s.stream_icon),
      group,
      countryCode: detectCountry(s.name, catMap[s.category_id]),
      url: `${server}/movie/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${s.stream_id}.${s.container_extension || 'mp4'}`,
      streamId: s.stream_id,
      type: 'vod',
      _year: s._year,
      _added: s._added,
      streamMeta: meta
    };
  });
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
  const seriesWithKeys = _toArray(seriesList).filter(s => _isSpanishTitle(s.name || s.title)).map(s => {
    let addedNum = parseInt(s.added || s.last_modified, 10) || 0;
    let yr = _extractYear(s);
    if (yr === 0 && addedNum > 0) {
      const ms = addedNum < 100000000000 ? addedNum * 1000 : addedNum;
      yr = new Date(ms).getFullYear();
    }
    return { ...s, _year: yr, _added: addedNum };
  });
  seriesWithKeys.sort(_sortByGroupThenRecency);
  const series = seriesWithKeys.map(s => {
    const meta2 = _detectStreamMeta(s.name, catMap[s.category_id]);
    const rawGroup2 = _cleanSeriesCategoryName(catMap[s.category_id]);
    const group2 = _is4kName(s.name) ? '💎 4K / UHD' : rawGroup2;
    return {
      id: `series_${s.series_id}`,
      name: s.name?.trim() || '',
      _search: _normalize(s.name),
      logo: _normalizeMediaUrl(server, s.cover || s.stream_icon),
      group: group2,
      countryCode: detectCountry(s.name, catMap[s.category_id]),
      streamId: s.series_id,
      type: 'series',
      _year: s._year,
      _added: s._added
    };
  });
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
    if (_m3uPending) {
      const pending = _clearM3UPending();
      _disposeM3UWorker();
      pending.reject(new DOMException('Aborted', 'AbortError'));
    }
    const worker = _ensureM3UWorker();
    const jobId = ++_m3uJobId;
    const abort = () => {
      if (_m3uPending && _m3uPending.jobId === jobId) {
        const pending = _clearM3UPending();
        _disposeM3UWorker();
        pending.reject(new DOMException('Aborted', 'AbortError'));
      }
    };
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
    _m3uPending = {
      jobId,
      resolve,
      reject,
      onProgress,
      signal,
      abort,
    };
    worker.postMessage({ content: text, jobId });
  });
}
