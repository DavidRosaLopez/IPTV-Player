/**
 * app.js — Main Application Orchestrator
 */
const App = (() => {
  let _clockTimer = null;

  function init() {
    KeyHandler.init();
    Favorites.init();

    // Pre-populate default lists if storage lists is empty
    let lists = Storage.getLists();
    if (!lists || lists.length === 0) {
      lists = [
        {
          id: 'predef_1',
          name: 'http://cf.futuremyprovt.com',
          type: 'xtream',
          server: 'http://cf.futuremyprovt.com',
          user: 'f7f23dd33459',
          pass: '604a8e6f2c'
        },
        {
          id: 'predef_2',
          name: 'http://cf.magicmagstreg.com',
          type: 'xtream',
          server: 'http://cf.magicmagstreg.com',
          user: 'f7f23dd33459',
          pass: '604a8e6f2c'
        }
      ];
      Storage.saveLists(lists);
    }

    const defaultListId = Storage.getDefaultList();
    
    let listToLoad = null;
    if (defaultListId) {
      listToLoad = lists.find(l => l.id === defaultListId);
    }
    if (!listToLoad && lists.length === 1) {
      listToLoad = lists[0];
    }

    if (listToLoad) {
      loadList(listToLoad);
      return;
    }

    Router.showView('setup');
    _startClock();
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
    Store.set('currentList', list);
    Storage.setLastList(list.id);

    const cached = Storage.getChannelCache(list.id);
    if (cached) {
      Store.set('channels', cached);
      
      const steps = [{ id: 'cache', label: 'Cargando de caché local' }];
      SetupProgress.show('Cargando Lista', list.name, steps);
      SetupProgress.step('cache');
      SetupProgress.progress(100);
      await new Promise(r => setTimeout(r, 400));
      SetupProgress.hide();

      await _afterLoad(list, true);
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
      let loadedChannels = [];
      if (list.type === 'xtream') {
        SetupProgress.step('download');
        const r = await Playlist.loadXtream(list.server, list.user, list.pass, pct => {
            SetupProgress.progress(Math.round(pct * 0.8));
            if (pct > 50) SetupProgress.step('parse');
        });
        loadedChannels = r.channels;
        if (!list.epgUrl && r.epgUrl) list.epgUrl = r.epgUrl;
      } else {
        SetupProgress.step('download');
        loadedChannels = await Playlist.loadM3U(list.url, pct => {
            SetupProgress.progress(Math.round(pct * 0.8));
            if (pct > 50) SetupProgress.step('parse');
        });
      }
      SetupProgress.progress(100);
      Store.set('channels', loadedChannels);
      Storage.setChannelCache(list.id, loadedChannels);
      await new Promise(r => setTimeout(r, 400));
      SetupProgress.hide();
      await _afterLoad(list);
    } catch(e) {
      SetupProgress.hide();
      Router.showToast('Error cargando lista', 'error');
      Router.showView('setup');
    }
  }

  async function _afterLoad(list, fromCache = false) {
    Playlist.clearGroupCache();
    const channels = Store.get('channels');
    Store.set('groups', Playlist.getGroups(channels));
    Store.set('groupCountsCache', null);
    Store.set('currentGroup', '__all__');
    Store.set('groupIdx', 0);

    Router.hideLoading();

    Search.init(channels);
    Player.init((dir) => {
      if (typeof ViewChannels !== 'undefined') ViewChannels.playChannelRelative(dir);
    });

    Router.showView('channels');
    if (typeof ViewChannels !== 'undefined') {
      ViewChannels.renderGroups();
      ViewChannels.renderChannels();
    }

    const lastChannelId = Storage.getLastChannel();
    if (lastChannelId) {
      const ch = channels.find(c => c.id === lastChannelId);
      if (ch) {
        setTimeout(() => Player.schedulePreview(ch), 300);
      }
    } else {
      setTimeout(() => {
        const ch = VirtualList.getCurrentItem();
        if (ch) Player.schedulePreview(ch);
      }, 300);
    }

    // Comprobar actualización silenciosa
    if (fromCache && _shouldCheckUpdate(list.id)) {
      _backgroundSync(list);
    }
  }

  // --- Background Sync ---
  function _shouldCheckUpdate(listId) {
    const lastSync = localStorage.getItem(`sync_${listId}`) || 0;
    const hoursSince = (Date.now() - parseInt(lastSync)) / (1000 * 60 * 60);
    return hoursSince > 12; 
  }

  async function _backgroundSync(list) {
    try {
      console.log('Background Sync: Buscando actualizaciones silenciosas...');
      let newChannels = [];
      if (list.type === 'xtream') {
        const r = await Playlist.loadXtream(list.server, list.user, list.pass, () => {});
        newChannels = r.channels;
      } else {
        newChannels = await Playlist.loadM3U(list.url, () => {});
      }
      
      if (newChannels.length > 0) {
        Store.set('channels', newChannels);
        Storage.setChannelCache(list.id, newChannels);
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
      console.warn('Background Sync Fallido:', e);
    }
  }

  return { init, loadList };
})();

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
