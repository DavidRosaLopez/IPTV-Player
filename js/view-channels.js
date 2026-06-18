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
  let _currentTab = 'tv';
  let _tabFocusIdx = 0;
  const TABS = ['tv', 'vod', 'series'];
  let _tabAbortController = null;

  function onShow(fromView) {
    if (fromView !== 'player') {
      _currentTab = 'tv';
    }
    document.querySelectorAll('.sidebar-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.type === _currentTab));
    initKeys();
    
    if (fromView !== 'player') {
      _updateCountriesList();
    }
    
    // Si volvemos del reproductor, sincronizamos la vista (país, categoría y canal)
    if (fromView === 'player' && typeof Player !== 'undefined' && Player.getCurrent()) {
      syncWithChannel(Player.getCurrent());
    } else if (fromView === 'player') {
      if (typeof InfoPopup !== 'undefined' && InfoPopup.isSuspended()) {
        InfoPopup.resume();
      } else {
        _setFocusZone('channels');
      }
    } else {
      // Al entrar por primera vez (o desde Configuración), preseleccionar "Todos" y "Canales"
      Store.set('currentCountry', null); // Forzar que _selectCountry haga el render completo
      renderCountries();
      _selectCountry('ALL', 0);
      _setFocusZone('groups');
    }

    // Si el reproductor tiene canal en PiP, reafirmar su posición
    if (typeof Player !== 'undefined') {
      if (Player.getMode() === 'PIP' && Player.getCurrent()) {
        Player.reapplyPip();
      }
    }
  }




  function _updateCountriesList() {
    const channels = _currentTab === 'tv' ? (Store.get('channels') || []) : (Store.get('currentData') || []);
    const codesSet = new Set();
    for (const c of channels) {
      if (c.countryCode) codesSet.add(c.countryCode);
    }
    const codes = Array.from(codesSet).sort((a, b) => {
      const nameA = (COUNTRY_MAP[a] || {name: a}).name;
      const nameB = (COUNTRY_MAP[b] || {name: b}).name;
      return nameA.localeCompare(nameB);
    });
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
          Store.set('groups', Playlist.getGroups(channels, 'ALL', _currentTab));
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
    container.style.display = '';
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
    const prevCountry = Store.get('currentCountry');
    _countryFocusIdx = idx;
    
    if (prevCountry === code) {
      const groupIdx = Store.get('groupIdx') || 0;
      _sidebarFocusIdx = groupIdx + 2;
      _updateCountryClasses();
      _setFocusZone('groups');
      return;
    }

    Store.set('currentCountry', code);
    
    Playlist.clearGroupCache();
    
    const channels = (_currentTab === 'tv' ? Store.get('channels') : Store.get('currentData')) || [];
    Store.set('groups', Playlist.getGroups(channels, code, _currentTab));
    
    Store.set('currentGroup', '__all__');
    Store.set('groupIdx', 0);
    _sidebarFocusIdx = 2; // Focus 'Todos los canales'
    
    _updateCountryClasses();
    renderGroups();
    renderChannels();
    _setFocusZone('groups');
  }

  function _updateCountryClasses() {
    const codes = Store.get('countries') || ['ALL'];
    const currentCountry = Store.get('currentCountry') || 'ALL';
    const els = document.querySelectorAll('.country-item');
    let focusedEl = null;

    els.forEach((el, i) => {
      const isFocused = i === _countryFocusIdx && _focusZone === 'countries';
      el.classList.toggle('focused', isFocused);
      el.classList.toggle('active', codes[i] === currentCountry);
      if (isFocused) focusedEl = el;
    });

    if (focusedEl) {
      focusedEl.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
    }
  }

  function renderGroups() {
    _sidebarFocusablesCache = null;
    const list = document.getElementById('group-list');
    if (!list) return;
    list.innerHTML = '';
    
    const currentCountry = Store.get('currentCountry') || 'ALL';
    const channels = (_currentTab === 'tv' ? Store.get('channels') : Store.get('currentData')) || [];
    
    const groups = Playlist.getGroups(channels, currentCountry, _currentTab);
    Store.set('groups', groups);
    
    const currentGroup = Store.get('currentGroup');
    const groupIdx = Store.get('groupIdx') || 0;

    const expandedFolders = Store.get('expandedFolders') || {};

    groups.forEach((g, i) => {
      if (g.isFolder) {
        const li = document.createElement('li');
        li.className = 'group-item folder-item' + (i === groupIdx && _focusZone === 'groups' ? ' focused' : '');
        li.dataset.idx = i;
        li.dataset.groupId = g.id;
        li.innerHTML = `<span>${g.name}</span><span class="material-symbols-rounded folder-icon">${expandedFolders[g.id] ? 'expand_less' : 'expand_more'}</span>`;
        li.addEventListener('click', () => { Store.set('groupIdx', i); _selectGroup(g); });
        list.appendChild(li);
        return;
      }

      const isChild = g.parentId ? true : false;
      const isHidden = isChild && !expandedFolders[g.parentId];
      
      const cnt = g.id === '__all__'  ? Playlist.filterByGroup(channels, '__all__', null, currentCountry).length :
                  g.id === '__favs__' ? Favorites.getIds().length :
                  channels.filter(c => c.group === g.id && (currentCountry === 'ALL' || c.countryCode === currentCountry)).length;
                  
      const li = document.createElement('li');
      li.className = 'group-item' + 
                     (isChild ? ' group-child' : '') + 
                     (isHidden ? ' hidden' : '') + 
                     (i === groupIdx && _focusZone === 'groups' ? ' focused' : '') + 
                     (g.id === currentGroup ? ' active' : '');
      li.dataset.idx = i;
      li.dataset.groupId = g.id;
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
    const channels = (_currentTab === 'tv' ? Store.get('channels') : Store.get('currentData')) || [];
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
    list.push(...Array.from(document.querySelectorAll('.group-item:not(.hidden)')));
    _sidebarFocusablesCache = list;
    return list;
  }

  function _selectGroup(g) {
    if (g.isFolder) {
      const expanded = Store.get('expandedFolders') || {};
      expanded[g.id] = !expanded[g.id];
      Store.set('expandedFolders', expanded);
      
      const folderId = g.id;
      renderGroups();
      
      const focusables = _getSidebarFocusables();
      const newIdx = focusables.findIndex(el => el.dataset && el.dataset.groupId === folderId);
      if (newIdx !== -1) _sidebarFocusIdx = newIdx;
      
      _setFocusZone('groups');
      return;
    }

    const prevGroup = Store.get('currentGroup');
    const groups = Store.get('groups');
    const gIdx = groups.findIndex(item => item.id === g.id);

    const channels = (_currentTab === 'tv' ? Store.get('channels') : Store.get('currentData')) || [];
    const favIds = new Set(Favorites.getIds());
    const currentCountry = Store.get('currentCountry') || 'ALL';
    const items = Playlist.filterByGroup(channels, g.id, favIds, currentCountry);

    if (prevGroup === g.id) {
      _sidebarFocusIdx = gIdx + 2;
      _updateGroupClasses();
      if (items.length > 0) {
        _setFocusZone('channels');
      }
      return;
    }

    Store.set('currentGroup', g.id);
    Store.set('groupIdx', gIdx);
    _sidebarFocusIdx = gIdx + 2;
    _updateGroupClasses();
    
    // Clear virtual list quickly to avoid lag
    VirtualList.update([]);
    renderChannels();
    
    if (items.length > 0) {
      _setFocusZone('channels');
    } else {
      _setFocusZone('groups');
    }
  }

  function renderChannels(list) {
    const channels = (_currentTab === 'tv' ? Store.get('channels') : Store.get('currentData')) || [];
    const currentGroup = Store.get('currentGroup');
    const currentCountry = Store.get('currentCountry') || 'ALL';
    const favIds = new Set(Favorites.getIds());
    let items;
    if (list) {
      items = list;
    } else {
      items = Playlist.filterByGroup(channels, currentGroup, favIds, currentCountry);
    }

    const groupNameEl = document.getElementById('current-group-name');
    if (groupNameEl) {
      if (!currentGroup) {
        groupNameEl.textContent = _currentTab === 'tv' ? 'TV' : (_currentTab === 'vod' ? 'Películas' : 'Series');
      } else if (currentGroup === '__all__') {
        groupNameEl.textContent = _currentTab === 'tv' ? 'Canales' : (_currentTab === 'vod' ? 'Películas' : 'Series');
      } else if (currentGroup === '__favs__') {
        groupNameEl.textContent = 'Favoritos';
      } else {
        const groups = Store.get('groups') || [];
        const gObj = groups.find(g => g.id === currentGroup);
        groupNameEl.textContent = gObj ? gObj.name : 'Canales';
      }
    }

    const cnt = document.getElementById('channel-count');
    if (cnt) {
      if (!currentGroup) {
        cnt.textContent = '';
        cnt.style.display = 'none';
      } else {
        cnt.style.display = '';
        cnt.textContent = items.length + (_currentTab === 'tv' ? ' canales' : (_currentTab === 'vod' ? ' películas' : ' series'));
      }
    }

    VirtualList.init({
      containerId:  'channel-grid',
      items,
      layout:       _currentTab === 'tv' ? 'tv' : 'poster',
      onSelect:     ch => _playChannel(ch),
      getFavBadge:  id => Favorites.isFav(id)
    });

    _updateGroupCounts();
  }

  function _playChannel(ch) {
    if (!ch) return;
    Storage.setLastChannel(ch.id);

    if (ch.type === 'vod' || ch.type === 'series') {
      if (typeof Search !== 'undefined' && Search.isOpen()) Search.close();
      if (typeof InfoPopup !== 'undefined') InfoPopup.show(ch);
      return;
    }

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
    if (_focusZone === 'tabs') {
      if (dir === 'left') {
        _tabFocusIdx = Math.max(0, _tabFocusIdx - 1);
        _setFocusZone('tabs');
      } else if (dir === 'right') {
        if (_tabFocusIdx === TABS.length - 1) {
          _setFocusZone('channels');
        } else {
          _tabFocusIdx = Math.min(TABS.length - 1, _tabFocusIdx + 1);
          _setFocusZone('tabs');
        }
      } else if (dir === 'down') {
        _setFocusZone('countries');
      } else if (dir === 'up') {
        _sidebarFocusIdx = 0;
        _setFocusZone('groups'); // Setup / search buttons
      }
      return;
    }
    if (_focusZone === 'countries') {
      const codes = Store.get('countries') || ['ALL'];
      if (dir === 'up') {
        _setFocusZone('tabs');
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
      const cols = _currentTab === 'tv' ? 3 : 6;

      if (dir === 'left' && curIdx % cols === 0) {
        _setFocusZone('groups');
        return;
      }
      if (dir === 'up' && curIdx < cols) {
        _setFocusZone('tabs');
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
    const viewEl = document.getElementById('view-channels');
    if (viewEl) {
      viewEl.setAttribute('data-focus', zone);
      viewEl.querySelectorAll('.focused').forEach(e => e.classList.remove('focused'));
    }
    
    if (zone === 'groups') {
      const els = _getSidebarFocusables();
      const next = els[_sidebarFocusIdx];
      if (next) next.classList.add('focused');
    } else if (zone === 'countries') {
      _updateCountryClasses();
    } else if (zone === 'tabs') {
      const tabs = document.querySelectorAll('.sidebar-tab-btn');
      if (tabs[_tabFocusIdx]) tabs[_tabFocusIdx].classList.add('focused');
    } else if (zone === 'channels') {
      if (typeof VirtualList !== 'undefined') {
        VirtualList.setFocused(VirtualList.getFocused());
        const ch = VirtualList.getCurrentItem();
        if (ch && typeof Player !== 'undefined') Player.schedulePreview(ch);
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
      if (typeof InfoPopup !== 'undefined' && InfoPopup.isVisible()) { return InfoPopup.handleKey('LEFT'); }
      if (Router.isView('channels')) { 
        if (document.activeElement && document.activeElement.tagName === 'INPUT') return false;
        if (_focusZone === 'exit') { _moveExit('left'); return true; }
        _moveActive('left'); return true; 
      } 
    });
    KeyHandler.on('RIGHT', () => { 
      if (typeof InfoPopup !== 'undefined' && InfoPopup.isVisible()) { return InfoPopup.handleKey('RIGHT'); }
      if (Router.isView('channels')) { 
        if (document.activeElement && document.activeElement.tagName === 'INPUT') return false;
        if (_focusZone === 'exit') { _moveExit('right'); return true; }
        _moveActive('right'); return true; 
      } 
    });
    KeyHandler.on('UP',    () => { 
      if (typeof InfoPopup !== 'undefined' && InfoPopup.isVisible()) { return InfoPopup.handleKey('UP'); }
      if (Router.isView('channels') && _focusZone !== 'exit') { 
        if (document.activeElement && document.activeElement.tagName === 'INPUT') return false;
        _moveActive('up'); return true; 
      } 
    });
    KeyHandler.on('DOWN',  () => { 
      if (typeof InfoPopup !== 'undefined' && InfoPopup.isVisible()) { return InfoPopup.handleKey('DOWN'); }
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
      if (typeof InfoPopup !== 'undefined' && InfoPopup.isVisible()) { return InfoPopup.handleKey('ENTER'); }
      if (!Router.isView('channels')) return;
      if (_focusZone === 'tabs') {
        const tabs = document.querySelectorAll('.sidebar-tab-btn');
        const tab = tabs[_tabFocusIdx];
        if (tab) {
           _switchTab(tab.dataset.type);
        }
        return true;
      }

      if (_focusZone === 'countries') {
        const codes = Store.get('countries') || ['ALL'];
        const code = codes[_countryFocusIdx];
        if (code) {
          _selectCountry(code, _countryFocusIdx);
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
      if (typeof InfoPopup !== 'undefined' && InfoPopup.isVisible()) { return true; }
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
      if (typeof InfoPopup !== 'undefined' && InfoPopup.isVisible()) { return InfoPopup.handleKey('BACK'); }
      if (Router.isView('channels')) {
        if (Search.isOpen()) { Search.close(); return true; }
        if (_focusZone === 'exit') { _hideExitPopup(); return true; }
        
        if (_focusZone === 'channels') {
          _setFocusZone('groups');
        } else if (_focusZone === 'groups') {
          _setFocusZone('countries');
        } else if (_focusZone === 'countries') {
          _setFocusZone('tabs');
        } else {
          _showExitPopup();
        }
        return true;
      }
    });

    
    document.querySelectorAll('.sidebar-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _tabFocusIdx = TABS.indexOf(btn.dataset.type);
        _setFocusZone('tabs');
        _switchTab(btn.dataset.type);
      });
    });

    document.getElementById('btn-open-search')?.addEventListener('click', () => Search.open());
    document.getElementById('btn-open-setup')?.addEventListener('click', () => { Router.showView('setup'); });
  }

  
  async function _switchTab(tabId) {
    if (_currentTab === tabId) return;
    
    if (_tabAbortController) {
      _tabAbortController.abort();
    }
    _tabAbortController = new AbortController();
    const signal = _tabAbortController.signal;

    _currentTab = tabId;
    Store.set('currentTab', _currentTab);
    
    // Si pasamos a VOD o Series, ocultamos el PIP
    if ((tabId === 'vod' || tabId === 'series') && typeof Player !== 'undefined') {
      Player.stop();
    }

    Playlist.clearGroupCache();

    // Resetear filtro de país al cambiar de pestaña
    Store.set('currentCountry', 'ALL');
    _countryFocusIdx = 0;
    renderCountries();
    
    // Update UI tabs
    document.querySelectorAll('.sidebar-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.type === tabId);
    });

    const groupNameEl = document.getElementById('current-group-name');
    if (groupNameEl) {
      groupNameEl.textContent = tabId === 'tv' ? 'TV' : (tabId === 'vod' ? 'Películas' : 'Series');
    }

    const list = Store.get('currentList');
    if (!list || list.type !== 'xtream') {
      Router.showToast('VOD y Series solo disponibles en cuentas Xtream Codes', 'info');
      return;
    }

    const channelCount = document.getElementById('channel-count');
    if (channelCount) {
      channelCount.style.display = '';
      channelCount.textContent = 'Cargando...';
    }
    document.getElementById('group-list').innerHTML = '';
    VirtualList.update([]);

    const grid = document.getElementById('channel-grid');
    const loader = document.getElementById('tab-loader');
    if (grid) grid.classList.add('hidden');
    if (loader) {
      if (tabId === 'tv') {
        loader.classList.add('hidden');
      } else {
        loader.classList.remove('hidden');
        document.getElementById('tab-loader-msg').textContent = tabId === 'vod' ? 'Cargando películas...' : 'Cargando series...';
      }
    }
    
    // Forzar renderizado del DOM antes de bloquear con IndexedDB/Parsing
    await new Promise(r => setTimeout(r, 10));
    if (_currentTab !== tabId) return; // Guard contra cambio rápido de pestaña

    let data = [];
    if (tabId === 'tv') {
      data = Store.get('channels') || [];
    } else if (tabId === 'vod') {
      let cached = await Storage.getVodCache(list.id);
      if (_currentTab !== tabId) return;

      if (!cached || cached.length === 0) {
        const steps = [{ id: 'vod', label: 'Descargando Películas...' }];
        SetupProgress.show('Películas', list.name, steps);
        try {
          cached = await Playlist.loadVod(list.server, list.user, list.pass, (p) => SetupProgress.progress(p), signal);
          if (_currentTab !== tabId) return;
          await Storage.setVodCache(list.id, cached);
        } catch (e) {
          if (e.name === 'AbortError') return; // Cancelado
          Router.showToast('Error cargando películas', 'error');
          cached = [];
        }
        SetupProgress.hide();
      }
      data = cached;
    } else if (tabId === 'series') {
      let cached = await Storage.getSeriesCache(list.id);
      if (_currentTab !== tabId) return;

      if (!cached || cached.length === 0) {
        const steps = [{ id: 'series', label: 'Descargando Series...' }];
        SetupProgress.show('Series', list.name, steps);
        try {
          cached = await Playlist.loadSeries(list.server, list.user, list.pass, (p) => SetupProgress.progress(p), signal);
          if (_currentTab !== tabId) return;
          await Storage.setSeriesCache(list.id, cached);
        } catch (e) {
          if (e.name === 'AbortError') return; // Cancelado
          Router.showToast('Error cargando series', 'error');
          cached = [];
        }
        SetupProgress.hide();
      }
      data = cached;
    }

    // Guardar en store y recargar
    Store.set('currentGroup', null);
    
    // Configurar VirtualList layout
    if (typeof VirtualList !== 'undefined') {
      VirtualList.init({
        containerId: 'channel-grid',
        items: [],
        layout: tabId === 'tv' ? 'tv' : 'poster',
        onSelect: (ch) => _playChannel(ch),
        getFavBadge: (id) => Favorites.isFav(id)
      });
    }

    _renderData(data);
  }

  function _renderData(data) {
    const grid = document.getElementById('channel-grid');
    const loader = document.getElementById('tab-loader');
    if (loader) loader.classList.add('hidden');
    if (grid) grid.classList.remove('hidden');

    const currentCountry = Store.get('currentCountry');
    const groups = Playlist.getGroups(data, currentCountry, _currentTab);
    Store.set('groups', groups);
    Store.set('currentGroup', groups.length > 0 ? groups[0].id : null);
    
    // Aquí reaprovechamos renderGroups y renderChannels, 
    // pero primero guardamos los datos temporalmente
    Store.set('currentData', data);
    renderGroups();
    _sidebarFocusIdx = 2; // primer grupo
    
    Store.set('groupIdx', 0);
    renderChannels();
    _setFocusZone('groups');
  }

  function playChannelRelative(dir) {
    const cur  = Player.getCurrent();
    if (!cur) return;
    const curIdx = VirtualList.getFocused();
    const nextIdx = dir === 'next' ? curIdx + 1 : curIdx - 1;
    const next = VirtualList.getItem(nextIdx);
    if (next) { VirtualList.setFocused(nextIdx); _playChannel(next); }
  }

  function syncWithChannel(ch) {
    if (!ch) return;
    _updateCountriesList();
    renderCountries(); // Asegurarnos de que estén renderizados
    const channels = _currentTab === 'tv' ? (Store.get('channels') || []) : (Store.get('currentData') || []);
    const favIds = new Set(Favorites.getIds());

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

    const currentCountry = Store.get('currentCountry');
    const groups = Playlist.getGroups(channels, currentCountry, _currentTab);
    Store.set('groups', groups);

    let targetGroupId = Store.get('currentGroup');
    let filtered = targetGroupId ? Playlist.filterByGroup(channels, targetGroupId, favIds, currentCountry) : [];
    
    // Si el canal no está en el grupo actual (por ejemplo, si estábamos en una categoría y saltamos a otra), cambiamos el grupo
    if (!targetGroupId || filtered.findIndex(c => c.id === ch.id) === -1) {
      let groupObj = groups.find(g => g.id === ch.group);
      if (!groupObj) groupObj = groups.find(g => g.id === '__all__');
      targetGroupId = groupObj ? groupObj.id : '__all__';
      filtered = Playlist.filterByGroup(channels, targetGroupId, favIds, currentCountry);
    }
    
    let gIdx = groups.findIndex(g => g.id === targetGroupId);
    Store.set('currentGroup', targetGroupId);
    Store.set('groupIdx', gIdx >= 0 ? gIdx : 0);
    _sidebarFocusIdx = (gIdx >= 0 ? gIdx : 0) + 2;

    renderGroups();
    let chIdx = filtered.findIndex(c => c.id === ch.id);
    
    if (chIdx < 0) {
      Store.set('currentGroup', '__all__');
      Store.set('groupIdx', 0);
      _sidebarFocusIdx = 2;
      renderGroups();
      filtered = Playlist.filterByGroup(channels, '__all__', favIds, currentCountry);
      chIdx = filtered.findIndex(c => c.id === ch.id);
    }

    renderChannels();

    if (chIdx >= 0 && typeof VirtualList !== 'undefined') {
      VirtualList.setFocused(chIdx);
    }
    _setFocusZone('channels');
  }

  function getCurrentTab() { return _currentTab; }

  return { onShow, renderGroups, renderChannels, refreshUI, playChannelRelative, syncWithChannel, getCurrentTab };
})();
