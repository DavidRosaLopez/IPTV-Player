/**
 * app.js - Main Application Orchestrator
 */
import { Config } from './config.js';
import { Store } from './store.js';
import { Storage } from './storage.js';
import { KeyHandler } from './keyHandler.js';
import { Router } from './router.js';
import { Favorites } from './favorites.js';
import { Search } from './search.js';
import { Player } from './player.js';
import { ViewChannels } from './view-channels.js';
import { ViewSetup } from './view-setup.js';
import { eventBus } from './eventBus.js';
import { DeviceProfile } from './device-profile.js';
import { createListLoader } from './services/list-loader.js';

const loader = createListLoader();

export const App = (() => {
  let _clockTimer = null;
  let _eventsBound = false;

  function init() {
    const rootStyle = document.documentElement?.style;
    if (rootStyle) {
      rootStyle.setProperty('--screen-w', `${DeviceProfile.layoutResolution.width}px`);
      rootStyle.setProperty('--screen-h', `${DeviceProfile.layoutResolution.height}px`);
      rootStyle.setProperty('--panel-w', `${DeviceProfile.panelResolution.width}px`);
      rootStyle.setProperty('--panel-h', `${DeviceProfile.panelResolution.height}px`);
      rootStyle.setProperty('--panel-scale-x', `${DeviceProfile.panelScale.x}`);
      rootStyle.setProperty('--panel-scale-y', `${DeviceProfile.panelScale.y}`);
      rootStyle.setProperty('--pip-x', `${DeviceProfile.pip.x}px`);
      rootStyle.setProperty('--pip-y', `${DeviceProfile.pip.y}px`);
      rootStyle.setProperty('--pip-w', `${DeviceProfile.pip.width}px`);
      rootStyle.setProperty('--pip-h', `${DeviceProfile.pip.height}px`);
    }

    _bindAppEvents();
    KeyHandler.init();
    Favorites.init();

    document.getElementById('btn-cancel-load')?.addEventListener('click', () => loader.cancelLoad());

    let lists = Storage.getLists();
    if (!lists || lists.length === 0) {
      if (Config.defaultLists) {
        lists = Config.defaultLists;
        Storage.saveLists(lists);
      } else {
        lists = [];
      }
    }

    let defaultListId = Storage.getDefaultList();
    if (!defaultListId && lists.length > 0) {
      defaultListId = lists[0].id;
      Storage.setDefaultList(defaultListId);
    }

    let listToLoad = null;
    if (defaultListId) listToLoad = lists.find(l => l.id === defaultListId);
    if (!listToLoad && lists.length === 1) listToLoad = lists[0];

    _startClock();

    if (listToLoad) {
      loader.loadList(listToLoad);
      return;
    }

    Router.showView('setup');
  }

  function _bindAppEvents() {
    if (_eventsBound) return;
    _eventsBound = true;

    eventBus.on('list:load-requested', list => loader.loadList(list));
    eventBus.on('load:cancel-requested', () => loader.cancelLoad());
    eventBus.on('player:play-requested', ch => Player.play(ch));
    eventBus.on('player:stop-requested', () => Player.stop());
    eventBus.on('channels:refresh-requested', () => ViewChannels.refreshUI());
    eventBus.on('channels:render-groups-requested', () => ViewChannels.renderGroups());
    eventBus.on('view:shown', ({ name, fromView }) => {
      if (name === 'channels') {
        ViewChannels.onShow(fromView);
      } else if (name === 'setup') {
        Player.stop();
        ViewSetup.onShow();
      }
    });
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

  return { init, loadList: loader.loadList, cancelLoad: loader.cancelLoad };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}
