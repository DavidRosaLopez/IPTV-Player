/**
 * view-channels.js — Controlador de la vista principal de Canales
 */
const ViewChannels = (() => {
  const COUNTRY_MAP = {
    'ALL':   { emoji: '🌎', name: 'Todos' },
    'ES':    { emoji: '🇪🇸', name: 'España' },
    'US':    { emoji: '🇺🇸', name: 'USA' },
    'UK':    { emoji: '🇬🇧', name: 'UK' },
    'FR':    { emoji: '🇫🇷', name: 'Francia' },
    'DE':    { emoji: '🇩🇪', name: 'Alemania' },
    'IT':    { emoji: '🇮🇹', name: 'Italia' },
    'PT':    { emoji: '🇵🇹', name: 'Portugal' },
    'AR':    { emoji: '🇸🇦', name: 'Árabe' },
    'MX':    { emoji: '🇲🇽', name: 'México' },
    'CO':    { emoji: '🇨🇴', name: 'Colombia' },
    'CL':    { emoji: '🇨🇱', name: 'Chile' },
    'PE':    { emoji: '🇵🇪', name: 'Perú' },
    'VE':    { emoji: '🇻🇪', name: 'Venezuela' },
    'BR':    { emoji: '🇧🇷', name: 'Brasil' },
    'LAT':   { emoji: '🌎', name: 'Latino' },
    'TR':    { emoji: '🇹🇷', name: 'Turquía' },
    'PL':    { emoji: '🇵🇱', name: 'Polonia' },
    'RO':    { emoji: '🇷🇴', name: 'Rumania' },
    'NL':    { emoji: '🇳🇱', name: 'Holanda' },
    'BE':    { emoji: '🇧🇪', name: 'Bélgica' },
    'CH':    { emoji: '🇨🇭', name: 'Suiza' },
    'OTROS': { emoji: '🌐', name: 'Otros' }
  };

  let _keysBound = false;
  let _sidebarFocusIdx = 2; // 0=search, 1=setup, 2+=groups
  let _focusZone = 'channels'; // 'groups' | 'channels' | 'exit' | 'countries'
  let _exitFocusIdx = 0; // 0 = Cancel, 1 = Exit
  let _prevFocusZone = 'channels';
  let _sidebarFocusablesCache = null;
  let _countryFocusIdx = 0;

  function onShow(fromView) {
    initKeys();
    _updateCountriesList();
    
    // Si volvemos del reproductor, sincronizamos la vista (país, categoría y canal)
    if (fromView === 'player' && typeof Player !== 'undefined' && Player.getCurrent()) {
      const ch = Player.getCurrent();
      const channels = Store.get('channels') || [];
      const favIds = new Set(Favorites.getIds());

      // 1. Establecer el país del canal activo
      const country = ch.countryCode || 'ALL';
      const codes = Store.get('countries') || ['ALL'];
      let cIdx = codes.indexOf(country);
      if (cIdx < 0) {
        Store.set('currentCountry', 'ALL');
        _countryFocusIdx = 0;
      } else {
        Store.set('currentCountry', country);
        _countryFocusIdx = cIdx;
      }
      _updateCountryClasses();

      // 2. Obtener grupos y buscar la categoría del canal activo
      const currentCountry = Store.get('currentCountry');
      const groups = Playlist.getGroups(channels, currentCountry);
      Store.set('groups', groups);

      let groupObj = groups.find(g => g.id === ch.group);
      if (!groupObj) {
        groupObj = groups.find(g => g.id === '__all__');
      }
      
      let gIdx = groups.findIndex(g => g.id === (groupObj ? groupObj.id : '__all__'));
      Store.set('currentGroup', groupObj ? groupObj.id : '__all__');
      Store.set('groupIdx', gIdx >= 0 ? gIdx : 0);
      _sidebarFocusIdx = (gIdx >= 0 ? gIdx : 0) + 2;

      // Renderizar los grupos actualizados
      renderGroups();

      // 3. Buscar el índice del canal en la lista filtrada de la categoría
      let filtered = Playlist.filterByGroup(channels, Store.get('currentGroup'), favIds, currentCountry);
      let chIdx = filtered.findIndex(c => c.id === ch.id);
      
      // Si no está en esa categoría (por ejemplo, si se cambió a un canal huérfano), forzar a "Todos"
      if (chIdx < 0) {
        Store.set('currentGroup', '__all__');
        Store.set('groupIdx', 0);
        _sidebarFocusIdx = 2;
        renderGroups();
        filtered = Playlist.filterByGroup(channels, '__all__', favIds, currentCountry);
        chIdx = filtered.findIndex(c => c.id === ch.id);
      }

      // Renderizar los canales filtrados
      renderChannels();

      // 4. Enfocar el canal en el grid
      if (chIdx >= 0 && typeof VirtualList !== 'undefined') {
        VirtualList.setFocused(chIdx);
      }
      _setFocusZone('channels');
    } else if (fromView === 'player') {
      _setFocusZone('channels');
    } else {
      // Al entrar por primera vez (o desde Configuración), no hay selección activa de país o categoría
      Store.set('currentCountry', null);
      Store.set('currentGroup', null);
      _countryFocusIdx = 0;
      
      renderCountries();
      
      // Limpiamos los contenedores de grupos y canales en la UI
      const groupList = document.getElementById('group-list');
      if (groupList) groupList.innerHTML = '';
      
      const channelCount = document.getElementById('channel-count');
      if (channelCount) channelCount.textContent = '0 canales';
      
      if (typeof VirtualList !== 'undefined') {
        VirtualList.init({
          containerId: 'channel-grid',
          items: [],
          onSelect: () => {}
        });
      }
      
      _setFocusZone('countries');
    }

    // Si el reproductor tiene canal en PiP, reafirmar su posición
    if (typeof Player !== 'undefined') {
      if (Player.getMode() === 'PIP' && Player.getCurrent()) {
        Player.reapplyPip();
      }
    }
  }




  function _updateCountriesList() {
    const channels = Store.get('channels') || [];
    const codesSet = new Set();
    for (const c of channels) {
      if (c.countryCode) codesSet.add(c.countryCode);
    }
    const codes = Array.from(codesSet).sort();
    const idxOtros = codes.indexOf('OTROS');
    if (idxOtros >= 0) {
      codes.splice(idxOtros, 1);
      codes.push('OTROS');
    }
    
    // Store complete list for the settings screen
    Store.set('allCountries', [...codes]);

    const visible = Storage.getVisibleCountries();
    let filteredCodes = codes;
    if (visible !== null) {
      filteredCodes = codes.filter(code => visible.includes(code));
    }
    filteredCodes.unshift('ALL');
    Store.set('countries', filteredCodes);

    let currentCountry = Store.get('currentCountry');
    if (currentCountry) {
      if (!filteredCodes.includes(currentCountry)) {
        Store.set('currentCountry', 'ALL');
        _countryFocusIdx = 0;
        if (typeof Playlist !== 'undefined') {
          Playlist.clearGroupCache();
          Store.set('groups', Playlist.getGroups(channels, 'ALL'));
        }
        Store.set('currentGroup', '__all__');
        Store.set('groupIdx', 0);
        _sidebarFocusIdx = 2;
      } else {
        _countryFocusIdx = filteredCodes.indexOf(currentCountry);
        if (_countryFocusIdx < 0) _countryFocusIdx = 0;
      }
    } else {
      _countryFocusIdx = 0;
    }
  }


  function renderCountries() {
    const container = document.getElementById('country-filter');
    if (!container) return;
    container.innerHTML = '';
    const codes = Store.get('countries') || ['ALL'];
    const currentCountry = Store.get('currentCountry') || 'ALL';
    
    codes.forEach((code, i) => {
      const info = COUNTRY_MAP[code] || { emoji: '🏳️', name: code };
      const el = document.createElement('div');
      el.className = 'country-item' + (i === _countryFocusIdx && _focusZone === 'countries' ? ' focused' : '') + (code === currentCountry ? ' active' : '');
      el.innerHTML = `${info.emoji} ${info.name}`;
      el.addEventListener('click', () => _selectCountry(code, i));
      container.appendChild(el);
    });
  }

  function _selectCountry(code, idx) {
    _countryFocusIdx = idx;
    Store.set('currentCountry', code);
    
    Playlist.clearGroupCache();
    
    const channels = Store.get('channels');
    Store.set('groups', Playlist.getGroups(channels, code));
    
    Store.set('currentGroup', '__all__');
    Store.set('groupIdx', 0);
    _sidebarFocusIdx = 2; // Focus 'Todos los canales'
    
    _updateCountryClasses();
    renderGroups();
    renderChannels();
  }

  function _updateCountryClasses() {
    const codes = Store.get('countries') || ['ALL'];
    const currentCountry = Store.get('currentCountry') || 'ALL';
    const els = document.querySelectorAll('.country-item');
    els.forEach((el, i) => {
      el.classList.toggle('focused', i === _countryFocusIdx && _focusZone === 'countries');
      el.classList.toggle('active', codes[i] === currentCountry);
      
      if (i === _countryFocusIdx && _focusZone === 'countries') {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    });
  }

  function renderGroups() {
    _sidebarFocusablesCache = null;
    const list = document.getElementById('group-list');
    if (!list) return;
    list.innerHTML = '';
    
    const currentCountry = Store.get('currentCountry') || 'ALL';
    const channels = Store.get('channels');
    
    const groups = Playlist.getGroups(channels, currentCountry);
    Store.set('groups', groups);
    
    const currentGroup = Store.get('currentGroup');
    const groupIdx = Store.get('groupIdx') || 0;

    groups.forEach((g, i) => {
      const cnt = g.id === '__all__'  ? Playlist.filterByGroup(channels, '__all__', null, currentCountry).length :
                  g.id === '__favs__' ? Favorites.getIds().length :
                  channels.filter(c => c.group === g.id && (currentCountry === 'ALL' || c.countryCode === currentCountry)).length;
      const li = document.createElement('li');
      li.className = 'group-item' + (i === groupIdx && _focusZone === 'groups' ? ' focused' : '') + (g.id === currentGroup ? ' active' : '');
      li.dataset.idx = i;
      li.innerHTML = `<span>${g.name}</span><span class="group-count">${cnt}</span>`;
      li.addEventListener('click', () => { Store.set('groupIdx', i); _selectGroup(g); });
      list.appendChild(li);
    });
  }

  function _updateGroupClasses() {
    const groups = Store.get('groups');
    const currentGroup = Store.get('currentGroup');
    const groupIdx = Store.get('groupIdx');
    const els = document.querySelectorAll('.group-item');
    els.forEach((el, i) => {
      el.classList.toggle('focused', i === groupIdx && _focusZone === 'groups');
      el.classList.toggle('active', groups[i]?.id === currentGroup);
    });
    _sidebarFocusablesCache = null;
  }

  function _updateGroupCounts() {
    const channels = Store.get('channels');
    const groups = Store.get('groups');
    const currentCountry = Store.get('currentCountry') || 'ALL';

    const cache = { 
      '__all__': Playlist.filterByGroup(channels, '__all__', null, currentCountry).length,
      '__favs__': Favorites.getIds().length
    };
    for (const ch of channels) {
      if (currentCountry === 'ALL' || ch.countryCode === currentCountry) {
        cache[ch.group] = (cache[ch.group] || 0) + 1;
      }
    }

    const els = document.querySelectorAll('.group-item');
    if (!els.length || !groups.length) return;
    els.forEach((el, i) => {
      const g = groups[i];
      if (!g) return;
      const countEl = el.querySelector('.group-count');
      if (countEl) countEl.textContent = cache[g.id] || 0;
    });
  }

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
    const groups = Store.get('groups');
    Store.set('currentGroup', group.id);
    const gIdx = groups.findIndex(g => g.id === group.id);
    Store.set('groupIdx', gIdx);
    _sidebarFocusIdx = gIdx + 2;
    _updateGroupClasses();
    renderChannels();
    _setFocusZone('channels');
  }

  function renderChannels(list) {
    const channels = Store.get('channels');
    const currentGroup = Store.get('currentGroup');
    const currentCountry = Store.get('currentCountry') || 'ALL';
    const favIds = new Set(Favorites.getIds());
    let items;
    if (list) {
      items = list;
    } else {
      items = Playlist.filterByGroup(channels, currentGroup, favIds, currentCountry);
    }

    const cnt = document.getElementById('channel-count');
    if (cnt) cnt.textContent = items.length + ' canales';

    VirtualList.init({
      containerId:  'channel-grid',
      items,
      onSelect:     ch => _playChannel(ch),
      getFavBadge:  id => Favorites.isFav(id)
    });

    _updateGroupCounts();
  }

  function _playChannel(ch) {
    if (!ch) return;
    Storage.setLastChannel(ch.id);

    if (typeof Player !== 'undefined' && Player.getMode() === 'PIP' && Player.getCurrent()?.id === ch.id) {
      Player.expandToFullscreen();
      Router.showView('player');
      document.getElementById('view-player').focus();
      return;
    }

    Router.showView('player');
    document.getElementById('view-player').focus();
    Player.play(ch);
  }

  function _moveActive(dir) {
    if (_focusZone === 'countries') {
      const codes = Store.get('countries') || ['ALL'];
      if (dir === 'up') {
        _sidebarFocusIdx = 1; // Focus setup button
        _setFocusZone('groups');
      } else if (dir === 'down') {
        _sidebarFocusIdx = 2; // Focus first category (Todos los canales)
        _setFocusZone('groups');
      } else if (dir === 'left') {
        _countryFocusIdx = Math.max(0, _countryFocusIdx - 1);
        _updateCountryClasses();
      } else if (dir === 'right') {
        _countryFocusIdx = Math.min(codes.length - 1, _countryFocusIdx + 1);
        _updateCountryClasses();
      }
      return;
    }

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
          _setFocusZone('countries');
          return;
        } else if (_sidebarFocusIdx > 2) {
          _sidebarFocusIdx--;
        }
      } else if (dir === 'down') {
        if (_sidebarFocusIdx === 0 || _sidebarFocusIdx === 1) {
          _setFocusZone('countries');
          return;
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

      if (dir === 'left' && curIdx % 3 === 0) {
        _setFocusZone('groups');
        return;
      }

      VirtualList.move(dir);
      KeyHandler.setFocus(document.querySelector('.channel-card.focused'), true);
      
      const focused = VirtualList.getCurrentItem();
      if (focused && typeof Player !== 'undefined') Player.schedulePreview(focused);
    }
  }

  function _setFocusZone(zone) {
    _focusZone = zone;
    if (zone === 'groups') {
      document.querySelector('.channel-card.focused')?.classList.remove('focused');
      document.querySelectorAll('.country-item.focused').forEach(e => e.classList.remove('focused'));
      const els = _getSidebarFocusables();
      const next = els[_sidebarFocusIdx];
      if (next) next.classList.add('focused');
    } else if (zone === 'countries') {
      document.querySelector('.channel-card.focused')?.classList.remove('focused');
      document.querySelectorAll('.sidebar-btn.focused, .group-item.focused').forEach(e => e.classList.remove('focused'));
      _updateCountryClasses();
    } else if (zone === 'channels') {
      document.querySelectorAll('.sidebar-btn.focused, .group-item.focused, .country-item.focused').forEach(e => e.classList.remove('focused'));
      if (typeof VirtualList !== 'undefined') {
        VirtualList.setFocused(VirtualList.getFocused());
      }
      setTimeout(() => {
        KeyHandler.setFocus(document.querySelector('.channel-card.focused') || document.querySelector('.channel-card'), true);
      }, 50);
    }
  }

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

  function refreshUI() {
    _updateGroupCounts();
    if (typeof VirtualList !== 'undefined') {
      VirtualList.refreshVisible();
    }
  }

  function initKeys() {
    if (_keysBound) return;
    _keysBound = true;

    KeyHandler.on('LEFT',  () => { 
      if (Router.isView('channels')) { 
        if (document.activeElement && document.activeElement.tagName === 'INPUT') return false;
        if (_focusZone === 'exit') { _moveExit('left'); return true; }
        _moveActive('left'); return true; 
      } 
    });
    KeyHandler.on('RIGHT', () => { 
      if (Router.isView('channels')) { 
        if (document.activeElement && document.activeElement.tagName === 'INPUT') return false;
        if (_focusZone === 'exit') { _moveExit('right'); return true; }
        _moveActive('right'); return true; 
      } 
    });
    KeyHandler.on('UP',    () => { 
      if (Router.isView('channels') && _focusZone !== 'exit') { 
        if (document.activeElement && document.activeElement.tagName === 'INPUT') return false;
        _moveActive('up'); return true; 
      } 
    });
    KeyHandler.on('DOWN',  () => { 
      if (Router.isView('channels') && _focusZone !== 'exit') { 
        if (document.activeElement && document.activeElement.tagName === 'INPUT') {
          document.activeElement.blur();
          _setFocusZone('channels');
          return true;
        }
        _moveActive('down'); return true; 
      } 
    });

    KeyHandler.on('ENTER', () => {
      if (!Router.isView('channels')) return;
      
      if (_focusZone === 'countries') {
        const codes = Store.get('countries') || ['ALL'];
        const code = codes[_countryFocusIdx];
        if (code) {
          _selectCountry(code, _countryFocusIdx);
          _sidebarFocusIdx = 2; // Enfoca el primer elemento de categorías ("Todos los canales")
          _setFocusZone('groups');
        }
        return true;
      }

      if (_focusZone === 'groups') {
        const els = _getSidebarFocusables();
        const el = els[_sidebarFocusIdx];
        if (!el) return;
        if (el.id === 'btn-open-search') {
          Search.open();
        } else if (el.id === 'btn-open-setup') {
          Router.showView('setup');
        } else {
          const gIdx = _sidebarFocusIdx - 2;
          const groups = Store.get('groups');
          if (groups[gIdx]) _selectGroup(groups[gIdx]);
        }
        return true;
      }
      
      if (_focusZone === 'channels') {
        if (document.activeElement && document.activeElement.tagName === 'INPUT') return false;
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
      if (Router.isView('channels') && _focusZone === 'channels') {
        const ch = VirtualList.getCurrentItem();
        if (ch) { 
          Favorites.toggle(ch.id); 
          _updateGroupCounts();
          
          if (Store.get('currentGroup') === '__favs__') {
            renderChannels(); 
          } else {
            VirtualList.refreshVisible(); 
          }
        }
      }
      return true;
    });

    KeyHandler.on('BACK', () => {
      if (Router.isView('channels')) {
        if (Search.isOpen()) { Search.close(); return true; }
        if (_focusZone === 'exit') { _hideExitPopup(); return true; }
        
        if (_focusZone === 'channels') {
          _setFocusZone('groups');
        } else if (_focusZone === 'groups') {
          _setFocusZone('countries');
        } else {
          _showExitPopup();
        }
        return true;
      }
    });

    document.getElementById('btn-open-search')?.addEventListener('click', () => Search.open());
    document.getElementById('btn-open-setup')?.addEventListener('click', () => { Router.showView('setup'); });
  }

  function playChannelRelative(dir) {
    const cur  = Player.getCurrent();
    if (!cur) return;
    const curIdx = VirtualList.getFocused();
    const nextIdx = dir === 'next' ? curIdx + 1 : curIdx - 1;
    const next = VirtualList.getItem(nextIdx);
    if (next) { VirtualList.setFocused(nextIdx); _playChannel(next); }
  }

  return { onShow, renderGroups, renderChannels, refreshUI, playChannelRelative };
})();
