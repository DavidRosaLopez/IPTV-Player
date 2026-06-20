/**
 * search.js — Fast debounced search using pre-built index
 */
const Search = (() => {
  let _allChannels = [];
  let _debounceTimer = null;
  let _isOpen = false;
  let _lastSearchKey = '';

  function init(channels) {
    _allChannels = channels;
    _lastSearchKey = '';
  }

  function open() {
    if (_isOpen) return;
    _isOpen = true;
    const bar   = document.getElementById('search-bar');
    const input = document.getElementById('search-input');
    if (!bar || !input) return;
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
    // Restore full channel list
    ViewChannels.renderChannels();
  }

  const _onChange = (e) => {
    _onInput(e);
    if (typeof ViewChannels !== 'undefined' && ViewChannels.focusSearchResults) {
      setTimeout(() => ViewChannels.focusSearchResults(), 200);
    }
  };

  const _onNativeKeyDown = (e) => {
    if (e.keyCode === 13) {
      _onInput(e);
      if (typeof ViewChannels !== 'undefined' && ViewChannels.focusSearchResults) {
        setTimeout(() => ViewChannels.focusSearchResults(), 200);
      }
    }
  };

  const _onInput = (e) => {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => {
      const q   = e.target.value.trim();
      const currentTab = typeof ViewChannels !== 'undefined' ? ViewChannels.getCurrentTab() : 'tv';
      const data = currentTab === 'tv' ? (Store.get('channels') || []) : (Store.get('currentData') || []);
      const cacheKey = `${currentTab}|${q}|${Store.get('currentCountry') || 'ALL'}|${Store.get('currentGroup') || ''}|${data.length}`;
      if (_lastSearchKey === cacheKey) return;
      _lastSearchKey = cacheKey;
      const res = Playlist.search(data, q);
      const cnt = document.getElementById('search-count');
      if (!q) {
        if (cnt) cnt.textContent = '';
        ViewChannels.renderChannels(); // Restaura la vista filtrada por grupo
      } else {
        if (cnt) {
           if (currentTab === 'tv') cnt.textContent = res.length + ' canales';
           else if (currentTab === 'vod') cnt.textContent = res.length + ' películas';
           else cnt.textContent = res.length + ' series';
        }
        ViewChannels.renderChannels(res);
      }
    }, 120); // 120ms debounce — fast but not every keystroke
  };

  const _onBack = () => {
    if (typeof InfoPopup !== 'undefined' && InfoPopup.isVisible()) return;
    // Solo procesar BACK si la vista de canales está activa
    const viewChannels = document.getElementById('view-channels');
    if (_isOpen && viewChannels && viewChannels.classList.contains('active')) { 
      const input = document.getElementById('search-input');
      if (document.activeElement === input) {
        close();
        if (typeof ViewChannels !== 'undefined' && ViewChannels.setSidebarFocusToSearch) {
          ViewChannels.setSidebarFocusToSearch();
        }
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
      input.dispatchEvent(new Event('input'));
    }
  }

  return { init, open, close, isOpen, reapply };
})();
