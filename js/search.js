/**
 * search.js — Fast debounced search using pre-built index
 */
import { Store } from './store.js';
import { KeyHandler } from './keyHandler.js';
import { Playlist } from './playlist.js';
import { VirtualList } from './virtual-list.js';
import { Player } from './player.js';
import { InfoPopup } from './info-popup.js';


export const Search = (() => {
  let _debounceTimer = null;
  let _isOpen = false;
  let _lastSearchKey = '';
  let _lastSearchDataRef = null;
  let _view = {
    getCurrentTab: () => 'tv',
    renderChannels: () => {},
    focusSearchResults: () => {},
    setSidebarFocusToSearch: () => {}
  };

  function configure(viewApi) {
    _view = { ..._view, ...viewApi };
  }

  function init() {
    _lastSearchKey = '';
    _lastSearchDataRef = null;
  }

  function _getPlaceholder(tab) {
    if (tab === 'vod') return 'Buscar pelÃ­cula...';
    if (tab === 'series') return 'Buscar serie...';
    return 'Buscar canal...';
  }

  function _getDataForTab(currentTab) {
    const data = currentTab === 'tv'
      ? (Store.peek('channels') || [])
      : (Store.peek('currentData') || []);

    if (currentTab !== 'tv') return data;
    return Playlist.getVisibleChannels(data, Store.peek('currentCountry') || 'ALL');
  }

  function _getResultLabel(tab, count) {
    if (tab === 'tv') return `${count} canales`;
    if (tab === 'vod') return `${count} películas`;
    return `${count} series`;
  }

  function open() {
    if (_isOpen) return;
    _isOpen = true;
    const bar   = document.getElementById('search-bar');
    const input = document.getElementById('search-input');
    if (!bar || !input) return;
    input.placeholder = _getPlaceholder(_view.getCurrentTab());
    input.value = '';
    const count = document.getElementById('search-count');
    if (count) count.textContent = '';
    bar.classList.remove('hidden');
    // Focus the input so TV keyboard appears instantly
    input.focus();
    input.addEventListener('input', _onInput);
    input.addEventListener('change', _onChange);
    input.addEventListener('keydown', _onNativeKeyDown);
    KeyHandler.on('BACK', _onBack);
    
    if (typeof VirtualList !== 'undefined') VirtualList.setFocused(-1);
    if (typeof Player !== 'undefined' && Player.getMode() === 'PIP') Player.stop();
  }

  function close() {
    if (!_isOpen) return;
    _isOpen = false;
    clearTimeout(_debounceTimer);
    _lastSearchKey = '';
    _lastSearchDataRef = null;
    const bar   = document.getElementById('search-bar');
    const input = document.getElementById('search-input');
    const count = document.getElementById('search-count');
    if (bar)   bar.classList.add('hidden');
    if (count) count.textContent = '';
    if (input) { 
      input.removeEventListener('input', _onInput); 
      input.removeEventListener('change', _onChange);
      input.removeEventListener('keydown', _onNativeKeyDown);
      input.value = ''; 
    }
    KeyHandler.off('BACK', _onBack);
    _view.renderChannels();
  }

  const _onChange = (e) => {
    _onInput(e);
    setTimeout(() => _view.focusSearchResults(), 200);
  };

  const _onNativeKeyDown = (e) => {
    if (e.keyCode === 13) {
      _onInput(e);
      setTimeout(() => _view.focusSearchResults(), 200);
    }
  };

  const _onInput = (e) => {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => {
      const q   = e.target.value.trim();
      const currentTab = _view.getCurrentTab();
      e.target.placeholder = _getPlaceholder(currentTab);
      const data = _getDataForTab(currentTab);
      const cacheKey = `${currentTab}|${q}|${Store.peek('currentCountry') || 'ALL'}|${Store.peek('currentGroup') || ''}`;
      if (_lastSearchKey === cacheKey && _lastSearchDataRef === data) return;
      _lastSearchKey = cacheKey;
      _lastSearchDataRef = data;
      const res = Playlist.search(data, q);
      const cnt = document.getElementById('search-count');
      if (!q) {
        if (cnt) cnt.textContent = '';
        _view.renderChannels(); // Restaura la vista filtrada por grupo
      } else {
        if (cnt) cnt.textContent = _getResultLabel(currentTab, res.length);
        _view.renderChannels(res);
      }
    }, 120);
  };

  const _onBack = () => {
    if (typeof InfoPopup !== 'undefined' && InfoPopup.isVisible()) return;
    const viewChannels = document.getElementById('view-channels');
    if (_isOpen && viewChannels && viewChannels.classList.contains('active')) { 
      const input = document.getElementById('search-input');
      if (document.activeElement === input) {
        close();
        _view.setSidebarFocusToSearch();
      } else {
        if (input) input.focus();
        if (typeof VirtualList !== 'undefined') {
          VirtualList.setFocused(-1); // Quitar el foco del canal
        }
        if (typeof Player !== 'undefined' && Player.getMode() === 'PIP') {
          Player.stop(); // Cerrar el mini-reproductor
        }
      }
      return true; 
    }
  };

  function isOpen() { return _isOpen; }

  function reapply() {
    if (!_isOpen) return;
    const input = document.getElementById('search-input');
    if (input) {
      input.placeholder = _getPlaceholder(_view.getCurrentTab());
      input.dispatchEvent(new Event('input'));
    }
  }

  return { configure, init, open, close, isOpen, reapply };
})();
