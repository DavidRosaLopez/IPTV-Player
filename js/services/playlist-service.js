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
  const streams = await _fetchJson(`${base}&action=get_vod_streams`, signal, false);
  if (onProgress) onProgress(80);
  const movies = _toArray(streams).map(s => {
    const meta = _detectStreamMeta(s.name, s.container_extension, s.stream_type);
    return {
      id: `vod_${s.stream_id}`,
      name: s.name?.trim() || '',
      _search: _normalize(s.name),
      logo: _normalizeMediaUrl(server, s.stream_icon),
      group: '__all__',
      countryCode: 'ALL',
      url: `${server}/movie/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${s.stream_id}.${s.container_extension || 'mp4'}`,
      streamId: s.stream_id,
      type: 'vod',
      streamMeta: meta
    };
  });
  if (onProgress) onProgress(100);
  return movies;
}

export async function loadSeries(server, user, pass, onProgress, signal) {
  const base = `${server}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;
  if (onProgress) onProgress(10);
  const seriesList = await _fetchJson(`${base}&action=get_series`, signal, false);
  if (onProgress) onProgress(80);
  const series = _toArray(seriesList).map(s => {
    const meta2 = _detectStreamMeta(s.name, s.container_extension, s.stream_type);
    return {
      id: `series_${s.series_id}`,
      name: s.name?.trim() || '',
      _search: _normalize(s.name),
      logo: _normalizeMediaUrl(server, s.cover || s.stream_icon),
      group: '__all__',
      countryCode: 'ALL',
      streamId: s.series_id,
      type: 'series',
      streamMeta: meta2
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
