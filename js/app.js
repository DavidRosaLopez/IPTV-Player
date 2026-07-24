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
import { Platform } from './platform.js';
import { createListLoader } from './services/list-loader.js';

const loader = createListLoader();

export const App = (() => {
  let _clockTimer = null;
  let _eventsBound = false;
  let _layoutBound = false;
  let _displayMetrics = null;

  function _syncLayoutVars() {
    const rootStyle = document.documentElement?.style;
    if (!rootStyle) return;

    const designWidth = DeviceProfile.layoutResolution.width;
    const designHeight = DeviceProfile.layoutResolution.height;
    const metrics = Platform.isWindows ? (_displayMetrics || window.__IPTV_WINDOW_METRICS__ || {}) : {};
    const workArea = metrics.workArea || {};
    const workAreaSize = metrics.workAreaSize || {};
    const width = Platform.isWindows
      ? (window.innerWidth || workAreaSize.width || workArea.width || designWidth)
      : designWidth;
    const height = Platform.isWindows
      ? (window.innerHeight || workAreaSize.height || workArea.height || designHeight)
      : designHeight;
    const screenScaleX = width / designWidth;
    const screenScaleY = height / designHeight;
    const panelWidth = Platform.isWindows ? width : DeviceProfile.panelResolution.width;
    const panelHeight = Platform.isWindows ? height : DeviceProfile.panelResolution.height;
    const panelScaleX = Platform.isWindows ? screenScaleX : DeviceProfile.panelScale.x;
    const panelScaleY = Platform.isWindows ? screenScaleY : DeviceProfile.panelScale.y;
    const scale = Platform.isWindows ? Math.min(width / designWidth, height / designHeight) : 1;

    rootStyle.setProperty('--screen-w', `${width}px`);
    rootStyle.setProperty('--screen-h', `${height}px`);
    rootStyle.setProperty('--design-w', `${designWidth}px`);
    rootStyle.setProperty('--design-h', `${designHeight}px`);
    rootStyle.setProperty('--window-scale', `${scale}`);
    rootStyle.setProperty('--panel-w', `${panelWidth}px`);
    rootStyle.setProperty('--panel-h', `${panelHeight}px`);
    rootStyle.setProperty('--panel-scale-x', `${panelScaleX}`);
    rootStyle.setProperty('--panel-scale-y', `${panelScaleY}`);
    rootStyle.setProperty('--pip-x', `${Math.round(DeviceProfile.pip.x * screenScaleX)}px`);
    rootStyle.setProperty('--pip-y', `${Math.round(DeviceProfile.pip.y * screenScaleY)}px`);
    rootStyle.setProperty('--pip-w', `${Math.round(DeviceProfile.pip.width * screenScaleX)}px`);
    rootStyle.setProperty('--pip-h', `${Math.round(DeviceProfile.pip.height * screenScaleY)}px`);
  }

  function _setDisplayMetrics(metrics) {
    if (!metrics) return;
    _displayMetrics = metrics;
    _syncLayoutVars();
  }

  function _bindLayoutEvents() {
    if (_layoutBound) return;
    _layoutBound = true;
    window.addEventListener('resize', _syncLayoutVars);
    window.addEventListener('orientationchange', _syncLayoutVars);
    window.__IPTV_DESKTOP__?.onMetricsChanged?.((metrics) => _setDisplayMetrics(metrics));
  }

  function init() {
    const rootStyle = document.documentElement?.style;
    document.documentElement?.classList.add(`platform-${Platform.name}`);
    document.body?.classList.add(`platform-${Platform.name}`);
    if (document.body) document.body.dataset.platform = Platform.name;
    _setDisplayMetrics(window.__IPTV_WINDOW_METRICS__ || null);
    _syncLayoutVars();
    _bindLayoutEvents();

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
