/**
 * search.js — Fast debounced search using pre-built index
 */
const Search = (() => {
  let _allChannels = [];
  let _debounceTimer = null;
  let _isOpen = false;

  function init(channels) {
    _allChannels = channels;
  }

  function open() {
    if (_isOpen) return;
    _isOpen = true;
    const bar   = document.getElementById('search-bar');
    const input = document.getElementById('search-input');
    if (!bar || !input) return;
    input.value = '';
    bar.classList.remove('hidden');
    // Focus the input so TV keyboard appears (if available)
    setTimeout(() => input.focus(), 50);
    input.addEventListener('input', _onInput);
    KeyHandler.on('BACK', _onBack);
  }

  function close() {
    if (!_isOpen) return;
    _isOpen = false;
    const bar   = document.getElementById('search-bar');
    const input = document.getElementById('search-input');
    if (bar)   bar.classList.add('hidden');
    if (input) { input.removeEventListener('input', _onInput); input.value = ''; }
    KeyHandler.off('BACK', _onBack);
    // Restore full channel list
    ViewChannels.renderChannels();
  }

  const _onInput = (e) => {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => {
      const q   = e.target.value.trim();
      const currentTab = typeof ViewChannels !== 'undefined' ? ViewChannels.getCurrentTab() : 'tv';
      const data = currentTab === 'tv' ? (Store.get('channels') || []) : (Store.get('currentData') || []);
      const res = Playlist.search(data, q);
      const cnt = document.getElementById('search-count');
      if (cnt) {
         if (currentTab === 'tv') cnt.textContent = q ? res.length + ' canales' : '';
         else if (currentTab === 'vod') cnt.textContent = q ? res.length + ' películas' : '';
         else cnt.textContent = q ? res.length + ' series' : '';
      }
      ViewChannels.renderChannels(res.length || q ? res : data);
    }, 120); // 120ms debounce — fast but not every keystroke
  };

  const _onBack = () => {
    // Solo procesar BACK si la vista de canales está activa
    const viewChannels = document.getElementById('view-channels');
    if (_isOpen && viewChannels && viewChannels.classList.contains('active')) { 
      close(); 
      return true; 
    }
  };

  function isOpen() { return _isOpen; }

  return { init, open, close, isOpen };
})();
