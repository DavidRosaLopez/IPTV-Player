/**
 * router.js — Visual View Routing and Overlays
 */
import { Player } from './player.js';
import { ViewChannels } from './view-channels.js';
import { ViewSetup } from './view-setup.js';


export const Router = (() => {
  let _toastTimer = null;

  let _currentView = 'setup';

  function showView(name) {
    const fromView = _currentView;
    _currentView = name;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById('view-' + name);
    if (el) el.classList.add('active');

    // Avisar a los controladores de vista si existen
    if (name === 'channels' && typeof ViewChannels !== 'undefined') {
      ViewChannels.onShow(fromView);
    }
    if (name === 'setup') {
      if (typeof Player !== 'undefined') Player.stop();
      if (typeof ViewSetup !== 'undefined') {
        ViewSetup.onShow();
      }
    }
  }


  function isView(name) {
    const el = document.getElementById('view-' + name);
    return el ? el.classList.contains('active') : false;
  }

  function showToast(msg, type = 'info') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = `toast ${type}`;
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.className = 'toast hidden', 3000);
  }

  function showLoading(msg = 'Cargando...') {
    const el = document.getElementById('loading');
    const msgEl = document.getElementById('loading-msg');
    if (el) el.classList.remove('hidden');
    if (msgEl) msgEl.textContent = msg;
  }

  function hideLoading() {
    const el = document.getElementById('loading');
    if (el) el.classList.add('hidden');
  }

  return { showView, isView, showToast, showLoading, hideLoading };
})();
