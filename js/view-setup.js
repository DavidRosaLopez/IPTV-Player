const ViewSetup = (() => {
  const COUNTRY_MAP = {
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

  let _setupEventsBound = false;
  let _setupZone = 'tabs'; // 'tabs' | 'content' | 'exit'
  let _setupTabIdx = 0;
  let _setupContentIdx = 0;
  let _editingListId = null;
  let _prevSetupZone = 'tabs';
  let _exitFocusIdx = 0;

  function _uid() { return Math.random().toString(36).substring(2, 9); }
  function _val(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function _setStatus(id, msg, type) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.className = `status-msg ${type}`;
  }

  function _getSetupTabs() { return Array.from(document.querySelectorAll('#view-setup .tab-btn')); }
  function _getSetupContent() { return Array.from(document.querySelectorAll('#view-setup .tab-content.active .tv-input, #view-setup .tab-content.active .btn-primary, #view-setup .tab-content.active .btn-secondary, #view-setup .tab-content.active .saved-item, #view-setup .tab-content.active .saved-item-default, #view-setup .tab-content.active .saved-item-edit, #view-setup .tab-content.active .saved-item-del, #view-setup .tab-content.active .country-setting-item')); }


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

  function _showExitPopup() {
    _prevSetupZone = _setupZone;
    _setupZone = 'exit';
    _exitFocusIdx = 0;
    const el = document.getElementById('exit-popup');
    if (el) el.classList.remove('hidden');
    _updateExitFocus();
  }

  function _hideExitPopup() {
    _setupZone = _prevSetupZone;
    const el = document.getElementById('exit-popup');
    if (el) el.classList.add('hidden');
    _updateSetupFocus();
  }

  function _updateExitFocus() {
    const cancel = document.getElementById('btn-exit-cancel');
    const confirm = document.getElementById('btn-exit-confirm');
    if (cancel) cancel.classList.toggle('focused', _exitFocusIdx === 0);
    if (confirm) confirm.classList.toggle('focused', _exitFocusIdx === 1);
  }

  function _switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-content-' + tab));
  }

  function _renderSavedLists() {
    const lists = Storage.getLists();
    const el = document.getElementById('saved-list');
    if (!el) return;
    if (!lists.length) { el.innerHTML = '<p class="empty-msg">No hay listas guardadas</p>'; return; }
    el.innerHTML = '';
    const defaultListId = Storage.getDefaultList();
    lists.forEach(list => {
      const isDefault = defaultListId === list.id;
      const item = document.createElement('div');
      item.className = 'saved-item focusable';
      item.innerHTML = `
        <span class="saved-item-icon material-symbols-rounded">${list.type === 'xtream' ? 'key' : 'list_alt'}</span>
        <div class="saved-item-info">
          <div class="saved-item-name">${list.name}</div>
          <div class="saved-item-type">${list.type === 'xtream' ? 'Xtream · ' + list.server : 'M3U8'}</div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="saved-item-default" data-id="${list.id}"><span class="material-symbols-rounded" style="font-size: 20px; color: ${isDefault ? 'var(--yellow)' : 'var(--text-sec)'};">${isDefault ? 'star' : 'star_border'}</span></button>
          <button class="saved-item-edit" data-id="${list.id}"><span class="material-symbols-rounded" style="font-size: 20px;">edit</span></button>
          <button class="saved-item-del" data-id="${list.id}"><span class="material-symbols-rounded" style="font-size: 20px;">delete</span></button>
        </div>`;
      
      item.querySelector('.saved-item-default').addEventListener('click', e => { e.stopPropagation(); _toggleDefaultList(list.id); });
      item.querySelector('.saved-item-edit').addEventListener('click', e => { e.stopPropagation(); _editList(list); });
      item.querySelector('.saved-item-del').addEventListener('click', e => { e.stopPropagation(); _deleteList(list.id); });
      item.addEventListener('click', () => {
        if (typeof App !== 'undefined') App.loadList(list);
      });
      el.appendChild(item);
    });
  }

  function _toggleDefaultList(id) {
    const currentDefault = Storage.getDefaultList();
    if (currentDefault === id) {
      Storage.setDefaultList(null);
      if (typeof Router !== 'undefined') Router.showToast('Sin lista por defecto', 'info');
    } else {
      Storage.setDefaultList(id);
      if (typeof Router !== 'undefined') Router.showToast('Lista establecida por defecto', 'success');
    }
    _renderSavedLists();
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
    if (Storage.getDefaultList() === id) {
      Storage.setDefaultList(null);
    }
    Storage.clearChannelCache(id);
    Storage.saveLists(Storage.getLists().filter(l => l.id !== id));
    Playlist.clearGroupCache();
    _renderSavedLists();
    if (typeof Router !== 'undefined') Router.showToast('Lista eliminada', 'success');
  }

  function _saveList(list) {
    const lists = Storage.getLists().filter(l => l.id !== list.id);
    lists.push(list);
    Storage.saveLists(lists);
    _renderSavedLists();
  }

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
    
    if (typeof App !== 'undefined') {
      App.loadList(list);
    }
  }

  async function _testXtream() {
    const server = _val('xt-server').replace(/\/+$/,'');
    const user   = _val('xt-user');
    const pass   = _val('xt-pass');
    if (!server || !user || !pass) {
      _setStatus('xt-status', 'Rellena todos los campos', 'error');
      return;
    }
    _setStatus('xt-status', 'Probando...', '');
    try {
      const r  = await fetch(`${server}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`);
      const d  = await r.json();
      const ok = d?.user_info?.auth === 1;
      _setStatus('xt-status', ok ? '✓ Credenciales correctas' : '✗ Credenciales incorrectas', ok ? 'success' : 'error');
    } catch { _setStatus('xt-status', '✗ No se puede conectar', 'error'); }
  }

  function _renderCountrySettings() {
    const container = document.getElementById('country-settings-list');
    if (!container) return;
    
    let codes = Store.get('allCountries') || [];
    if (!codes.length) {
      const channels = Store.get('channels') || [];
      const codesSet = new Set();
      for (const c of channels) {
        if (c.countryCode) codesSet.add(c.countryCode);
      }
      codes = Array.from(codesSet).sort((a, b) => {
        const nameA = (COUNTRY_MAP[a] || {name: a}).name;
        const nameB = (COUNTRY_MAP[b] || {name: b}).name;
        return nameA.localeCompare(nameB);
      });
      const idxOtros = codes.indexOf('OTROS');
      if (idxOtros >= 0) {
        codes.splice(idxOtros, 1);
        codes.push('OTROS');
      }
      Store.set('allCountries', codes);
    }

    if (!codes.length) {
      container.innerHTML = '<p class="empty-msg">Carga una lista de canales para ver los ajustes de país</p>';
      return;
    }

    const existingItems = container.querySelectorAll('.country-setting-item');
    const visibleCountries = Storage.getVisibleCountries();
    const isAllChecked = visibleCountries === null || visibleCountries.length === codes.length;

    if (existingItems.length > 0) {
      existingItems.forEach(item => {
        const code = item.dataset.code;
        if (code === 'ALL') {
          item.classList.toggle('checked', isAllChecked);
        } else {
          const isChecked = visibleCountries === null || visibleCountries.includes(code);
          item.classList.toggle('checked', isChecked);
        }
      });
      return;
    }

    container.innerHTML = '';

    // Fila "Seleccionar todos"
    const allItem = document.createElement('div');
    allItem.className = 'country-setting-item focusable' + (isAllChecked ? ' checked' : '');
    allItem.dataset.code = 'ALL';
    allItem.innerHTML = `
      <div class="checkbox-box">
        <span class="material-symbols-rounded">check</span>
      </div>
      <span class="country-setting-label" style="font-weight: 700;">🌎 Seleccionar todos</span>
    `;
    allItem.addEventListener('click', () => {
      const currentlyChecked = allItem.classList.contains('checked');
      if (currentlyChecked) {
        Storage.setVisibleCountries([]);
      } else {
        Storage.setVisibleCountries(null);
      }
      _renderCountrySettings();
    });
    container.appendChild(allItem);

    codes.forEach(code => {
      const isChecked = visibleCountries === null || visibleCountries.includes(code);
      const info = COUNTRY_MAP[code] || { emoji: '🏳️', name: code };
      
      const item = document.createElement('div');
      item.className = 'country-setting-item focusable' + (isChecked ? ' checked' : '');
      item.dataset.code = code;
      item.innerHTML = `
        <div class="checkbox-box">
          <span class="material-symbols-rounded">check</span>
        </div>
        <span class="country-setting-label">${info.emoji} ${info.name}</span>
      `;
      
      item.addEventListener('click', () => {
        _toggleCountryVisibility(code);
      });
      
      container.appendChild(item);
    });
  }

  function _toggleCountryVisibility(code) {
    let visibleCountries = Storage.getVisibleCountries();
    let codes = Store.get('allCountries') || [];

    if (visibleCountries === null) {
      visibleCountries = codes.filter(c => c !== code);
    } else {
      if (visibleCountries.includes(code)) {
        visibleCountries = visibleCountries.filter(c => c !== code);
      } else {
        visibleCountries.push(code);
      }
    }
    
    Storage.setVisibleCountries(visibleCountries);
    _renderCountrySettings();
  }

  function onShow() {
    _renderSavedLists();
    _renderCountrySettings();

    const handleRemoteList = (list) => {
      list.id = list.id || _uid();
      _saveList(list);
      if (typeof Router !== 'undefined') Router.showToast('Lista remota sincronizada', 'success');
      if (typeof App !== 'undefined') App.loadList(list);
    };

    if (typeof Sync !== 'undefined') {
      Sync.init(handleRemoteList);
    }

    const tabs = Array.from(_getSetupTabs());
    const lists = Storage.getLists();

    if (lists.length > 0) {
      const savedTabIdx = tabs.findIndex(t => t.dataset.tab === 'saved');
      if (savedTabIdx >= 0) {
        _setupTabIdx = savedTabIdx;
        _switchTab('saved');
        _setupZone = 'content';
        _setupContentIdx = 0;
      }
    } else {
      _setupZone = 'tabs';
      _setupTabIdx = 0;
      if (tabs.length > 0) _switchTab(tabs[0].dataset.tab);
    }

    _updateSetupFocus();

    if (_setupEventsBound) return;
    _setupEventsBound = true;

    document.querySelectorAll('.tab-btn').forEach((btn, idx) =>
      btn.addEventListener('click', () => {
        _setupZone = 'tabs';
        _setupTabIdx = idx;
        _switchTab(btn.dataset.tab);
        if (btn.dataset.tab === 'settings') {
          _renderCountrySettings();
        }
        _updateSetupFocus();
      })
    );


    document.getElementById('btn-add-xtream')?.addEventListener('click', () => _addXtream());
    document.getElementById('btn-test-xtream')?.addEventListener('click', () => _testXtream());
    document.getElementById('btn-cancel-load')?.addEventListener('click', () => {
      if (typeof App !== 'undefined') App.cancelLoad();
    });

    // D-pad navigation for setup
    KeyHandler.on('RIGHT', () => {
      if (typeof Router === 'undefined' || !Router.isView('setup')) return;
      const progressEl = document.getElementById('setup-progress');
      if (progressEl && !progressEl.classList.contains('hidden')) return true;
      if (_setupZone === 'exit') {
        _exitFocusIdx = 1;
        _updateExitFocus();
        return true;
      }
      if (_setupZone === 'tabs') {
        _setupTabIdx = Math.min(_getSetupTabs().length - 1, _setupTabIdx + 1);
        _getSetupTabs()[_setupTabIdx]?.click();
      } else {
        const activeTab = document.querySelector('#view-setup .tab-btn.active')?.dataset.tab;
        if (activeTab === 'settings') {
          _setupTabIdx = (_setupTabIdx + 1) % _getSetupTabs().length;
          _setupZone = 'tabs';
          _getSetupTabs()[_setupTabIdx]?.click();
          return true;
        }
        if (activeTab === 'saved') {
          const row = Math.floor(_setupContentIdx / 4);
          const col = _setupContentIdx % 4;
          const newCol = Math.min(3, col + 1);
          _setupContentIdx = row * 4 + newCol;
        } else {
          _setupContentIdx = Math.min(_getSetupContent().length - 1, _setupContentIdx + 1);
        }
        _updateSetupFocus();
      }
      return true;
    });

    KeyHandler.on('LEFT', () => {
      if (typeof Router === 'undefined' || !Router.isView('setup')) return;
      const progressEl = document.getElementById('setup-progress');
      if (progressEl && !progressEl.classList.contains('hidden')) return true;
      if (_setupZone === 'exit') {
        _exitFocusIdx = 0;
        _updateExitFocus();
        return true;
      }
      if (_setupZone === 'tabs') {
        _setupTabIdx = Math.max(0, _setupTabIdx - 1);
        _getSetupTabs()[_setupTabIdx]?.click();
      } else {
        const activeTab = document.querySelector('#view-setup .tab-btn.active')?.dataset.tab;
        if (activeTab === 'settings') {
          _setupTabIdx = _setupTabIdx === 0 ? _getSetupTabs().length - 1 : _setupTabIdx - 1;
          _setupZone = 'tabs';
          _getSetupTabs()[_setupTabIdx]?.click();
          return true;
        }
        if (activeTab === 'saved') {
          const row = Math.floor(_setupContentIdx / 4);
          const col = _setupContentIdx % 4;
          const newCol = Math.max(0, col - 1);
          _setupContentIdx = row * 4 + newCol;
        } else {
          _setupContentIdx = Math.max(0, _setupContentIdx - 1);
        }
        _updateSetupFocus();
      }
      return true;
    });

    KeyHandler.on('DOWN', () => {
      if (typeof Router === 'undefined' || !Router.isView('setup')) return;
      const progressEl = document.getElementById('setup-progress');
      if (progressEl && !progressEl.classList.contains('hidden')) return true;
      if (_setupZone === 'exit') return true;
      if (_setupZone === 'tabs') {
        _setupZone = 'content';
        _setupContentIdx = 0;
      } else {
        const activeTab = document.querySelector('#view-setup .tab-btn.active')?.dataset.tab;
        if (activeTab === 'saved') {
          const listsCount = Storage.getLists().length;
          const row = Math.floor(_setupContentIdx / 4);
          const col = _setupContentIdx % 4;
          if (row < listsCount - 1) {
            _setupContentIdx = (row + 1) * 4 + col;
          }
        } else {
          _setupContentIdx = Math.min(_getSetupContent().length - 1, _setupContentIdx + 1);
        }
      }
      _updateSetupFocus();
      return true;
    });

    KeyHandler.on('UP', () => {
      if (typeof Router === 'undefined' || !Router.isView('setup')) return;
      const progressEl = document.getElementById('setup-progress');
      if (progressEl && !progressEl.classList.contains('hidden')) return true;
      if (_setupZone === 'exit') return true;
      if (_setupZone === 'content') {
        const activeTab = document.querySelector('#view-setup .tab-btn.active')?.dataset.tab;
        if (activeTab === 'saved') {
          const row = Math.floor(_setupContentIdx / 4);
          const col = _setupContentIdx % 4;
          if (row > 0) {
            _setupContentIdx = (row - 1) * 4 + col;
          } else {
            _setupZone = 'tabs';
          }
        } else {
          if (_setupContentIdx === 0) _setupZone = 'tabs';
          else _setupContentIdx--;
        }
        _updateSetupFocus();
      }
      return true;
    });

    KeyHandler.on('ENTER', () => {
      if (typeof Router === 'undefined' || !Router.isView('setup')) return;
      const progressEl = document.getElementById('setup-progress');
      if (progressEl && !progressEl.classList.contains('hidden')) {
        if (typeof App !== 'undefined') App.cancelLoad();
        return true;
      }
      if (_setupZone === 'exit') {
        if (_exitFocusIdx === 0) {
          _hideExitPopup();
        } else {
          try { tizen?.application?.getCurrentApplication()?.exit(); } catch(e) {}
        }
        return true;
      }
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

    KeyHandler.on('BACK', () => {
      if (typeof Router === 'undefined' || !Router.isView('setup')) return;
      const progressEl = document.getElementById('setup-progress');
      if (progressEl && !progressEl.classList.contains('hidden')) {
        if (typeof App !== 'undefined') App.cancelLoad();
        return true;
      }
      if (_setupZone === 'exit') {
        _hideExitPopup();
        return true;
      }
      const channels = typeof Store !== 'undefined' ? Store.get('channels') : [];
      if (channels && channels.length > 0) {
        Router.showView('channels');
        return true;
      }
      _showExitPopup();
      return true;
    });
  }

  return { onShow };
})();
