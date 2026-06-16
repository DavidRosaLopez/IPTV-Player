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
      url:      `${server}/live/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${s.stream_id}.m3u8`,
      streamId: s.stream_id
    }));

    if (onProgress) onProgress(100);
    return { channels, serverInfo: info.server_info };
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
    const groups = [{ id: '__all__', name: '<span class="material-symbols-rounded" style="vertical-align:bottom; margin-right:8px">tv</span> Todos los canales' },
                    { id: '__favs__', name: '<span class="material-symbols-rounded" style="vertical-align:bottom; margin-right:8px">favorite</span> Favoritos' }];
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

  return { loadXtream, search, filterByGroup, getGroups, clearGroupCache };
})();
