/**
 * view-channels.js — Controlador de la vista principal de Canales
 */
import { Store } from './store.js';
import { Storage } from './storage.js';
import { KeyHandler } from './keyHandler.js';
import { Router } from './router.js';
import { Favorites } from './favorites.js';
import { SetupProgress } from './setup-progress.js';
import { Search } from './search.js';
import { Playlist } from './playlist.js';
import { VirtualList } from './virtual-list.js';
import { Player } from './player.js';
import { InfoPopup } from './info-popup.js';
import { Watching } from './watching.js';
import { getCountryInfo, sortCountryCodes } from './countries.js';
import { loadTabData } from './services/tab-data-loader.js';
import { createFocusController } from './services/focus-controller.js';
import { renderCountryItems, renderGroupList, setChannelHeader } from './services/view-renderer.js';
import { createViewState } from './services/view-state.js';


export const ViewChannels = (() => {
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
  let _sidebarFocusablesCache = null;
  let _countryFocusIdx = 0;
  let _currentTab = 'tv';
  let _tabFocusIdx = 0;
  const TABS = ['tv', 'vod', 'series'];
  let _tabAbortController = null;
  let _groupPreviewTimer = null;      // local: era window._groupPreviewTimer (contaminaba global)
  let _prevCountryCodes  = null;      // cache para reconciliación DOM de países
  let _prevFocusedEl     = null;      // trackear elemento enfocado previo (evita querySelectorAll masivo)
  let _currentLayoutMode = null;      // 'tv' | 'poster' — para saber si necesita VirtualList.init() o .update()
  let _groupCountsCache  = null;
  let _suppressNextTabClick = false;
  const _focus = createFocusController({
    tabs: TABS,
    getSidebarFocusables: () => _getSidebarFocusables(),
    updateCountryClasses: () => _updateCountryClasses(),
    focusCurrentChannel: () => {
      if (typeof VirtualList !== 'undefined') {
        VirtualList.setFocused(VirtualList.getFocused());
      }
    },
    setChannelFocus: (el, skipScroll = false) => KeyHandler.setFocus(el, skipScroll),
    isVodOrSeries: () => _currentTab === 'vod' || _currentTab === 'series',
    getCountries: () => Store.get('countries') || ['ALL'],
    getCountryFocus: () => _countryFocusIdx,
    setCountryFocus: (idx) => { _countryFocusIdx = idx; },
    previewGroup: (next) => {
      if (next.id !== 'btn-open-search' && next.id !== 'btn-open-setup') {
        const groupId = next.dataset.groupId;
        const groups = Store.get('groups');
        const group = groups.find(g => g.id === groupId);
        if (group) {
          clearTimeout(_groupPreviewTimer);
          _groupPreviewTimer = setTimeout(() => {
            if (_focusZone === 'groups') {
              _selectGroup(group, false);
            }
          }, 150);
        }
      }
    },
    currentChannelColStart: () => {
      const curIdx = VirtualList.getFocused();
      const cols = _currentTab === 'tv' ? 3 : 5;
      return curIdx % cols === 0;
    },
    moveVirtualList: (dir) => VirtualList.move(dir),
    previewCurrentChannel: () => {
      const focused = VirtualList.getCurrentItem();
      if (focused && typeof Player !== 'undefined') Player.schedulePreview(focused);
    }
  });

  const _viewState = createViewState({
    getCurrentData: () => _getCurrentData(),
    sortCountryCodes,
    setAllCountries: list => Store.set('allCountries', list),
    getVisibleCountries: () => Storage.getVisibleCountries(),
    setCountries: list => Store.set('countries', list),
    getCurrentCountry: () => Store.get('currentCountry'),
    setCurrentCountry: value => Store.set('currentCountry', value),
    setCountryFocusIdx: value => { _countryFocusIdx = value; },
    getCountryFocusIdx: () => _countryFocusIdx,
    onCountryInvalidated: () => {
      const channels = _getCurrentData();
      Playlist.clearGroupCache();
      Store.set('groups', Playlist.getGroups(channels, 'ALL', _currentTab));
      Store.set('currentGroup', '__all__');
      Store.set('groupIdx', 0);
      _sidebarFocusIdx = 2;
    },
    restoreGroupFocus: () => {
      const gIdx = Store.get('groupIdx') || 0;
      const groups = Store.get('groups');
      const curG = groups[gIdx];
      _updateCountryClasses();
      const focusables = _getSidebarFocusables();
      let newIdx = 2;
      if (curG) {
        const found = focusables.findIndex(el => el.dataset && el.dataset.groupId === curG.id);
        if (found !== -1) newIdx = found;
      }
      _sidebarFocusIdx = newIdx;
      _setFocusZone('groups');
    },
    clearGroupCache: () => Playlist.clearGroupCache(),
    setGroups: list => Store.set('groups', list),
    getGroupsForCountry: code => Playlist.getGroups(_getCurrentData(), code, _currentTab),
    setCurrentGroup: value => Store.set('currentGroup', value),
    setGroupIdx: value => Store.set('groupIdx', value),
    setSidebarFocusIdx: value => { _sidebarFocusIdx = value; },
    refreshGroups: () => renderGroups(),
    refreshChannels: () => renderChannels(),
    focusGroups: () => _setFocusZone('groups'),
    toggleExpandedFolder: id => {
      const expanded = Store.get('expandedFolders') || {};
      expanded[id] = !expanded[id];
      Store.set('expandedFolders', expanded);
    },
    focusGroupById: id => {
      const focusables = _getSidebarFocusables();
      const newIdx = focusables.findIndex(el => el.dataset && el.dataset.groupId === id);
      if (newIdx !== -1) _sidebarFocusIdx = newIdx;
    },
    getCurrentGroup: () => Store.get('currentGroup'),
    filterGroup: id => Playlist.filterByGroup(_getCurrentData(), id, new Set(Favorites.getIds()), Store.get('currentCountry') || 'ALL'),
    updateGroupClasses: () => _updateGroupClasses(),
    clearVirtualList: () => VirtualList.update([]),
    focusChannelsIfItems: hasItems => { if (hasItems) _setFocusZone('channels'); else _setFocusZone('groups'); },
    getGroupsForData: data => Playlist.getGroups(data, Store.get('currentCountry'), _currentTab),
    getInitialGroup: data => (Playlist.getGroups(data, Store.get('currentCountry'), _currentTab)[0]?.id || null),
    setCurrentData: data => Store.set('currentData', data),
    hideLoader: () => {
      const grid = document.getElementById('channel-grid');
      const loader = document.getElementById('tab-loader');
      if (loader) loader.classList.add('hidden');
      if (grid) grid.classList.remove('hidden');
    },
    restoreFocusAfterRender: () => {
      if (!_focusZone) _setFocusZone('groups');
      else _setFocusZone(_focusZone);
    },
    isSearchOpen: () => typeof Search !== 'undefined' && Search.isOpen(),
    renderCountries: () => renderCountries(),
    getFavIds: () => Favorites.getIds(),
    getCurrentTab: () => _currentTab,
    getCountries: () => Store.get('countries') || ['ALL'],
    setSidebarFocusIdxFromGroup: idx => { _sidebarFocusIdx = idx; },
    updateCountryClasses: () => _updateCountryClasses(),
    focusChannelIndex: idx => { if (typeof VirtualList !== 'undefined') VirtualList.setFocused(idx); }
  });

  function _syncFocusStateFromController() {
    _sidebarFocusIdx = _focus.getSidebarFocusIdx();
    _tabFocusIdx = _focus.getTabFocusIdx();
    _exitFocusIdx = _focus.getExitFocusIdx();
  }

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

  function _getCurrentData() {
    return (_currentTab === 'tv' ? Store.peek('channels') : Store.peek('currentData')) || [];
  }

  function _getGroupIcon(g) {
    if (g?.icon) return g.icon;
    const match = String(g?.name || '').match(/<span[^>]*material-symbols-rounded[^>]*>([^<]+)<\/span>/);
    return match ? match[1].trim() : null;
  }

  function _getGroupLabel(g) {
    return String(g?.name || '').replace(/<span[^>]*>.*?<\/span>\s*/g, '');
  }

  function _setGroupContent(li, g, count = null, folderExpanded = null) {
    li.replaceChildren();

    const label = document.createElement('span');
    const icon = _getGroupIcon(g);
    if (icon) {
      const iconEl = document.createElement('span');
      iconEl.className = 'material-symbols-rounded';
      iconEl.textContent = icon;
      label.appendChild(iconEl);
      label.appendChild(document.createTextNode(' '));
    }
    label.appendChild(document.createTextNode(_getGroupLabel(g)));
    li.appendChild(label);

    if (folderExpanded !== null) {
      const folderIcon = document.createElement('span');
      folderIcon.className = 'material-symbols-rounded folder-icon';
      folderIcon.textContent = folderExpanded ? 'expand_less' : 'expand_more';
      li.appendChild(folderIcon);
    } else if (count !== null) {
      const countEl = document.createElement('span');
      countEl.className = 'group-count';
      countEl.textContent = count;
      li.appendChild(countEl);
    }
  }




  function _updateCountriesList() {
    return _viewState.updateCountriesList();
    const channels = _getCurrentData();
    const codesSet = new Set();
    for (const c of channels) {
      if (c.countryCode) codesSet.add(c.countryCode);
    }
    const codes = sortCountryCodes(codesSet);
    
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
    if (_currentTab === 'vod' || _currentTab === 'series') {
      container.style.display = 'none';
      _prevCountryCodes = null;
      return;
    }
    container.style.display = '';
    const codes = Store.get('countries') || ['ALL'];
    const _currentCountry = Store.get('currentCountry') || 'ALL';
    renderCountryItems({
      container,
      codes: codes.map(code => code === 'ALL' ? { emoji: '🌎', name: 'Todos' } : getCountryInfo(code)),
      currentCountry: _currentCountry,
      focusedIdx: _countryFocusIdx,
      onSelect: _selectCountry
    });
    _prevCountryCodes = codes.join(',');
    _updateCountryClasses();
    return;

    // ── Reconciliación DOM: solo re-renderizar si la lista cambió ──
    const codesKey = codes.join(',');
    if (_prevCountryCodes === codesKey && container.children.length === codes.length) {
      // Lista igual — solo actualizar clases de foco/activo
      _updateCountryClasses();
      return;
    }
    _prevCountryCodes = codesKey;

    container.innerHTML = '';
    const currentCountry = Store.get('currentCountry') || 'ALL';
    
    codes.forEach((code, i) => {
      const info = getCountryInfo(code);
      const el = document.createElement('div');
      el.className = 'country-item' + (i === _countryFocusIdx && _focusZone === 'countries' ? ' focused' : '') + (code === currentCountry ? ' active' : '');
      el.textContent = `${info.emoji} ${info.name}`;
      el.addEventListener('click', () => _selectCountry(code, i));
      container.appendChild(el);
    });
  }

  function _selectCountry(code, idx) {
    return _viewState.selectCountry(code, idx);
    const prevCountry = Store.get('currentCountry');
    _countryFocusIdx = idx;
    
    if (prevCountry === code) {
      const gIdx = Store.get('groupIdx') || 0;
      const groups = Store.get('groups');
      const curG = groups[gIdx];
      _updateCountryClasses();
      
      const focusables = _getSidebarFocusables();
      let newIdx = 2; // Default to first group
      if (curG) {
        const found = focusables.findIndex(el => el.dataset && el.dataset.groupId === curG.id);
        if (found !== -1) newIdx = found;
      }
      _sidebarFocusIdx = newIdx;
      
      _setFocusZone('groups');
      return;
    }

    Store.set('currentCountry', code);
    
    Playlist.clearGroupCache();
    
    const channels = _getCurrentData();
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
      _prevFocusedEl = focusedEl;
      focusedEl.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
    }
  }

  function renderGroups() {
    _sidebarFocusablesCache = null;
    const list = document.getElementById('group-list');
    if (!list) return;
    
    const currentCountry = Store.get('currentCountry') || 'ALL';
    const channels = _getCurrentData();
    
    const groups = Playlist.getGroups(channels, currentCountry, _currentTab);
    Store.set('groups', groups);
    const counts = _getGroupCounts(channels, currentCountry);
    renderGroupList({
      list,
      groups,
      counts,
      currentGroup: Store.get('currentGroup'),
      groupIdx: Store.get('groupIdx') || 0,
      focusZone: _focusZone,
      expandedFolders: Store.get('expandedFolders') || {},
      onFolderClick: (g, i) => { Store.set('groupIdx', i); _selectGroup(g, true); },
      onGroupClick: (g, li) => { Store.set('groupIdx', parseInt(li.dataset.idx)); _selectGroup(g, true); }
    });
    return;
    
    const currentGroup = Store.get('currentGroup');
    const groupIdx = Store.get('groupIdx') || 0;
    const expandedFolders = Store.get('expandedFolders') || {};

    // ── Reconciliación DOM: reutilizar nodos existentes cuando sea posible ──
    const existingItems = Array.from(list.children);
    const existingMap = new Map(); // groupId → li element
    for (const li of existingItems) {
      if (li.dataset.groupId) existingMap.set(li.dataset.groupId, li);
    }

    const newIds = new Set();
    const fragment = document.createDocumentFragment();

    groups.forEach((g, i) => {
      newIds.add(g.id);
      let li = existingMap.get(g.id);

      if (g.isFolder) {
        if (!li) {
          li = document.createElement('li');
          li.dataset.groupId = g.id;
          li.addEventListener('click', () => { Store.set('groupIdx', i); _selectGroup(g, true); });
        }
        li.className = 'group-item folder-item' + (i === groupIdx && _focusZone === 'groups' ? ' focused' : '');
        li.dataset.idx = i;
        _setGroupContent(li, g, null, Boolean(expandedFolders[g.id]));
        fragment.appendChild(li);
        return;
      }

      const isChild = g.parentId ? true : false;
      const isHidden = isChild && !expandedFolders[g.parentId];

      if (!li) {
        li = document.createElement('li');
        li.dataset.groupId = g.id;
        li.addEventListener('click', () => { Store.set('groupIdx', parseInt(li.dataset.idx)); _selectGroup(g, true); });
      }
      li.className = 'group-item' +
                     (isChild ? ' group-child' : '') +
                     (isHidden ? ' hidden' : '') +
                     (i === groupIdx && _focusZone === 'groups' ? ' focused' : '') +
                     (g.id === currentGroup ? ' active' : '');
      li.dataset.idx = i;

      const cnt = counts[g.id] || 0;
      _setGroupContent(li, g, cnt);

      fragment.appendChild(li);
    });

    // Remove stale nodes
    for (const [id, li] of existingMap) {
      if (!newIds.has(id)) li.remove();
    }
    list.appendChild(fragment);
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

  function _getGroupCounts(channels, currentCountry) {
    const favIds = Favorites.getIds();
    const watchingIds = Watching.getIds();
    const cacheKey = `${currentCountry}|${_currentTab}|${favIds.join(',')}|${watchingIds.join(',')}`;
    if (_groupCountsCache && _groupCountsCache.channelsRef === channels && _groupCountsCache.key === cacheKey) return _groupCountsCache.counts;

    const favSet = new Set(favIds);
    const watchingSet = new Set(watchingIds);
    const counts = { '__all__': 0, '__favs__': 0, '__watching__': 0 };
    for (const ch of channels) {
      if (!Playlist.isItemVisibleInCountry(ch, currentCountry)) continue;
      counts.__all__++;
      counts[ch.group] = (counts[ch.group] || 0) + 1;
      if (favSet.has(ch.id)) counts.__favs__++;
      if (watchingSet.has(ch.id)) counts.__watching__++;
    }

    _groupCountsCache = { channelsRef: channels, key: cacheKey, counts };
    Store.set('groupCountsCache', counts);
    return counts;
  }

  function _updateGroupCounts() {
    const channels = _getCurrentData();
    const groups = Store.get('groups');
    const currentCountry = Store.get('currentCountry') || 'ALL';
    const cache = _getGroupCounts(channels, currentCountry);

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

  function _selectGroup(g, autoFocusChannels = true) {
    return _viewState.selectGroup(g, autoFocusChannels);
    if (g.isFolder) {
      if (autoFocusChannels) {
        const expanded = Store.get('expandedFolders') || {};
        expanded[g.id] = !expanded[g.id];
        Store.set('expandedFolders', expanded);
        renderGroups();
      }
      
      const folderId = g.id;
      const focusables = _getSidebarFocusables();
      const newIdx = focusables.findIndex(el => el.dataset && el.dataset.groupId === folderId);
      if (newIdx !== -1) _sidebarFocusIdx = newIdx;
      
      _setFocusZone('groups');
      return;
    }

    const prevGroup = Store.get('currentGroup');
    const groups = Store.get('groups');
    const gIdx = groups.findIndex(item => item.id === g.id);

    const channels = _getCurrentData();
    const favIds = new Set(Favorites.getIds());
    const currentCountry = Store.get('currentCountry') || 'ALL';
    const items = Playlist.filterByGroup(channels, g.id, favIds, currentCountry);

    if (prevGroup === g.id) {
      const focusables = _getSidebarFocusables();
      const newIdx = focusables.findIndex(el => el.dataset && el.dataset.groupId === g.id);
      if (newIdx !== -1) _sidebarFocusIdx = newIdx;
      
      _updateGroupClasses();
      if (autoFocusChannels && items.length > 0) {
        _setFocusZone('channels');
      }
      return;
    }

    Store.set('currentGroup', g.id);
    Store.set('groupIdx', gIdx);
    
    const focusables = _getSidebarFocusables();
    const newIdx = focusables.findIndex(el => el.dataset && el.dataset.groupId === g.id);
    if (newIdx !== -1) _sidebarFocusIdx = newIdx;
    
    _updateGroupClasses();
    
    // Clear virtual list quickly to avoid lag
    VirtualList.update([]);
    renderChannels();
    
    if (autoFocusChannels) {
      if (items.length > 0) {
        _setFocusZone('channels');
      } else {
        _setFocusZone('groups');
      }
    }
  }

  function renderChannels(list) {
    const channels = _getCurrentData();
    const currentGroup = Store.get('currentGroup');
    const currentCountry = Store.get('currentCountry') || 'ALL';
    const favIds = new Set(Favorites.getIds());
    let items;
    if (list) {
      items = list;
    } else {
      items = Playlist.filterByGroup(channels, currentGroup, favIds, currentCountry);
    }

    setChannelHeader({ currentGroup, currentTab: _currentTab, count: items.length });

    const newLayout = _currentTab === 'tv' ? 'tv' : 'poster';
    if (_currentLayoutMode !== newLayout) {
      // Layout change requires full re-init
      _currentLayoutMode = newLayout;
      VirtualList.init({
        containerId:  'channel-grid',
        items,
        layout:       newLayout,
        onSelect:     ch => _playChannel(ch),
        getFavBadge:  id => Favorites.isFav(id)
      });
    } else {
      // Same layout: just swap items (much faster, preserves DOM pool)
      VirtualList.update(items);
    }

    _updateGroupCounts();
  }

  function _playChannel(ch) {
    if (!ch) return;
    Storage.setLastChannel(ch.id);

    // Si estamos en "Seguir viendo" y tiene un episodio guardado
    if (Store.get('currentGroup') === '__watching__' && ch.type === 'series') {
      const items = Watching.getItems();
      const wItem = items.find(i => (typeof i === 'object' && i.id === ch.id));
      if (wItem && wItem.ep) {
        const ep = wItem.ep;
        const list = Store.get('currentList');
        const ext = ep.container_extension || 'mp4';
        const url = `${list.server}/series/${encodeURIComponent(list.user)}/${encodeURIComponent(list.pass)}/${ep.id}.${ext}`;
        const playCh = {
          id: `ep_${ep.id}`,
          seriesId: ch.id, // para Watching.updateProgress()
          name: `${ch.name} - ${ep.episode_num}. ${ep.title}`,
          url,
          logo: ch.logo,
          type: 'series'
        };
        if (typeof InfoPopup !== 'undefined') {
          InfoPopup.show(ch);
          InfoPopup.setPlayingEpisode(ep);
          InfoPopup.suspend();
        }
        Router.showView('player');
        document.getElementById('view-player').focus();
        Player.play(playCh);
        return;
      }
    }

    if (ch.type === 'vod' || ch.type === 'series') {
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
    _focus.setSidebarFocusIdx(_sidebarFocusIdx);
    _focus.setTabFocusIdx(_tabFocusIdx);
    _focus.move(dir);
    _syncFocusStateFromController();
  }

  function _setFocusZone(zone, restoreActive = true) {
    _focus.setSidebarFocusIdx(_sidebarFocusIdx);
    _focus.setTabFocusIdx(_tabFocusIdx);
    _focus.setZone(zone, restoreActive);
    _syncFocusStateFromController();
  }

  function _showExitPopup() {
    _focus.showExit();
  }

  function _hideExitPopup() {
    _focus.hideExit();
  }

  function _moveExit(dir) {
    _focus.moveExit(dir);
  }

  function _updateExitFocus() {
    _focus.updateExit();
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
        _suppressNextTabClick = true;
        if (_currentTab === 'tv') {
          _setFocusZone('countries');
        } else {
          _sidebarFocusIdx = 2;
          _setFocusZone('groups');
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
          const groupId = el.dataset.groupId;
          const groups = Store.get('groups');
          const group = groups.find(g => g.id === groupId);
          if (group) _selectGroup(group, true);
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
        const isTv = _currentTab === 'tv';
        if (_focusZone === 'channels') return _setFocusZone('groups') || true;
        if (_focusZone === 'groups') return _setFocusZone(isTv ? 'countries' : 'tabs') || true;
        if (_focusZone === 'countries') return _setFocusZone('tabs') || true;
        if (_focusZone === 'tabs') return _setFocusZone(isTv ? 'countries' : 'groups') || true;
        _showExitPopup();
        return true;
      }
    });

    
    document.querySelectorAll('.sidebar-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (_suppressNextTabClick) {
          _suppressNextTabClick = false;
          return;
        }
        _tabFocusIdx = TABS.indexOf(btn.dataset.type);
        if (btn.dataset.type === _currentTab) {
          if (_currentTab === 'tv') {
            _setFocusZone('countries');
          } else {
            _sidebarFocusIdx = 2;
            _setFocusZone('groups');
          }
        } else {
          _setFocusZone('tabs');
          _switchTab(btn.dataset.type);
        }
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
    if (grid) {
      grid.classList.add('hidden');
      if (typeof VirtualList !== 'undefined') VirtualList.update([]);
    }
    if (loader) {
      loader.classList.remove('hidden');
      if (tabId === 'vod') {
        document.getElementById('tab-loader-msg').textContent = 'Cargando películas...';
      } else if (tabId === 'series') {
        document.getElementById('tab-loader-msg').textContent = 'Cargando series...';
      } else {
        document.getElementById('tab-loader-msg').textContent = 'Cargando canales...';
      }
    }
    
    // Forzar renderizado del DOM antes de bloquear con IndexedDB/Parsing
    await new Promise(r => setTimeout(r, 10));
    if (_currentTab !== tabId) return; // Guard contra cambio rápido de pestaña

    let data = [];
    try {
      if (tabId === 'vod') {
        const steps = [{ id: 'vod', label: 'Descargando Películas...' }];
        SetupProgress.show('Películas', list.name, steps);
        data = await loadTabData(tabId, list, signal, p => SetupProgress.progress(p));
        SetupProgress.hide();
      } else if (tabId === 'series') {
        data = await loadTabData(tabId, list, signal);
      } else {
        data = await loadTabData(tabId, list, signal);
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      Router.showToast(tabId === 'vod' ? 'Error cargando películas' : (tabId === 'series' ? 'Error cargando series' : 'Error cargando canales'), 'error');
      data = [];
      SetupProgress.hide();
    }

    // Guardar en store y recargar
    Store.set('currentGroup', null);

    _renderData(data);
  }

  function _renderData(data) {
    return _viewState.renderData(data);
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
    
    // Si la zona actual era groups o tabs, la mantenemos.
    // Solo forzamos groups si estaba vacía (p.ej. al inicio).
    if (!_focusZone) {
      _setFocusZone('groups');
    } else {
      // Re-aplicar clases de focus actuales por si el DOM fue reconstruido
      _setFocusZone(_focusZone);
    }
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
    return _viewState.syncWithChannel(ch);
    if (!ch) return;
    if (typeof Search !== 'undefined' && Search.isOpen()) return; // Maintain search state, do not sync groups
    _updateCountriesList();
    renderCountries(); // Asegurarnos de que estén renderizados
    const channels = _getCurrentData();
    const favIds = new Set(Favorites.getIds());

    const country = (_currentTab === 'vod' || _currentTab === 'series') ? 'ALL' : (ch.countryCode || 'ALL');
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

  function setSidebarFocusToSearch() {
    _sidebarFocusIdx = 0;
    _setFocusZone('groups', false);
  }

  function focusSearchResults() {
    if (typeof VirtualList !== 'undefined' && VirtualList.getItems().length > 0) {
      VirtualList.setFocused(0);
      _setFocusZone('channels');
      KeyHandler.setFocus(document.querySelector('.channel-card[data-idx="0"]'), true);
    }
  }

  Search.configure({ getCurrentTab, renderChannels, focusSearchResults, setSidebarFocusToSearch });

  return { onShow, renderGroups, renderChannels, refreshUI, playChannelRelative, syncWithChannel, getCurrentTab, setSidebarFocusToSearch, focusSearchResults };
})();
