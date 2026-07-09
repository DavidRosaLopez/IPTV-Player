import { loadTabData } from './tab-data-loader.js';

const TAB_LABELS = {
  tv: 'TV',
  vod: 'Películas',
  series: 'Series'
};

const TAB_LOADING_MESSAGES = {
  tv: 'Cargando canales...',
  vod: 'Cargando películas...',
  series: 'Cargando series...'
};

const TAB_ERROR_MESSAGES = {
  tv: 'Error cargando canales',
  vod: 'Error cargando películas',
  series: 'Error cargando series'
};

function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

export function createTabViewController({ virtualList, showToast, getCurrentTab }) {
  let abortController = null;

  function activate(tabId) {
    document.querySelectorAll('.sidebar-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === tabId);
    });

    const groupNameEl = document.getElementById('current-group-name');
    if (groupNameEl) groupNameEl.textContent = TAB_LABELS[tabId] || TAB_LABELS.tv;
  }

  function showLoading(tabId) {
    const channelCount = document.getElementById('channel-count');
    if (channelCount) {
      channelCount.style.display = '';
      channelCount.textContent = 'Cargando...';
    }

    const groupList = document.getElementById('group-list');
    if (groupList) groupList.innerHTML = '';

    virtualList.update([]);

    const grid = document.getElementById('channel-grid');
    if (grid) {
      grid.classList.add('hidden');
    }

    const loader = document.getElementById('tab-loader');
    if (!loader) return;

    loader.classList.remove('hidden');
    const loaderMsg = document.getElementById('tab-loader-msg');
    if (loaderMsg) loaderMsg.textContent = TAB_LOADING_MESSAGES[tabId] || TAB_LOADING_MESSAGES.tv;
  }

  function abortPendingLoad() {
    if (!abortController) return;
    abortController.abort();
    abortController = null;
  }

  async function load(tabId, list) {
    abortPendingLoad();
    abortController = new AbortController();
    const signal = abortController.signal;

    showLoading(tabId);
    await nextFrame();
    if (getCurrentTab() !== tabId) return null;

    try {
      return await loadTabData(tabId, list, signal);
    } catch (e) {
      if (e.name === 'AbortError') return null;
      showToast(TAB_ERROR_MESSAGES[tabId] || TAB_ERROR_MESSAGES.tv, 'error');
      return [];
    }
  }

  return { activate, load, abortPendingLoad };
}
