/**
 * view-channels.js — Controlador de la vista principal de Canales
 */
import { Store } from './store.js';
import { Storage } from './storage.js';
import { KeyHandler } from './keyHandler.js';
import { Router } from './router.js';
import { Favorites } from './favorites.js';
import { Search } from './search.js';
import { Playlist } from './playlist.js';
import { VirtualList } from './virtual-list.js';
import { Player } from './player.js';
import { InfoPopup } from './info-popup.js';
import { Watching } from './watching.js';
import { getCountryInfo, sortCountryCodes } from './countries.js';
import { getGroupCounts, invalidateGroupCounts } from './services/group-counts.js';
import { createFocusController } from './services/focus-controller.js';
import { createTabViewController } from './services/tab-view-controller.js';
import { createChannelsInputController } from './services/channels-input-controller.js';
import { renderCountryItems, renderGroupList, setChannelHeader } from './services/view-renderer.js';
import { createViewState } from './services/view-state.js';


export const ViewChannels = (() => {
  let _sidebarFocusIdx = 2; // 0=search, 1=setup, 2+=groups
  let _focusZone = 'channels'; // 'groups' | 'channels' | 'exit' | 'countries'
  let _exitFocusIdx = 0; // 0 = Cancel, 1 = Exit
  let _sidebarFocusablesCache = null;
  let _countryFocusIdx = 0;
  let _lastTvCountry = 'ALL';
  let _currentTab = 'tv';
  let _tabFocusIdx = 0;
  const TABS = ['tv', 'vod', 'series'];
  let _groupPreviewTimer = null;      // local: era window._groupPreviewTimer (contaminaba global)
  let _currentLayoutMode = null;      // 'tv' | 'poster' — para saber si necesita VirtualList.init() o .update()
  let _pendingFocusAfterRender = null;
  let _lastGroupsRenderInput = null;
  let _lastChannelsRenderInput = null;
  const _tabs = createTabViewController({
    virtualList: VirtualList,
    showToast: (...args) => Router.showToast(...args),
    getCurrentTab: () => _currentTab
  });
  const _focus = createFocusController({
    tabs: TABS,
    getSidebarFocusables: () => _getSidebarFocusables(),
    updateCountryClasses: () => _updateCountryClasses(),
    focusCurrentChannel: () => {
      if (typeof VirtualList !== 'undefined') {
        VirtualList.setFocused(VirtualList.getFocused());
      }
    },
    getTabButtons: () => Array.from(document.querySelectorAll('.sidebar-tab-btn')),
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
    getFocusedChannelEl: () => VirtualList.getFocusedElement?.() || null,
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
    getCurrentCountry: () => _getCurrentCountry(),
    setCurrentCountry: value => Store.set('currentCountry', value),
    setCountryFocusIdx: value => { _countryFocusIdx = value; },
    getCountryFocusIdx: () => _countryFocusIdx,
    getCurrentListId: () => _getCurrentListId(),
    onCountryInvalidated: () => {
      const channels = _getCurrentData();
      Playlist.clearGroupCache();
      invalidateGroupCounts();
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
    getGroupIdx: () => Store.get('groupIdx') || 0,
    findGroupIndex: id => {
      const groups = Store.get('groups') || [];
      return groups.findIndex(g => g.id === id);
    },
    setSidebarFocusIdx: value => { _sidebarFocusIdx = value; },
    refreshGroups: () => renderGroups(),
    refreshChannels: () => renderChannels(),
    focusGroups: () => _setFocusZone('groups'),
    focusChannels: () => _setFocusZone('channels'),
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
    getCurrentGroup: () => _getCurrentGroup(),
    filterGroup: id => Playlist.filterByGroup(_getCurrentData(), id, Favorites.getSet(), _getCurrentCountry()),
    updateGroupClasses: () => _updateGroupClasses(),
    clearVirtualList: () => VirtualList.update([]),
    focusChannelsIfItems: hasItems => { if (hasItems) _setFocusZone('channels'); else _setFocusZone('groups'); },
    getGroupsForData: data => Playlist.getGroups(data, _getCurrentCountry(), _currentTab),
    getInitialGroup: data => (Playlist.getGroups(data, _getCurrentCountry(), _currentTab)[0]?.id || null),
    setCurrentData: data => Store.set('currentData', data),
    refreshAll: () => {
      renderGroups();
      renderChannels();
    },
    hideLoader: () => {
      const grid = document.getElementById('channel-grid');
      const loader = document.getElementById('tab-loader');
      if (loader) loader.classList.add('hidden');
      if (grid) grid.classList.remove('hidden');
    },
    restoreFocusAfterRender: () => {
      const pending = _pendingFocusAfterRender;
      _pendingFocusAfterRender = null;
      if (pending) {
        _setFocusZone(pending);
        return;
      }
      const landingZone = _currentTab === 'tv' ? 'groups' : 'groups';
      if (_focusZone === 'channels' || _focusZone === 'tabs' || !_focusZone) {
        _setFocusZone(landingZone);
      } else {
        _setFocusZone(_focusZone);
      }
    },
    isSearchOpen: () => typeof Search !== 'undefined' && Search.isOpen(),
    renderCountries: () => renderCountries(),
    getFavIds: () => Favorites.getIds(),
    getFavSet: () => Favorites.getSet(),
    getCurrentTab: () => _currentTab,
    isTvTab: () => _currentTab === 'tv',
    getCountries: () => Store.get('countries') || ['ALL'],
    setSidebarFocusIdxFromGroup: idx => { _sidebarFocusIdx = idx; },
    updateCountryClasses: () => _updateCountryClasses(),
    focusChannelIndex: idx => { if (typeof VirtualList !== 'undefined') VirtualList.setFocused(idx); }
  });
  const _input = createChannelsInputController({
    getTabs: () => TABS,
    getCurrentTab: () => _currentTab,
    getFocusZone: () => _focusZone,
    getVisibleFocusZone: () => _getVisibleFocusZone(),
    getSidebarFocusIdx: () => _sidebarFocusIdx,
    setSidebarFocusIdx: value => { _sidebarFocusIdx = value; },
    getTabFocusIdx: () => _tabFocusIdx,
    setTabFocusIdx: value => { _tabFocusIdx = value; },
    getExitFocusIdx: () => _exitFocusIdx,
    getCountryFocusIdx: () => _countryFocusIdx,
    setCountryFocusIdx: value => { _countryFocusIdx = value; },
    getCurrentCountry: () => _getCurrentCountry(),
    getCurrentGroup: () => _getCurrentGroup(),
    getSidebarFocusables: () => _getSidebarFocusables(),
    setPendingFocusAfterRender: value => { _pendingFocusAfterRender = value; },
    moveActive: dir => _moveActive(dir),
    moveExit: dir => _moveExit(dir),
    setFocusZone: (zone, restoreActive) => _setFocusZone(zone, restoreActive),
    showExitPopup: () => _showExitPopup(),
    hideExitPopup: () => _hideExitPopup(),
    selectCountry: (code, idx) => _selectCountry(code, idx),
    selectGroup: (group, autoFocusChannels) => _selectGroup(group, autoFocusChannels),
    playChannel: ch => _playChannel(ch),
    switchTab: tabId => _switchTab(tabId),
    updateGroupCounts: () => _updateGroupCounts(),
    renderChannels: () => renderChannels(),
    renderCountries: () => renderCountries()
  });

  function _syncFocusStateFromController() {
    _focusZone = _focus.getZone();
    _sidebarFocusIdx = _focus.getSidebarFocusIdx();
    _tabFocusIdx = _focus.getTabFocusIdx();
    _exitFocusIdx = _focus.getExitFocusIdx();
  }

  function _getVisibleFocusZone() {
    const domZone = document.getElementById('view-channels')?.dataset.focus;
    if (domZone) return domZone;
    if (document.querySelector('#group-list .group-item.focused')) return 'groups';
    if (document.querySelector('.channel-card.focused')) return 'channels';
    if (document.querySelector('.country-item.focused')) return 'countries';
    if (document.querySelector('.sidebar-tab-btn.focused')) return 'tabs';
    return _focusZone;
  }

  function onShow(fromView) {
    if (fromView !== 'player') {
      _currentTab = 'tv';
    }
    _tabs.activate(_currentTab);
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

  function _getCurrentListId() {
    return Store.peek('currentList')?.id || null;
  }

  function _getCurrentCountry() {
    return Store.peek('currentCountry') || 'ALL';
  }

  function _getCurrentGroup() {
    return Store.peek('currentGroup');
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
  }

  function renderCountries() {
    const container = document.getElementById('country-filter');
    if (!container) return;
    if (_currentTab === 'vod' || _currentTab === 'series') {
      container.style.display = 'none';
      return;
    }
    container.style.display = '';
    const codes = Store.get('countries') || ['ALL'];
    const _currentCountry = _getCurrentCountry();
    renderCountryItems({
      container,
      codes: codes.map(code => code === 'ALL' ? { code: 'ALL', emoji: '🌎', name: 'Todos' } : { code, ...getCountryInfo(code) }),
      currentCountry: _currentCountry,
      focusedIdx: _countryFocusIdx,
      onSelect: _selectCountry
    });
    _updateCountryClasses();
  }

  function _selectCountry(code, idx) {
    if (_currentTab === 'tv') {
      _lastTvCountry = code || 'ALL';
    }
    return _viewState.selectCountry(code, idx);
  }

  function _updateCountryClasses() {
    const codes = Store.get('countries') || ['ALL'];
    const currentCountry = _getCurrentCountry();
    const focusZone = _focus?.getZone?.() || _focusZone;
    const els = document.querySelectorAll('.country-item');
    let focusedEl = null;

    els.forEach((el, i) => {
      const isFocused = i === _countryFocusIdx && focusZone === 'countries';
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

    const ctx = _viewState.getFilterContext();
    const watchingIds = Watching.getSet(ctx.currentListId);
    const expanded = Store.get('expandedFolders') || {};
    const expandedKey = Object.keys(expanded).filter(id => expanded[id]).sort().join(',');
    const groupIdx = Store.get('groupIdx') || 0;
    const favVersion = Favorites.getVersion();
    const watchingVersion = Watching.getVersion();
    const groupsInput = [
      ctx.channels,
      ctx.currentCountry,
      ctx.currentTab,
      ctx.currentListId,
      ctx.currentGroup || null,
      groupIdx,
      _focusZone,
      favVersion,
      watchingVersion,
      expandedKey
    ];
    if (_lastGroupsRenderInput &&
        _lastGroupsRenderInput.length === groupsInput.length &&
        groupsInput.every((value, idx) => value === _lastGroupsRenderInput[idx])) {
      return;
    }
    _lastGroupsRenderInput = groupsInput;

    const groups = Playlist.getGroups(ctx.channels, ctx.currentCountry, ctx.currentTab);
    Store.set('groups', groups);
    const counts = getGroupCounts(
      ctx.channels,
      ctx.currentCountry,
      ctx.currentTab,
      ctx.currentListId,
      ctx.favSet || ctx.favIds,
      watchingIds
    );
    renderGroupList({
      list,
      groups,
      counts,
      currentGroup: _getCurrentGroup(),
      groupIdx,
      focusZone: _focusZone,
      expandedFolders: Store.get('expandedFolders') || {},
      onFolderClick: (g, i) => { Store.set('groupIdx', i); _selectGroup(g, true); },
      onGroupClick: (g, li) => { Store.set('groupIdx', parseInt(li.dataset.idx)); _selectGroup(g, true); }
    });
  }

  function _updateGroupClasses() {
    const groups = Store.get('groups');
    const currentGroup = _getCurrentGroup();
    const groupIdx = Store.get('groupIdx');
    const els = document.querySelectorAll('.group-item');
    els.forEach((el, i) => {
      el.classList.toggle('focused', i === groupIdx && _focusZone === 'groups');
      el.classList.toggle('active', groups[i]?.id === currentGroup);
    });
    _sidebarFocusablesCache = null;
  }

  function _updateGroupCounts() {
    const ctx = _viewState.getFilterContext();
    const cache = getGroupCounts(
      ctx.channels,
      ctx.currentCountry,
      ctx.currentTab,
      ctx.currentListId,
      ctx.favSet || ctx.favIds,
      Watching.getSet(ctx.currentListId)
    );

    const els = document.querySelectorAll('.group-item');
    if (!els.length) return;
    els.forEach((el) => {
      const groupId = el.dataset.groupId;
      if (!groupId) return;
      const countEl = el.querySelector('.group-count');
      if (countEl) countEl.textContent = cache[groupId] || 0;
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
  }

  function renderChannels(list) {
    const ctx = _viewState.getFilterContext();
    let items;
    if (list) {
      items = list;
    } else {
      const favIds = Favorites.getSet();
      items = Playlist.filterByGroup(ctx.channels, ctx.currentGroup, favIds, ctx.currentCountry);
    }

    const layout = _currentTab === 'tv' ? 'tv' : 'poster';
    const listSignature = list ? `${list.length}|${list[0]?.id || ''}|${list[list.length - 1]?.id || ''}` : '';
    const favVersion = Favorites.getVersion();
    const watchingVersion = Watching.getVersion();
    const channelsInput = [
      ctx.channels,
      ctx.currentCountry,
      ctx.currentGroup || null,
      ctx.currentTab,
      ctx.currentListId,
      layout,
      listSignature,
      ctx.currentGroup === '__favs__' ? favVersion : '',
      ctx.currentGroup === '__watching__' ? watchingVersion : ''
    ];
    if (_lastChannelsRenderInput &&
        _lastChannelsRenderInput.length === channelsInput.length &&
        channelsInput.every((value, idx) => value === _lastChannelsRenderInput[idx])) {
      _updateGroupCounts();
      return;
    }
    _lastChannelsRenderInput = channelsInput;
    setChannelHeader({ currentGroup: ctx.currentGroup, currentTab: ctx.currentTab, count: items.length });

    if (_currentLayoutMode !== layout) {
      // Layout change requires full re-init
      _currentLayoutMode = layout;
      VirtualList.init({
        containerId:  'channel-grid',
        items,
        layout:       layout,
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
    const listId = _getCurrentListId();
    Storage.setLastChannel(ch.id, listId);

    // Si estamos en "Seguir viendo" y tiene un episodio guardado
    if (_getCurrentGroup() === '__watching__' && ch.type === 'series') {
      const items = Watching.getItems();
      const wItem = items.find(i => (typeof i === 'object' && i.id === ch.id));
      if (wItem && wItem.ep) {
        const ep = wItem.ep;
        const list = Store.peek('currentList');
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
    _syncFocusStateFromController();
  }

  function _hideExitPopup() {
    _focus.hideExit();
    _syncFocusStateFromController();
  }

  function _moveExit(dir) {
    _focus.moveExit(dir);
    _syncFocusStateFromController();
  }

  function refreshUI() {
    _updateGroupCounts();
    if (typeof VirtualList !== 'undefined') {
      VirtualList.refreshVisible();
    }
  }

  function initKeys() {
    _input.init();
  }

  
  async function _switchTab(tabId) {
    if (_currentTab === tabId) return;
    _tabs.abortPendingLoad();
    _tabFocusIdx = Math.max(0, TABS.indexOf(tabId));

    if (_currentTab === 'tv') {
      _lastTvCountry = _getCurrentCountry();
    }
    
    _currentTab = tabId;
    Store.set('currentTab', _currentTab);
    
    // Si pasamos a VOD o Series, ocultamos el PIP
    if ((tabId === 'vod' || tabId === 'series') && typeof Player !== 'undefined') {
      Player.stop();
    }

    Playlist.clearGroupCache();

    if (tabId === 'tv') {
      const codes = Store.get('countries') || ['ALL'];
      const idx = codes.indexOf(_lastTvCountry);
      Store.set('currentCountry', idx >= 0 ? _lastTvCountry : 'ALL');
      _countryFocusIdx = idx >= 0 ? idx : 0;
    } else {
      Store.set('currentCountry', 'ALL');
      _countryFocusIdx = 0;
    }
    renderCountries();
    
    _tabs.activate(tabId);
    _setFocusZone('tabs');

    const list = Store.peek('currentList');
    if (tabId === 'tv') {
      Store.set('currentData', Store.peek('channels') || []);
      Store.set('currentGroup', null);
      _renderData(Store.peek('channels') || []);
      return;
    }

    if (!list || list.type !== 'xtream') {
      Router.showToast('VOD y Series solo disponibles en cuentas Xtream Codes', 'info');
      return;
    }

    const data = await _tabs.load(tabId, list);
    if (data === null || _currentTab !== tabId) return;

    Store.set('currentGroup', null);

    _renderData(data);
  }

  function _renderData(data) {
    return _viewState.renderData(data);
  }

  function playChannelRelative(dir) {
    const cur  = Player.getCurrent();
    if (!cur) return;
    const curIdx = VirtualList.getFocused();
    const nextIdx = dir === 'next' ? curIdx + 1 : curIdx - 1;
    const next = VirtualList.getItem(nextIdx);
    if (next) { VirtualList.setFocused(nextIdx); _playChannel(next); }
  }

  function syncWithChannel(ch, options) {
    return _viewState.syncWithChannel(ch, options);
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
