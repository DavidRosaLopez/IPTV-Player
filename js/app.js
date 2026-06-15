/**
 * app.js — Main controller / view router
 * Integrates VirtualList, optimized playlist, AVPlay, EPG
 */
const App = (() => {
  let _channels        = [];
  let _groups          = [];
  let _currentGroup    = '__all__';
  let _currentList     = null;
  let _focusZone       = 'channels'; // 'groups' | 'channels'
  let _groupIdx        = 0;
  let _toastTimer      = null;
  let _keysChannelsBound = false;
  let _setupEventsBound  = false;
  let _setupZone         = 'tabs'; // 'tabs' | 'content'
  let _setupTabIdx       = 0;
  let _setupContentIdx   = 0;

  // ── INIT ─────────────────────────────────────────────
  function init() {
    KeyHandler.init();
    Favorites.init();

    const lastId = Storage.getLastList();
    const lists  = Storage.getLists();
    const list   = lists.find(l => l.id === lastId) || (lists.length ? lists[0] : null);

    if (list) { _loadList(list); }
    else      { showView('setup'); _initSetupView(); }
  }

  // ── VIEWS ─────────────────────────────────────────────
  function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById('view-' + name);
    if (el) el.classList.add('active');
    if (name === 'channels') _initChannelsKeys();
    if (name === 'epg')      _renderEPGView();
    if (name === 'setup')    _initSetupView();
  }

  // ── SETUP ─────────────────────────────────────────────
  function _getSetupTabs() { return Array.from(document.querySelectorAll('#view-setup .tab-btn')); }
  function _getSetupContent() { return Array.from(document.querySelectorAll('#view-setup .tab-content.active .tv-input, #view-setup .tab-content.active .btn-primary, #view-setup .tab-content.active .btn-secondary, #view-setup .tab-content.active .saved-item')); }

  function _updateSetupFocus() {
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
      document.activeElement.blur();
    }
    document.querySelectorAll('#view-setup .focused').forEach(e => e.classList.remove('focused'));
    if (_setupZone === 'tabs') {
      const t = _getSetupTabs();
      if (t[_setupTabIdx]) {
        t[_setupTabIdx].classList.add('focused');
        t[_setupTabIdx].scrollIntoView({ block: 'nearest' });
      }
    } else {
      const c = _getSetupContent();
      if (c[_setupContentIdx]) {
        c[_setupContentIdx].classList.add('focused');
        c[_setupContentIdx].scrollIntoView({ block: 'nearest' });
      } else {
        _setupZone = 'tabs';
        _updateSetupFocus();
      }
    }
  }

  function _initSetupView() {
    _renderSavedLists();

    const handleRemoteList = (list) => {
      list.id = list.id || _uid();
      _saveList(list);
      showToast('Lista remota sincronizada', 'success');
      _loadList(list);
    };

    if (typeof Sync !== 'undefined') {
      Sync.init(handleRemoteList);
    }

    _setupZone = 'tabs';
    _updateSetupFocus();

    if (_setupEventsBound) return;
    _setupEventsBound = true;

    document.querySelectorAll('.tab-btn').forEach((btn, idx) =>
      btn.addEventListener('click', () => {
        _setupZone = 'tabs';
        _setupTabIdx = idx;
        _switchTab(btn.dataset.tab);
        _updateSetupFocus();
      })
    );

    _on('btn-add-m3u',     () => _addM3U());
    _on('btn-test-m3u',    () => _testM3U());
    _on('btn-add-xtream',  () => _addXtream());
    _on('btn-test-xtream', () => _testXtream());

    // D-pad navigation for setup
    KeyHandler.on('RIGHT', () => {
      if (_isView('setup') && _setupZone === 'tabs') {
        _setupTabIdx = Math.min(_getSetupTabs().length - 1, _setupTabIdx + 1);
        _getSetupTabs()[_setupTabIdx]?.click();
        return true;
      }
    });

    KeyHandler.on('LEFT', () => {
      if (_isView('setup') && _setupZone === 'tabs') {
        _setupTabIdx = Math.max(0, _setupTabIdx - 1);
        _getSetupTabs()[_setupTabIdx]?.click();
        return true;
      }
    });

    KeyHandler.on('DOWN', () => {
      if (!_isView('setup')) return;
      if (_setupZone === 'tabs') {
        _setupZone = 'content';
        _setupContentIdx = 0;
      } else {
        _setupContentIdx = Math.min(_getSetupContent().length - 1, _setupContentIdx + 1);
      }
      _updateSetupFocus();
      return true;
    });

    KeyHandler.on('UP', () => {
      if (!_isView('setup')) return;
      if (_setupZone === 'content') {
        if (_setupContentIdx === 0) _setupZone = 'tabs';
        else _setupContentIdx--;
        _updateSetupFocus();
      }
      return true;
    });

    KeyHandler.on('ENTER', () => {
      if (!_isView('setup')) return;
      if (_setupZone === 'tabs') {
        _getSetupTabs()[_setupTabIdx]?.click();
        _setupZone = 'content';
        _setupContentIdx = 0;
        _updateSetupFocus();
      } else {
        const el = _getSetupContent()[_setupContentIdx];
        if (el) {
          if (el.tagName === 'INPUT') el.focus();
          else el.click();
        }
      }
      return true;
    });
  }

  function _switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-content-' + tab));
  }

  async function _addM3U() {
    const name = _val('m3u-name') || 'Lista M3U';
    const url  = _val('m3u-url');
    const epg  = _val('m3u-epg');
    if (!url) { _setStatus('m3u-status', 'Introduce una URL', 'error'); return; }
    
    const list = { id: _uid(), name, type: 'm3u', url, epgUrl: epg };
    _saveList(list);

    showLoading('Descargando lista...');
    try {
      const channels = await Playlist.loadM3U(url, pct => showLoading(`Cargando lista… ${pct}%`));
      _channels = channels;
      hideLoading();
      await _afterLoad(list);
    } catch(e) { hideLoading(); _setStatus('m3u-status', '✗ ' + e.message, 'error'); }
  }

  async function _testM3U() {
    const url = _val('m3u-url');
    if (!url) return;
    _setStatus('m3u-status', 'Probando...', '');
    try {
      const res = await fetch(url, { method: 'HEAD' });
      _setStatus('m3u-status', res.ok ? '✓ URL accesible' : '✗ HTTP ' + res.status, res.ok ? 'success' : 'error');
    } catch { _setStatus('m3u-status', '✗ No se puede conectar', 'error'); }
  }

  async function _addXtream() {
    const name   = _val('xt-name') || 'Xtream IPTV';
    const server = _val('xt-server').replace(/\/+$/, '');
    const user   = _val('xt-user');
    const pass   = _val('xt-pass');
    if (!server || !user || !pass) { _setStatus('xt-status', 'Rellena todos los campos', 'error'); return; }
    
    const list = { id: _uid(), name, type: 'xtream', server, user, pass };
    _saveList(list);

    showLoading('Conectando...');
    try {
      const { channels, epgUrl } = await Playlist.loadXtream(server, user, pass, pct => showLoading(`Cargando canales… ${pct}%`));
      _channels = channels;
      if (epgUrl) {
        list.epgUrl = epgUrl;
        const lists = Storage.getLists().map(l => l.id === list.id ? list : l);
        Storage.saveLists(lists);
      }
      hideLoading();
      await _afterLoad(list);
    } catch(e) { hideLoading(); _setStatus('xt-status', '✗ ' + e.message, 'error'); }
  }

  async function _testXtream() {
    const server = _val('xt-server').replace(/\/+$/,'');
    const user   = _val('xt-user');
    const pass   = _val('xt-pass');
    if (!server || !user || !pass) return;
    _setStatus('xt-status', 'Probando...', '');
    try {
      const r  = await fetch(`${server}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`);
      const d  = await r.json();
      const ok = d?.user_info?.auth === 1;
      _setStatus('xt-status', ok ? '✓ Credenciales correctas' : '✗ Credenciales incorrectas', ok ? 'success' : 'error');
    } catch { _setStatus('xt-status', '✗ No se puede conectar', 'error'); }
  }

  function _renderSavedLists() {
    const lists = Storage.getLists();
    const el = document.getElementById('saved-list');
    if (!el) return;
    if (!lists.length) { el.innerHTML = '<p class="empty-msg">No hay listas guardadas</p>'; return; }
    el.innerHTML = '';
    lists.forEach(list => {
      const item = document.createElement('div');
      item.className = 'saved-item focusable';
      item.innerHTML = `
        <span class="saved-item-icon">${list.type === 'xtream' ? '🔑' : '📋'}</span>
        <div class="saved-item-info">
          <div class="saved-item-name">${list.name}</div>
          <div class="saved-item-type">${list.type === 'xtream' ? 'Xtream · ' + list.server : 'M3U8'}</div>
        </div>
        <button class="saved-item-del" data-id="${list.id}">🗑</button>`;
      item.querySelector('.saved-item-del').addEventListener('click', e => { e.stopPropagation(); _deleteList(list.id); });
      item.addEventListener('click', () => _loadList(list));
      el.appendChild(item);
    });
  }

  function _deleteList(id) {
    Storage.saveLists(Storage.getLists().filter(l => l.id !== id));
    Playlist.clearGroupCache();
    _renderSavedLists();
    showToast('Lista eliminada', 'info');
  }

  async function _loadList(list) {
    _currentList = list;
    Storage.setLastList(list.id);
    showLoading('Cargando canales…');
    try {
      if (list.type === 'xtream') {
        const r = await Playlist.loadXtream(list.server, list.user, list.pass, pct => showLoading(`Cargando… ${pct}%`));
        _channels = r.channels;
        if (!list.epgUrl && r.epgUrl) list.epgUrl = r.epgUrl;
      } else {
        _channels = await Playlist.loadM3U(list.url, pct => showLoading(`Cargando… ${pct}%`));
      }
      await _afterLoad(list);
    } catch(e) {
      hideLoading();
      showToast('Error cargando lista', 'error');
      showView('setup');
      _initSetupView();
    }
  }

  async function _afterLoad(list) {
    Playlist.clearGroupCache();
    _groups = Playlist.getGroups(_channels);
    _currentGroup = '__all__';
    _groupIdx     = 0;

    // Load EPG in background — don't block channel list
    if (list.epgUrl) {
      showLoading('Cargando guía EPG…');
      
      // Extraemos solo los IDs de canales que realmente tenemos cargados
      const validIds = new Set();
      _channels.forEach(c => {
        if (c.epgId) validIds.add(c.epgId);
        else if (c.name) validIds.add(c.name); // Algunos M3U usan el nombre como ID fallback
      });

      EPG.load(list.epgUrl, validIds).then(() => hideLoading());
    } else {
      hideLoading();
    }

    Search.init(_channels);
    Player.init(_changeChannelRelative);
    showView('channels');
    _renderGroups();
    renderChannels();
    _setFocusZone('channels');
  }

  // ── CHANNELS VIEW ─────────────────────────────────────
  function _initChannelsKeys() {
    if (_keysChannelsBound) return;
    _keysChannelsBound = true;

    KeyHandler.on('LEFT',  () => { if (_isView('channels')) { _setFocusZone('groups');   return true; } });
    KeyHandler.on('RIGHT', () => { if (_isView('channels') && _focusZone === 'groups') { _setFocusZone('channels'); return true; } });
    KeyHandler.on('UP',    () => { if (_isView('channels')) { _moveActive('up');   return true; } });
    KeyHandler.on('DOWN',  () => { if (_isView('channels')) { _moveActive('down'); return true; } });

    KeyHandler.on('ENTER', () => {
      if (!_isView('channels')) return;
      const searchBtn = document.getElementById('btn-open-search');
      if (searchBtn && searchBtn.classList.contains('focused')) {
        Search.open();
        return true;
      }
      if (_focusZone === 'channels') {
        const ch = VirtualList.getCurrentItem();
        if (ch) _playChannel(ch);
        return true;
      }
      if (_focusZone === 'groups') { _selectGroup(_groups[_groupIdx]); return true; }
    });

    KeyHandler.on('LONG_OK', () => {
      if (_isView('channels') && _focusZone === 'channels') {
        const ch = VirtualList.getCurrentItem();
        if (ch) { Favorites.toggle(ch); renderChannels(); }
      }
      return true;
    });
    KeyHandler.on('BACK',   () => {
      if (_isView('channels')) {
        if (Search.isOpen()) { Search.close(); return true; }
        try { tizen?.application?.getCurrentApplication()?.exit(); } catch(e) {}
        return true;
      }
    });

    _on('btn-open-search', () => Search.open());
    _on('btn-open-setup',  () => { showView('setup'); _initSetupView(); });
  }

  function _renderGroups() {
    const list = document.getElementById('group-list');
    if (!list) return;
    list.innerHTML = '';
    _groups.forEach((g, i) => {
      const cnt = g.id === '__all__'  ? _channels.length :
                  g.id === '__favs__' ? Favorites.getIds().length :
                  _channels.filter(c => c.group === g.id).length;
      const li = document.createElement('li');
      li.className = 'group-item' + (i === _groupIdx ? ' focused' : '') + (g.id === _currentGroup ? ' active' : '');
      li.dataset.idx = i;
      li.innerHTML = `<span>${g.name}</span><span class="group-count">${cnt}</span>`;
      li.addEventListener('click', () => { _groupIdx = i; _selectGroup(g); });
      list.appendChild(li);
    });
  }

  function _selectGroup(group) {
    if (!group) return;
    _currentGroup = group.id;
    _groupIdx     = _groups.findIndex(g => g.id === group.id);
    _renderGroups();
    renderChannels();
    _setFocusZone('channels');
  }

  function renderChannels(list) {
    const favIds = new Set(Favorites.getIds());
    let items;
    if (list) {
      items = list;
    } else {
      items = Playlist.filterByGroup(_channels, _currentGroup, favIds);
      // Favorites first in "Todos"
      if (_currentGroup === '__all__') {
        const favs = items.filter(c => favIds.has(c.id));
        const rest = items.filter(c => !favIds.has(c.id));
        items = [...favs, ...rest];
      }
    }

    const cnt = document.getElementById('channel-count');
    if (cnt) cnt.textContent = items.length + ' canales';

    VirtualList.init({
      containerId:  'channel-grid',
      items,
      onSelect:     ch => _playChannel(ch),
      onHover:      ch => _previewChannel(ch),
      getFavBadge:  id => favIds.has(id),
      getEpgNow:    epgId => EPG.getNow(epgId),
    });

    if (items[0]) _previewChannel(items[0]);
  }

  function _moveActive(dir) {
    if (_focusZone === 'groups') {
      const items = document.querySelectorAll('.group-item');
      if (!items.length) return;
      let curr = Array.from(items).findIndex(e => e.classList.contains('focused'));
      if (curr === -1) curr = 0;
      const next = KeyHandler.navigate(items, curr, dir);
      KeyHandler.setFocus(items[next]);
    } else {
      const searchBtn = document.getElementById('btn-open-search');
      if (searchBtn && searchBtn.classList.contains('focused')) {
        if (dir === 'down') {
          VirtualList.setFocused(0);
          KeyHandler.setFocus(document.querySelector('.channel-card.focused'));
        } else if (dir === 'left') {
          _setFocusZone('groups');
        }
        return;
      }

      const curIdx = VirtualList.getFocused();
      if (dir === 'up' && curIdx < 3) {
        // Mover el foco al botón de buscar
        KeyHandler.setFocus(searchBtn);
        // Ocultar preview de epg actual
        _setText('preview-name', 'Buscar Canales');
        _setText('preview-epg', '');
      } else {
        VirtualList.move(dir);
        KeyHandler.setFocus(document.querySelector('.channel-card.focused'));
      }
    }
  }

  function _setFocusZone(zone) {
    _focusZone = zone;
    // Visual feedback on groups
    document.querySelectorAll('.group-item').forEach((g, i) => {
      g.classList.toggle('focused', zone === 'groups' && i === _groupIdx);
    });
  }

  function _previewChannel(ch) {
    const logo = document.getElementById('preview-logo');
    const name = document.getElementById('preview-name');
    const epg  = document.getElementById('preview-epg');
    if (logo) logo.src = ch.logo || '';
    if (name) name.textContent = ch.name;
    if (epg) {
      const now = EPG.getNow(ch.epgId);
      epg.textContent = now
        ? `${now.title}\n${_fmt(now.start)} – ${_fmt(now.end)}`
        : 'Sin datos EPG';
    }
  }

  function _toggleFav() {
    const ch = VirtualList.getCurrentItem();
    if (!ch) return;
    const added = Favorites.toggle(ch.id);
    showToast(added ? '★ Añadido a favoritos' : '☆ Eliminado de favoritos', 'info');
    renderChannels();
  }

  // ── PLAYER ───────────────────────────────────────────
  function _playChannel(ch) {
    if (!ch) return;
    Player.play(ch);
    showView('player');
  }

  function _changeChannelRelative(dir) {
    const cur  = Player.getCurrent();
    if (!cur) return;
    const items = VirtualList;
    const curIdx = VirtualList.getFocused();
    const nextIdx = dir === 'next' ? curIdx + 1 : curIdx - 1;
    const next = VirtualList.getItem(nextIdx);
    if (next) { VirtualList.setFocused(nextIdx); Player.play(next); }
  }

  // ── EPG VIEW ──────────────────────────────────────────
  function _renderEPGView() {
    const timeEl = document.getElementById('epg-current-time');
    if (timeEl) timeEl.textContent = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    const subset = _channels.slice(0, 60);
    EPG.render(subset, 'epg-grid', 'epg-channels-col', 'epg-timeline');

    const prev = document.getElementById('epg-prev');
    const next = document.getElementById('epg-next');
    if (prev) prev.onclick = () => { EPG.shiftOffset(-3 * 3600000); _renderEPGView(); };
    if (next) next.onclick = () => { EPG.shiftOffset( 3 * 3600000); _renderEPGView(); };

    KeyHandler.on('BACK',  () => { if (_isView('epg')) { EPG.resetOffset(); showView('channels'); return true; } });
    KeyHandler.on('GREEN', () => { if (_isView('epg')) { EPG.resetOffset(); showView('channels'); return true; } });
  }

  // ── UTILS ─────────────────────────────────────────────
  function showLoading(msg) {
    document.getElementById('loading')?.classList.remove('hidden');
    const m = document.getElementById('loading-msg');
    if (m) m.textContent = msg || 'Cargando…';
  }
  function hideLoading() { document.getElementById('loading')?.classList.add('hidden'); }

  function showToast(msg, type = 'info') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className   = 'toast ' + type;
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
  }

  function _saveList(list) {
    const lists = Storage.getLists();
    
    // Evitar guardar duplicados exactos
    if (list.type === 'm3u') {
      if (lists.find(l => l.url === list.url)) return;
    } else {
      if (lists.find(l => l.server === list.server && l.user === list.user)) return;
    }
    
    lists.push(list);
    Storage.saveLists(lists);
  }

  function _setStatus(id, msg, cls) {
    const el = document.getElementById(id);
    if (el) { el.textContent = msg; el.className = 'status-msg ' + cls; }
  }

  function _on(id, fn) {
    document.getElementById(id)?.addEventListener('click', fn);
  }

  function _val(id) {
    return document.getElementById(id)?.value.trim() || '';
  }

  function _isView(name) {
    return document.getElementById('view-' + name)?.classList.contains('active');
  }

  function _uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
  function _fmt(d) { return d?.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) || ''; }

  window.addEventListener('load', init);
  return { showView, showToast, showLoading, hideLoading, renderChannels };
})();
