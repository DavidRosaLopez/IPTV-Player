import { Store } from '../store.js';
import { Storage } from '../storage.js';
import { SetupProgress } from '../setup-progress.js';
import { Search } from '../search.js';
import { Playlist } from '../playlist.js';
import { Player } from '../player.js';
import { ViewChannels } from '../view-channels.js';
import { Favorites } from '../favorites.js';
import { Router } from '../router.js';
import { DeviceProfile } from '../device-profile.js';
import { ensureTabData } from './tab-data-loader.js';

export function createListLoader() {
  let _currentAbortController = null;
  let _prefetchTimer = null;
  let _prefetchController = null;
  let _syncTimer = null;

  async function loadList(list) {
    if (_currentAbortController) _currentAbortController.abort();
    _currentAbortController = new AbortController();

    const prevList = Store.get('currentList');
    const steps = [
      { id: 'cache', label: 'Comprobando caché local' },
      { id: 'connect', label: 'Conectando al servidor' },
      { id: 'download', label: 'Descargando lista' },
      { id: 'parse', label: 'Procesando lista' },
    ];

    SetupProgress.show('Cargando Lista', list.name, steps);
    SetupProgress.step('cache');
    SetupProgress.progress(0);

    const cached = await Storage.getChannelCache(list);
    if (!_currentAbortController || _currentAbortController.signal.aborted) return;

    try {
      if (cached && cached.length > 0) {
        SetupProgress.progress(100);
        await new Promise(r => setTimeout(r, 400));
        if (!_currentAbortController || _currentAbortController.signal.aborted) return;

        SetupProgress.hide();
        Store.set('currentList', list);
        Storage.setLastList(list.id);
        Store.set('channels', cached);
        await _afterLoad(list, true);
        _currentAbortController = null;
        return;
      }

      SetupProgress.step('connect');
      if (list.type === 'xtream') _preconnect(list.server);
      SetupProgress.step('download');
      const loadedChannels = await ensureTabData('tv', list, _currentAbortController.signal, pct => {
        SetupProgress.progress(Math.round(pct * 0.8));
        if (pct > 50) SetupProgress.step('parse');
      }, { forceReload: false });

      SetupProgress.progress(100);
      if (_currentAbortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');

      Store.set('currentList', list);
      Storage.setLastList(list.id);
      Store.set('channels', loadedChannels);

      await new Promise(r => setTimeout(r, 400));
      SetupProgress.hide();
      await _afterLoad(list, true);
    } catch (e) {
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
    const channels = Store.peek('channels') || [];
    Store.set('groups', Playlist.getGroups(channels));
    Store.set('groupCountsCache', null);
    Store.set('currentGroup', '__all__');
    Store.set('groupIdx', 0);
    Favorites.init();

    Router.hideLoading();
    Search.init(channels);
    Player.init(dir => {
      if (typeof ViewChannels !== 'undefined') ViewChannels.playChannelRelative(dir);
    });

    Router.showView('channels');

    const lastChannelId = Storage.getLastChannel(list.id);
    if (lastChannelId) {
      const ch = channels.find(c => c.id === lastChannelId);
      if (ch) {
        ViewChannels.syncWithChannel(ch, { focusChannels: false });
        setTimeout(() => Player.schedulePreview(ch), 300);
      } else {
        ViewChannels.renderGroups();
        ViewChannels.renderChannels();
      }
    } else {
      ViewChannels.renderGroups();
      ViewChannels.renderChannels();
    }

    if (list && list.type === 'xtream') {
      if (_prefetchTimer) clearTimeout(_prefetchTimer);
      _prefetchTimer = setTimeout(async () => {
        _prefetchTimer = null;
        if (Player.getMode() !== 'IDLE') return;
        if (document.hidden || !Router.isView('channels')) return;
        if (_prefetchController) _prefetchController.abort();
        _prefetchController = new AbortController();
        const signal = _prefetchController.signal;
        try {
          if (signal.aborted) return;

          const tasks = [];
          tasks.push(ensureTabData('vod', list, signal, null).catch(e => { if (e.name !== 'AbortError') console.error('Prefetch VOD error', e); }));
          tasks.push(ensureTabData('series', list, signal, null).catch(e => { if (e.name !== 'AbortError') console.error('Prefetch Series error', e); }));
          await Promise.all(tasks);
        } catch (e) {
          if (e.name !== 'AbortError') console.error('Prefetch error', e);
        } finally {
          _prefetchController = null;
        }
      }, DeviceProfile.prefetch.delayMs);
    }

    if (fromCache && _shouldCheckUpdate(list.id)) {
      if (_syncTimer) clearTimeout(_syncTimer);
      _syncTimer = setTimeout(() => {
        _syncTimer = null;
        _backgroundSync(list);
      }, 500);
    }
  }

  function _shouldCheckUpdate(listId) {
    const lastSync = localStorage.getItem(`sync_${listId}`) || 0;
    const hoursSince = (Date.now() - parseInt(lastSync)) / (1000 * 60 * 60);
    return hoursSince > 12;
  }

  async function _backgroundSync(list) {
    if (Player.getMode() !== 'IDLE') {
      if (_syncTimer) clearTimeout(_syncTimer);
      _syncTimer = setTimeout(() => { _syncTimer = null; _backgroundSync(list); }, 30000);
      return;
    }
    if (document.hidden || !Router.isView('channels')) return;
    const controller = new AbortController();
    try {
      const newChannels = (await ensureTabData('tv', list, controller.signal, () => {}, { forceReload: true })) || [];

      if (controller.signal.aborted) return;
      if (newChannels.length > 0) {
        Store.set('channels', newChannels);
        localStorage.setItem(`sync_${list.id}`, Date.now().toString());
        Playlist.clearGroupCache();
        Store.set('groups', Playlist.getGroups(newChannels, Store.get('currentCountry') || 'ALL', 'tv'));
        Store.set('groupCountsCache', null);
        if (Router.isView('channels')) {
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

  function _preconnect(url) {
    try {
      const origin = new URL(url).origin;
      if (!document.querySelector(`link[href="${origin}"]`)) {
        const link = document.createElement('link');
        link.rel = 'preconnect';
        link.href = origin;
        document.head.appendChild(link);
      }
    } catch {}
  }

  return { loadList, cancelLoad };
}
