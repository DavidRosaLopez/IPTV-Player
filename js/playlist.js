/**
 * playlist.js — M3U8 parser (Web Worker) + Xtream Codes API
 * Performance optimized for large playlists (10k+ channels)
 */
const Playlist = (() => {

  // ── M3U8 via Web Worker ───────────────────────────────
  function loadM3U(url, onProgress) {
    return new Promise(async (resolve, reject) => {
      let res;
      try {
        res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch(e) { return reject(e); }

      const text = await res.text();
      _parseInWorker(text, onProgress).then(resolve).catch(reject);
    });
  }

  function parseM3UText(text, onProgress) {
    return _parseInWorker(text, onProgress);
  }

  function _parseInWorker(text, onProgress) {
    return new Promise((resolve, reject) => {
      try {
        const worker = new Worker('js/m3u-worker.js');
        worker.onmessage = (e) => {
          if (e.data.type === 'progress' && onProgress) onProgress(e.data.pct);
          if (e.data.type === 'done') {
            worker.terminate();
            resolve(_buildSearchIndex(e.data.channels));
          }
        };
        worker.onerror = (err) => { worker.terminate(); reject(err); };
        worker.postMessage({ text });
      } catch(e) {
        // Fallback: parse synchronously if Worker not available
        resolve(_buildSearchIndex(_parseSync(text)));
      }
    });
  }

  // Synchronous fallback parser
  function _parseSync(text) {
    const channels = [];
    const lines = text.split('\n');
    let meta = {};
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('#EXTINF')) {
        meta = _parseExtInf(line);
      } else if (!line.startsWith('#') && meta.name) {
        channels.push({ ...meta, url: line, id: channels.length });
        meta = {};
      }
    }
    return channels;
  }

  function _parseExtInf(line) {
    const meta = {};
    const attrReg = /(\S+)="([^"]*)"/g;
    let m;
    while ((m = attrReg.exec(line)) !== null) {
      const key = m[1].toLowerCase().replace('tvg-', '');
      meta[key] = m[2];
    }
    const comma = line.lastIndexOf(',');
    if (comma !== -1) meta.name = line.slice(comma + 1).trim();
    meta.group = meta['group-title'] || 'Sin categoría';
    meta.epgId = meta.id || meta.name;
    return meta;
  }

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

  // ── XTREAM CODES ─────────────────────────────────────
  async function loadXtream(server, user, pass, onProgress) {
    const base = `${server}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;

    if (onProgress) onProgress(10);
    const info = await _fetchJson(`${base}`, true); // auth: always fresh
    if (!info || info.user_info?.auth === 0) throw new Error('Credenciales incorrectas');

    if (onProgress) onProgress(30);
    const [streams, cats] = await Promise.all([
      _fetchJson(`${base}&action=get_live_streams`),    // browser-cached
      _fetchJson(`${base}&action=get_live_categories`), // browser-cached
    ]);
    if (onProgress) onProgress(80);

    const catMap = {};
    (cats || []).forEach(c => { catMap[c.category_id] = c.category_name; });

    const channels = (streams || []).map((s, i) => ({
      id:       i,
      name:     s.name,
      _search:  _normalize(s.name),
      logo:     s.stream_icon || '',
      group:    catMap[s.category_id] || 'Sin categoría',
      epgId:    s.epg_channel_id || s.name,
      url:      `${server}/live/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${s.stream_id}.m3u8`,
      streamId: s.stream_id,
    }));

    if (onProgress) onProgress(100);
    const epgUrl = `${server}/xmltv.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;
    return { channels, epgUrl, serverInfo: info.server_info };
  }

  async function _fetchJson(url, noCache = false) {
    try {
      const res = await fetch(url, { cache: noCache ? 'no-store' : 'force-cache' });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }

  // ── GROUPS (cached) ───────────────────────────────────
  let _groupCache = null;
  function getGroups(channels) {
    if (_groupCache) return _groupCache;
    const seen = new Set();
    const groups = [{ id: '__all__', name: '📺 Todos los canales' },
                    { id: '__favs__', name: '♥ Favoritos' }];
    for (const ch of channels) {
      if (!seen.has(ch.group)) {
        seen.add(ch.group);
        groups.push({ id: ch.group, name: ch.group });
      }
    }
    _groupCache = groups;
    return groups;
  }

  function clearGroupCache() { _groupCache = null; }

  function filterByGroup(channels, groupId, favIds) {
    if (groupId === '__all__')  return channels;
    if (groupId === '__favs__') return channels.filter(c => favIds && favIds.has(c.id));
    return channels.filter(c => c.group === groupId);
  }

  // Fast search using pre-built index
  function search(channels, query) {
    if (!query) return channels;
    const qTokens = _normalize(query).split(' ').filter(Boolean);
    return channels.filter(c => qTokens.every(t => c._search.includes(t)));
  }

  return { loadM3U, parseM3UText, loadXtream, getGroups, clearGroupCache, filterByGroup, search };
})();
