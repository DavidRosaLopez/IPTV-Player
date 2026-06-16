/**
 * app.js — Main controller / view router
 * Integrates VirtualList, optimized playlist, AVPlay, EPG
 */
const App = (() => {
  let _channels        = [];
  let _groups          = [];
  let _groupCountsCache = null;
  let _sidebarFocusIdx = 2; // 0=search, 1=setup, 2+=groups
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

    const lastListId = Storage.getLastList();
    const lists = Storage.getLists();
    const list = lists.find(l => l.id === lastListId);

    // Si ya había una lista cargada previamente, la saltamos a la vista principal
    if (list) {
      _loadList(list);
      return;
    }

    showView('setup');
    _initSetupView();

    // Por petición del usuario, siempre abrir por defecto la pestaña de Xtream Codes y autorellenar
    const tabIdx = Array.from(document.querySelectorAll('.tab-btn')).findIndex(b => b.dataset.tab === 'xtream');
    if (tabIdx >= 0) {
      _setupTabIdx = tabIdx;
      _switchTab('xtream');
      _setupZone = 'content'; // Enfocar el contenido para hacer login rápido

      const elName = document.getElementById('xt-name');
      const elServer = document.getElementById('xt-server');
      const elUser = document.getElementById('xt-user');
      const elPass = document.getElementById('xt-pass');
      
      if (elName) elName.value = 'http://cf.futuremyprovt.com';
      if (elServer) elServer.value = 'http://cf.futuremyprovt.com';
      if (elUser) elUser.value = 'f7f23dd33459';
      if (elPass) elPass.value = '604a8e6f2c';

      _updateSetupFocus();
    }
  }

  // ── VIEWS ─────────────────────────────────────────────
  function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById('view-' + name);
    if (el) el.classList.add('active');
    if (name === 'channels') {
      _initChannelsKeys();
      _updateGroupCounts();
      if (typeof VirtualList !== 'undefined' && _focusZone === 'channels') {
        VirtualList.setFocused(VirtualList.getFocused());
        setTimeout(() => {
          const target = document.querySelector('.channel-card.focused') || document.querySelector('.channel-card');
          if (target) KeyHandler.setFocus(target);
        }, 50);
      }
      // Si el reproductor tiene canal en PiP, reafirmar su posición
      // Si no hay nada reproduciéndose, arrancar preview del canal enfocado
      if (typeof Player !== 'undefined') {
        if (Player.getMode() === 'PIP' && Player.getCurrent()) {
          Player.reapplyPip();
        }
      }
    }
    if (name === 'epg')      _renderEPGView();
    if (name === 'setup')    _initSetupView();
  }

  function showToast(msg, type = 'info') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = `toast ${type}`;
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.className = 'toast hidden', 3000);
  }

  // ── SETUP ─────────────────────────────────────────────
  function _getSetupTabs() { return Array.from(document.querySelectorAll('#view-setup .tab-btn')); }
  function _getSetupContent() { return Array.from(document.querySelectorAll('#view-setup .tab-content.active .tv-input, #view-setup .tab-content.active .btn-primary, #view-setup .tab-content.active .btn-secondary, #view-setup .tab-content.active .saved-item, #view-setup .tab-content.active .saved-item-edit, #view-setup .tab-content.active .saved-item-del')); }

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

    _on('btn-add-xtream',  () => _addXtream());
    _on('btn-test-xtream', () => _testXtream());

    // D-pad navigation for setup
    KeyHandler.on('RIGHT', () => {
      if (!_isView('setup')) return;
      if (_setupZone === 'tabs') {
        _setupTabIdx = Math.min(_getSetupTabs().length - 1, _setupTabIdx + 1);
        _getSetupTabs()[_setupTabIdx]?.click();
      } else {
        _setupContentIdx = Math.min(_getSetupContent().length - 1, _setupContentIdx + 1);
        _updateSetupFocus();
      }
      return true;
    });

    KeyHandler.on('LEFT', () => {
      if (!_isView('setup')) return;
      if (_setupZone === 'tabs') {
        _setupTabIdx = Math.max(0, _setupTabIdx - 1);
        _getSetupTabs()[_setupTabIdx]?.click();
      } else {
        _setupContentIdx = Math.max(0, _setupContentIdx - 1);
        _updateSetupFocus();
      }
      return true;
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

  let _editingListId = null;

  async function _addXtream() {
    const name   = _val('xt-name') || 'Xtream IPTV';
    const server = _val('xt-server').replace(/\/+$/, '');
    const user   = _val('xt-user');
    const pass   = _val('xt-pass');
    if (!server || !user || !pass) { _setStatus('xt-status', 'Rellena todos los campos', 'error'); return; }

    const list = { id: _editingListId || _uid(), name, type: 'xtream', server, user, pass };
    _saveList(list);
    _editingListId = null;
    document.getElementById('btn-add-xtream').textContent = 'Añadir lista';

    const steps = [
      { id: 'auth',      label: 'Verificando credenciales' },
      { id: 'cats',      label: 'Obteniendo categorías' },
      { id: 'streams',   label: 'Cargando canales' },
      { id: 'build',     label: 'Construyendo lista' },
    ];
    SetupProgress.show('Conectando a Xtream Codes', server, steps);
    try {
      const { channels, epgUrl } = await Playlist.loadXtream(server, user, pass, pct => {
        SetupProgress.progress(pct);
        if (pct >= 10 && pct < 30)  SetupProgress.step('auth');
        if (pct >= 30 && pct < 80)  SetupProgress.step('cats'), SetupProgress.step('streams');
        if (pct >= 80)               SetupProgress.step('build');
      });
      _channels = channels;
      if (epgUrl) {
        list.epgUrl = epgUrl;
        const lists = Storage.getLists().map(l => l.id === list.id ? list : l);
        Storage.saveLists(lists);
      }
      SetupProgress.progress(100);
      Storage.setChannelCache(list.id, _channels);
      await new Promise(r => setTimeout(r, 400));
      SetupProgress.hide();
      await _afterLoad(list);
    } catch(e) {
      SetupProgress.hide();
      _setStatus('xt-status', '\u2717 ' + e.message, 'error');
    }
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
        <span class="saved-item-icon material-symbols-rounded">${list.type === 'xtream' ? 'key' : 'list_alt'}</span>
        <div class="saved-item-info">
          <div class="saved-item-name">${list.name}</div>
          <div class="saved-item-type">${list.type === 'xtream' ? 'Xtream · ' + list.server : 'M3U8'}</div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="saved-item-edit" data-id="${list.id}"><span class="material-symbols-rounded" style="font-size: 20px;">edit</span></button>
          <button class="saved-item-del" data-id="${list.id}"><span class="material-symbols-rounded" style="font-size: 20px;">delete</span></button>
        </div>`;
      
      item.querySelector('.saved-item-edit').addEventListener('click', e => { e.stopPropagation(); _editList(list); });
      item.querySelector('.saved-item-del').addEventListener('click', e => { e.stopPropagation(); _deleteList(list.id); });
      item.addEventListener('click', () => _loadList(list));
      el.appendChild(item);
    });
  }

  function _editList(list) {
    _editingListId = list.id;
    if (list.type === 'xtream') {
      document.getElementById('xt-name').value = list.name || '';
      document.getElementById('xt-server').value = list.server || '';
      document.getElementById('xt-user').value = list.user || '';
      document.getElementById('xt-pass').value = list.pass || '';
      document.getElementById('btn-add-xtream').textContent = 'Guardar y Cargar';
      _switchTab('xtream');
    }
    _setupZone = 'content';
    _setupContentIdx = 0;
    _updateSetupFocus();
  }

  function _deleteList(id) {
    Storage.clearChannelCache(id);
    Storage.saveLists(Storage.getLists().filter(l => l.id !== id));
    Playlist.clearGroupCache();
    _renderSavedLists();
    showToast('Lista eliminada', 'info');
  }

  async function _loadList(list) {
    _currentList = list;
    Storage.setLastList(list.id);

    // ── Try channel cache first (TTL 6h) ──
    const cached = Storage.getChannelCache(list.id);
    if (cached) {
      _channels = cached;
      
      const steps = [{ id: 'cache', label: 'Cargando de caché local' }];
      SetupProgress.show('Cargando Lista', list.name, steps);
      SetupProgress.step('cache');
      SetupProgress.progress(100);
      await new Promise(r => setTimeout(r, 400));
      SetupProgress.hide();

      await _afterLoad(list, true /* fromCache */);
      return;
    }

    const steps = [
      { id: 'connect',   label: 'Conectando al servidor' },
      { id: 'download',  label: 'Descargando lista' },
      { id: 'parse',     label: 'Procesando canales' },
    ];
    SetupProgress.show('Cargando Lista', list.name, steps);

    try {
      SetupProgress.step('connect');
      if (list.type === 'xtream') {
        SetupProgress.step('download');
        const r = await Playlist.loadXtream(list.server, list.user, list.pass, pct => {
            SetupProgress.progress(Math.round(pct * 0.8));
            if (pct > 50) SetupProgress.step('parse');
        });
        _channels = r.channels;
        if (!list.epgUrl && r.epgUrl) list.epgUrl = r.epgUrl;
      } else {
        SetupProgress.step('download');
        _channels = await Playlist.loadM3U(list.url, pct => {
            SetupProgress.progress(Math.round(pct * 0.8));
            if (pct > 50) SetupProgress.step('parse');
        });
      }
      SetupProgress.progress(100);
      Storage.setChannelCache(list.id, _channels);
      await new Promise(r => setTimeout(r, 400));
      SetupProgress.hide();
      await _afterLoad(list);
    } catch(e) {
      SetupProgress.hide();
      showToast('Error cargando lista', 'error');
      showView('setup');
      _initSetupView();
    }
  }

  async function _afterLoad(list, fromCache = false) {
    Playlist.clearGroupCache();
    _groups = Playlist.getGroups(_channels);
    _groupCountsCache = null;
    _currentGroup = '__all__';
    _groupIdx     = 0;

    // Load EPG in background — don’t block channel list
    if (list.epgUrl) {
      if (!fromCache) showLoading('Cargando guía EPG…');
      const validIds = new Set();
      _channels.forEach(c => {
        if (c.epgId) validIds.add(c.epgId);
        else if (c.name) validIds.add(c.name);
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

    // Autocargar último canal: en PiP (no a pantalla completa) para mantener la lista visible
    const lastChannelId = Storage.getLastChannel();
    if (lastChannelId) {
      const ch = _channels.find(c => c.id === lastChannelId);
      if (ch) {
        // Pequeño delay para que VirtualList y el DOM estén listos
        setTimeout(() => Player.schedulePreview(ch), 300);
      }
    } else {
      // Sin último canal: preview del primer canal de la lista
      setTimeout(() => {
        const ch = VirtualList.getCurrentItem();
        if (ch) Player.schedulePreview(ch);
      }, 300);
    }
  }

  // ── CHANNELS VIEW ─────────────────────────────────────
  function _initChannelsKeys() {
    if (_keysChannelsBound) return;
    _keysChannelsBound = true;

    KeyHandler.on('LEFT',  () => { 
      if (_isView('channels')) { 
        if (_focusZone === 'exit') { _moveExit('left'); return true; }
        _moveActive('left'); return true; 
      } 
    });
    KeyHandler.on('RIGHT', () => { 
      if (_isView('channels')) { 
        if (_focusZone === 'exit') { _moveExit('right'); return true; }
        _moveActive('right'); return true; 
      } 
    });
    KeyHandler.on('UP',    () => { if (_isView('channels') && _focusZone !== 'exit') { _moveActive('up');    return true; } });
    KeyHandler.on('DOWN',  () => { if (_isView('channels') && _focusZone !== 'exit') { _moveActive('down');  return true; } });

    KeyHandler.on('ENTER', () => {
      if (!_isView('channels')) return;
      
      if (_focusZone === 'groups') {
        const els = _getSidebarFocusables();
        const el = els[_sidebarFocusIdx];
        if (!el) return;
        if (el.id === 'btn-open-search') {
          Search.open();
        } else if (el.id === 'btn-open-setup') {
          showView('setup');
        } else {
          // Es un grupo (índice 2 en adelante)
          const gIdx = _sidebarFocusIdx - 2;
          if (_groups[gIdx]) _selectGroup(_groups[gIdx]);
        }
        return true;
      }
      
      if (_focusZone === 'channels') {
        const ch = VirtualList.getCurrentItem();
        if (ch) _playChannel(ch);
        return true;
      }

      if (_focusZone === 'exit') {
        if (_exitFocusIdx === 0) {
          _hideExitPopup();
        } else {
          try { tizen?.application?.getCurrentApplication()?.exit(); } catch(e) {}
        }
        return true;
      }
    });

    KeyHandler.on('LONG_OK', () => {
      if (_isView('channels') && _focusZone === 'channels') {
        const ch = VirtualList.getCurrentItem();
        if (ch) { 
          Favorites.toggle(ch.id); 
          _updateGroupCounts();
          
          if (_currentGroup === '__favs__') {
            renderChannels(); // Requiere recargar la lista porque cambia el número de elementos
          } else {
            VirtualList.refreshVisible(); // Solo repinta el corazón al instante
          }
        }
      }
      return true;
    });

    KeyHandler.on('BACK', () => {
      if (_isView('channels')) {
        if (Search.isOpen()) { Search.close(); return true; }
        if (_focusZone === 'exit') { _hideExitPopup(); return true; }
        _showExitPopup();
        return true;
      }
    });

    _on('btn-open-search', () => Search.open());
    _on('btn-open-setup',  () => { showView('setup'); _initSetupView(); });
  }

  let _exitFocusIdx = 0; // 0 = Cancel, 1 = Exit
  let _prevFocusZone = 'channels';

  function _showExitPopup() {
    _prevFocusZone = _focusZone;
    _focusZone = 'exit';
    _exitFocusIdx = 0;
    const el = document.getElementById('exit-popup');
    if (el) el.classList.remove('hidden');
    _updateExitFocus();
  }

  function _hideExitPopup() {
    _focusZone = _prevFocusZone;
    const el = document.getElementById('exit-popup');
    if (el) el.classList.add('hidden');
  }

  function _moveExit(dir) {
    if (dir === 'left') _exitFocusIdx = 0;
    else if (dir === 'right') _exitFocusIdx = 1;
    _updateExitFocus();
  }

  function _updateExitFocus() {
    const cancel = document.getElementById('btn-exit-cancel');
    const confirm = document.getElementById('btn-exit-confirm');
    if (cancel) cancel.classList.toggle('focused', _exitFocusIdx === 0);
    if (confirm) confirm.classList.toggle('focused', _exitFocusIdx === 1);
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

  // Actualiza solo clases CSS de grupos sin re-renderizar el DOM
  function _updateGroupClasses() {
    const els = document.querySelectorAll('.group-item');
    els.forEach((el, i) => {
      el.classList.toggle('focused', i === _groupIdx);
      el.classList.toggle('active', _groups[i]?.id === _currentGroup);
    });
    _sidebarFocusablesCache = null; // invalidar cache
  }

  function _updateGroupCounts() {
    if (!_groupCountsCache) {
      _groupCountsCache = { '__all__': _channels.length };
      for (const ch of _channels) {
        _groupCountsCache[ch.group] = (_groupCountsCache[ch.group] || 0) + 1;
      }
    }
    _groupCountsCache['__favs__'] = Favorites.getIds().length;

    const els = document.querySelectorAll('.group-item');
    if (!els.length || !_groups.length) return;
    els.forEach((el, i) => {
      const g = _groups[i];
      if (!g) return;
      const countEl = el.querySelector('.group-count');
      if (countEl) countEl.textContent = _groupCountsCache[g.id] || 0;
    });
  }

  let _sidebarFocusablesCache = null;
  function _getSidebarFocusables() {
    if (_sidebarFocusablesCache) return _sidebarFocusablesCache;
    const list = [];
    const bs = document.getElementById('btn-open-search');
    const bc = document.getElementById('btn-open-setup');
    if (bs) list.push(bs);
    if (bc) list.push(bc);
    list.push(...Array.from(document.querySelectorAll('.group-item')));
    _sidebarFocusablesCache = list;
    return list;
  }

  function _selectGroup(group) {
    if (!group) return;
    _currentGroup = group.id;
    _groupIdx     = _groups.findIndex(g => g.id === group.id);
    _sidebarFocusIdx = _groupIdx + 2;
    _updateGroupClasses(); // Solo actualiza clases, no re-renderiza DOM
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
      getFavBadge:  id => Favorites.isFav(id),
      getEpgNow:    epgId => EPG.getNow(epgId),
    });

    _updateGroupCounts();
  }

  function refreshUI() {
    _updateGroupCounts();
    if (typeof VirtualList !== 'undefined') {
      VirtualList.refreshVisible();
    }
  }

  function _moveActive(dir) {
    if (_focusZone === 'groups') {
      const els = _getSidebarFocusables();
      if (!els.length) return;
      els[_sidebarFocusIdx]?.classList.remove('focused');

      if (dir === 'left') {
        if (_sidebarFocusIdx === 1) _sidebarFocusIdx = 0;
      } else if (dir === 'right') {
        if (_sidebarFocusIdx === 0) {
          _sidebarFocusIdx = 1;
        } else {
          _setFocusZone('channels');
          return;
        }
      } else if (dir === 'up') {
        if (_sidebarFocusIdx === 2) {
          _sidebarFocusIdx = 0; // De primer grupo a lupa
        } else if (_sidebarFocusIdx > 2) {
          _sidebarFocusIdx--;
        }
      } else if (dir === 'down') {
        if (_sidebarFocusIdx === 0 || _sidebarFocusIdx === 1) {
          _sidebarFocusIdx = 2; // De iconos a primer grupo
        } else {
          _sidebarFocusIdx = Math.min(els.length - 1, _sidebarFocusIdx + 1);
        }
      }

      const next = els[_sidebarFocusIdx];
      if (next) {
        next.classList.add('focused');
        next.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      }
    } else {
      const curIdx = VirtualList.getFocused();

      // Si pulsamos izquierda estando en la primera columna, volver al panel de grupos
      if (dir === 'left' && curIdx % 3 === 0) {
        _setFocusZone('groups');
        return;
      }

      VirtualList.move(dir);
      // skipScroll = true, VirtualList ya scrollea de forma más eficiente modificando scrollTop
      KeyHandler.setFocus(document.querySelector('.channel-card.focused'), true);
      // Preview del canal enfocado con delay para no saturar
      const focused = VirtualList.getCurrentItem();
      if (focused && typeof Player !== 'undefined') Player.schedulePreview(focused);
    }
  }

  function _setFocusZone(zone) {
    _focusZone = zone;
    if (zone === 'groups') {
      document.querySelector('.channel-card.focused')?.classList.remove('focused');
      const els = _getSidebarFocusables();
      const next = els[_sidebarFocusIdx];
      if (next) next.classList.add('focused');
    } else if (zone === 'channels') {
      document.querySelectorAll('.sidebar-btn.focused, .group-item.focused').forEach(e => e.classList.remove('focused'));
      if (typeof VirtualList !== 'undefined') {
        VirtualList.setFocused(VirtualList.getFocused());
      }
      setTimeout(() => {
        KeyHandler.setFocus(document.querySelector('.channel-card.focused') || document.querySelector('.channel-card'), true);
      }, 50);
    }
  }

  function _toggleFav() {
    const ch = VirtualList.getCurrentItem();
    if (!ch) return;
    const added = Favorites.toggle(ch.id);
    showToast(added ? '♥ Añadido a favoritos' : '♡ Eliminado de favoritos', 'info');
    renderChannels();
  }

  // ── PLAYER ──────────────────────────────────────
  function _playChannel(ch) {
    if (!ch) return;

    if (typeof Search !== 'undefined' && Search.isOpen()) {
      Search.close();
    }

    Storage.setLastChannel(ch.id);

    // Si ya hay PiP con este canal: expandir sin recargar
    if (typeof Player !== 'undefined' && Player.getMode() === 'PIP' &&
        Player.getCurrent()?.id === ch.id) {
      Player.expandToFullscreen();
      showView('player');
      document.getElementById('view-player').focus();
      return;
    }

    showView('player');
    document.getElementById('view-player').focus();
    Player.play(ch);
  }

  function _changeChannelRelative(dir) {
    const cur  = Player.getCurrent();
    if (!cur) return;
    const curIdx = VirtualList.getFocused();
    const nextIdx = dir === 'next' ? curIdx + 1 : curIdx - 1;
    const next = VirtualList.getItem(nextIdx);
    if (next) { VirtualList.setFocused(nextIdx); _playChannel(next); }
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

  function _saveList(list) {
    const lists = Storage.getLists();
    
    const idx = lists.findIndex(l => l.id === list.id);
    if (idx !== -1) {
      lists[idx] = list; // Update existing
    } else {
      // Evitar guardar duplicados exactos solo si es nueva
      if (list.type === 'm3u' && lists.find(l => l.url === list.url)) return;
      if (list.type === 'xtream' && lists.find(l => l.server === list.server && l.user === list.user)) return;
      lists.push(list);
    }
    
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
  return { showView, showToast, showLoading, hideLoading, renderChannels, refreshUI };
})();
