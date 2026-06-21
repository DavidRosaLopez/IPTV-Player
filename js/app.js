/**
 * app.js — Main Application Orchestrator
 */
const App = (() => {
  let _clockTimer = null;
  let _currentAbortController = null;
  let _prefetchTimer = null;
  let _prefetchController = null;
  let _syncTimer = null;

  function init() {
    KeyHandler.init();
    Favorites.init();

    document.getElementById('btn-cancel-load')?.addEventListener('click', () => {
      cancelLoad();
    });

    // Pre-populate default lists if storage lists is empty
    let lists = Storage.getLists();
    if (!lists || lists.length === 0) {
      if (typeof Config !== 'undefined' && Config.defaultLists) {
        lists = Config.defaultLists;
        Storage.saveLists(lists);
      } else {
        lists = [];
      }
    }

    let defaultListId = Storage.getDefaultList();

    // Auto-marcar la primera lista como predeterminada si no hay ninguna
    if (!defaultListId && lists && lists.length > 0) {
      defaultListId = lists[0].id;
      Storage.setDefaultList(defaultListId);
    }
    
    let listToLoad = null;
    if (defaultListId) {
      listToLoad = lists.find(l => l.id === defaultListId);
    }
    if (!listToLoad && lists.length === 1) {
      listToLoad = lists[0];
    }

    _startClock();

    if (listToLoad) {
      loadList(listToLoad);
      return;
    }

    Router.showView('setup');
  }

  function _startClock() {
    const timeEl = document.getElementById('channels-time');
    const dateEl = document.getElementById('channels-date');
    if (!timeEl || !dateEl) return;
    const update = () => {
      const now = new Date();
      timeEl.textContent = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      dateEl.textContent = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    };
    update();
    if (_clockTimer) clearInterval(_clockTimer);
    _clockTimer = setInterval(update, 10000);
  }

  async function loadList(list) {
    if (_currentAbortController) {
      _currentAbortController.abort();
    }
    _currentAbortController = new AbortController();

    const prevList = Store.get('currentList');

    const steps = [
      { id: 'cache',     label: 'Comprobando caché local' },
      { id: 'connect',   label: 'Conectando al servidor' },
      { id: 'download',  label: 'Descargando lista' },
      { id: 'parse',     label: 'Procesando lista' },
    ];
    SetupProgress.show('Cargando Lista', list.name, steps);
    SetupProgress.step('cache');
    SetupProgress.progress(0);

    const cached = await Storage.getChannelCache(list.id);
    
    // Si el usuario le dio a cancelar durante la lectura asíncrona de IndexedDB
    if (!_currentAbortController || _currentAbortController.signal.aborted) {
      return; 
    }

    if (cached) {
      SetupProgress.progress(100);
      await new Promise(r => setTimeout(r, 400));
      
      // Chequeo secundario por si canceló durante los 400ms
      if (!_currentAbortController || _currentAbortController.signal.aborted) return;

      SetupProgress.hide();

      Store.set('currentList', list);
      Storage.setLastList(list.id);
      Store.set('channels', cached);

      await _afterLoad(list, true);
      _currentAbortController = null;
      return;
    }

    try {
      SetupProgress.step('connect');
      let loadedChannels = [];
      if (list.type === 'xtream') {
        _preconnect(list.server);
        SetupProgress.step('download');
        const r = await Playlist.loadXtream(list.server, list.user, list.pass, pct => {
            SetupProgress.progress(Math.round(pct * 0.8));
            if (pct > 50) SetupProgress.step('parse');
        }, _currentAbortController.signal);
        loadedChannels = r.channels;
        if (!list.epgUrl && r.epgUrl) list.epgUrl = r.epgUrl;
      } else {
        SetupProgress.step('download');
        loadedChannels = await Playlist.loadM3U(list.url, pct => {
            SetupProgress.progress(Math.round(pct * 0.8));
            if (pct > 50) SetupProgress.step('parse');
        }, _currentAbortController.signal);
      }
      SetupProgress.progress(100);

      if (_currentAbortController.signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      Store.set('currentList', list);
      Storage.setLastList(list.id);
      Store.set('channels', loadedChannels);
      await Storage.setChannelCache(list.id, loadedChannels);

      await new Promise(r => setTimeout(r, 400));
      SetupProgress.hide();
      await _afterLoad(list);
    } catch(e) {
      SetupProgress.hide();
      if (e.name === 'AbortError') {
        Router.showToast('Proceso de carga cancelado', 'info');
        if (prevList) {
          Store.set('currentList', prevList);
          Storage.setLastList(prevList.id);
        }
      } else {
        Router.showToast('Error cargando lista: ' + (e.message || ''), 'error');
      }
      Router.showView('setup');
    } finally {
      _currentAbortController = null;
    }
  }

  function cancelLoad() {
    if (_currentAbortController) {
      _currentAbortController.abort();
      _currentAbortController = null;
    }
    if (_prefetchController) {
      _prefetchController.abort();
      _prefetchController = null;
    }
    if (_prefetchTimer) {
      clearTimeout(_prefetchTimer);
      _prefetchTimer = null;
    }
    if (_syncTimer) {
      clearTimeout(_syncTimer);
      _syncTimer = null;
    }
  }

  async function _afterLoad(list, fromCache = false) {
    Playlist.clearGroupCache();
    const channels = Store.get('channels');
    Store.set('groups', Playlist.getGroups(channels));
    Store.set('groupCountsCache', null);
    Store.set('currentGroup', '__all__');
    Store.set('groupIdx', 0);

    if (typeof Favorites !== 'undefined') {
      Favorites.init();
    }


    Router.hideLoading();

    Search.init(channels);
    Player.init((dir) => {
      if (typeof ViewChannels !== 'undefined') ViewChannels.playChannelRelative(dir);
    });

    Router.showView('channels');
    
    const lastChannelId = Storage.getLastChannel();
    if (lastChannelId) {
      const ch = channels.find(c => c.id === lastChannelId);
      if (ch) {
        if (typeof ViewChannels !== 'undefined') ViewChannels.syncWithChannel(ch);
        setTimeout(() => Player.schedulePreview(ch), 300);
      } else {
        if (typeof ViewChannels !== 'undefined') {
          ViewChannels.renderGroups();
          ViewChannels.renderChannels();
        }
      }
    } else {
      if (typeof ViewChannels !== 'undefined') {
        ViewChannels.renderGroups();
        ViewChannels.renderChannels();
      }
    }

    // Background prefetch for VOD and Series
    if (list && list.type === 'xtream') {
      if (_prefetchTimer) clearTimeout(_prefetchTimer);
      _prefetchTimer = setTimeout(async () => {
        _prefetchTimer = null;
        // No competir con el stream activo de vídeo
        if (typeof Player !== 'undefined' && Player.getMode() !== 'IDLE') return;
        if (_prefetchController) _prefetchController.abort();
        _prefetchController = new AbortController();
        const signal = _prefetchController.signal;
        try {
          // Lanzar VOD y Series en paralelo (antes era secuencial — el doble de tiempo)
          const [vodCached, serCached] = await Promise.all([
            Storage.getVodCache(list.id),
            Storage.getSeriesCache(list.id)
          ]);
          if (signal.aborted) return;

          const tasks = [];
          if (!vodCached || vodCached.length === 0) {
            tasks.push(
              Playlist.loadVod(list.server, list.user, list.pass, null, signal)
                .then(vData => { if (!signal.aborted && vData && vData.length > 0) return Storage.setVodCache(list.id, vData); })
                .catch(e => { if (e.name !== 'AbortError') console.error('Prefetch VOD error', e); })
            );
          }
          if (!serCached || serCached.length === 0) {
            tasks.push(
              Playlist.loadSeries(list.server, list.user, list.pass, null, signal)
                .then(sData => { if (!signal.aborted && sData && sData.length > 0) return Storage.setSeriesCache(list.id, sData); })
                .catch(e => { if (e.name !== 'AbortError') console.error('Prefetch Series error', e); })
            );
          }
          await Promise.all(tasks);
        } catch(e) {
          if (e.name !== 'AbortError') console.error('Prefetch error', e);
        } finally {
          _prefetchController = null;
        }
      }, 5000); // 5s — más margen para la UI inicial
    }

    // Comprobar actualización silenciosa
    if (fromCache && _shouldCheckUpdate(list.id)) {
      if (_syncTimer) clearTimeout(_syncTimer);
      _syncTimer = setTimeout(() => {
        _syncTimer = null;
        _backgroundSync(list);
      }, 500);
    }
  }

  // --- Background Sync ---
  function _shouldCheckUpdate(listId) {
    const lastSync = localStorage.getItem(`sync_${listId}`) || 0;
    const hoursSince = (Date.now() - parseInt(lastSync)) / (1000 * 60 * 60);
    return hoursSince > 12; 
  }

  async function _backgroundSync(list) {
    // No sincronizar si el reproductor está activo (compite por ancho de banda)
    if (typeof Player !== 'undefined' && Player.getMode() !== 'IDLE') {
      // Reintentar más tarde
      if (_syncTimer) clearTimeout(_syncTimer);
      _syncTimer = setTimeout(() => { _syncTimer = null; _backgroundSync(list); }, 30000);
      return;
    }
    const controller = new AbortController();
    try {
      console.log('Background Sync: Buscando actualizaciones silenciosas...');
      let newChannels = [];
      if (list.type === 'xtream') {
        const r = await Playlist.loadXtream(list.server, list.user, list.pass, () => {}, controller.signal);
        newChannels = r.channels;
      } else {
        newChannels = await Playlist.loadM3U(list.url, () => {}, controller.signal);
      }
      
      if (controller.signal.aborted) return;
      if (newChannels.length > 0) {
        Store.set('channels', newChannels);
        await Storage.setChannelCache(list.id, newChannels);
        localStorage.setItem(`sync_${list.id}`, Date.now().toString());
        
        Playlist.clearGroupCache();
        Store.set('groups', Playlist.getGroups(newChannels));
        Store.set('groupCountsCache', null);
        
        if (Router.isView('channels') && typeof ViewChannels !== 'undefined') {
          ViewChannels.renderGroups();
          ViewChannels.renderChannels();
        }
        Router.showToast('Lista actualizada en segundo plano', 'success');
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.warn('Background Sync Fallido:', e);
    } finally {
      controller.abort();
    }
  }

  // --- Util: Preconnect ---
  function _preconnect(url) {
    try {
      const origin = new URL(url).origin;
      if (!document.querySelector(`link[href="${origin}"]`)) {
        const link = document.createElement('link');
        link.rel = 'preconnect';
        link.href = origin;
        document.head.appendChild(link);
      }
    } catch(e) {}
  }

  return { init, loadList, cancelLoad };
})();

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
