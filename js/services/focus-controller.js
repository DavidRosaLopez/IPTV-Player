export function createFocusController(deps) {
  let focusZone = 'channels';
  let sidebarFocusIdx = 2;
  let exitFocusIdx = 0;
  let prevFocusZone = 'channels';
  let prevFocusedEl = null;
  let tabFocusIdx = 0;
  let channelFocusToken = 0;

  function _clearPrevFocused() {
    if (prevFocusedEl) {
      prevFocusedEl.classList.remove('focused');
      prevFocusedEl = null;
    }
  }

  function _clearZoneFocus() {
    document
      .querySelectorAll('.sidebar-tab-btn.focused, .country-item.focused, .group-item.focused, .channel-card.focused')
      .forEach(el => el.classList.remove('focused'));
    _clearPrevFocused();
  }

  function setZone(zone, restoreActive = true) {
    const isEnteringGroups = zone === 'groups' && focusZone !== 'groups';
    focusZone = zone;
    channelFocusToken++;
    const viewEl = document.getElementById('view-channels');
    if (viewEl) viewEl.setAttribute('data-focus', zone);
    _clearZoneFocus();

    if (zone === 'groups') {
      const els = deps.getSidebarFocusables();
      if (isEnteringGroups && restoreActive) {
        const activeIdx = els.findIndex(el => el.classList.contains('active'));
        if (activeIdx !== -1) sidebarFocusIdx = activeIdx;
      }
      const next = els[sidebarFocusIdx];
      if (next) {
        next.classList.add('focused');
        next.scrollIntoView({ block: 'nearest', behavior: 'auto' });
        prevFocusedEl = next;
      }
    } else if (zone === 'countries') {
      deps.updateCountryClasses();
    } else if (zone === 'tabs') {
      const tabs = document.querySelectorAll('.sidebar-tab-btn');
      if (tabs[tabFocusIdx]) {
        tabs[tabFocusIdx].classList.add('focused');
        prevFocusedEl = tabs[tabFocusIdx];
      }
    } else if (zone === 'channels') {
      const token = channelFocusToken;
      deps.focusCurrentChannel();
      setTimeout(() => {
        if (token !== channelFocusToken || focusZone !== 'channels') return;
        const card = document.querySelector('.channel-card.focused') || document.querySelector('.channel-card');
        if (card) prevFocusedEl = card;
        deps.setChannelFocus(card);
      }, 50);
    }
  }

  function move(dir) {
    if (focusZone === 'tabs') {
      if (dir === 'left') {
        tabFocusIdx = Math.max(0, tabFocusIdx - 1);
        setZone('tabs');
      } else if (dir === 'right') {
        if (tabFocusIdx === deps.tabs.length - 1) setZone('channels');
        else {
          tabFocusIdx = Math.min(deps.tabs.length - 1, tabFocusIdx + 1);
          setZone('tabs');
        }
      } else if (dir === 'down') {
        if (deps.isVodOrSeries()) {
          sidebarFocusIdx = 2;
          setZone('groups');
        } else {
          setZone('countries');
        }
      } else if (dir === 'up') {
        sidebarFocusIdx = 0;
        setZone('groups', false);
      }
      return;
    }

    if (focusZone === 'countries') {
      const codes = deps.getCountries();
      if (dir === 'up') setZone('tabs');
      else if (dir === 'down') {
        sidebarFocusIdx = 2;
        setZone('groups');
      } else if (dir === 'left') {
        deps.setCountryFocus(Math.max(0, deps.getCountryFocus() - 1));
        deps.updateCountryClasses();
      } else if (dir === 'right') {
        deps.setCountryFocus(Math.min(codes.length - 1, deps.getCountryFocus() + 1));
        deps.updateCountryClasses();
      }
      return;
    }

    if (focusZone === 'groups') {
      const els = deps.getSidebarFocusables();
      if (!els.length) return;
      els[sidebarFocusIdx]?.classList.remove('focused');
      if (dir === 'left') {
        if (sidebarFocusIdx === 1) sidebarFocusIdx = 0;
      } else if (dir === 'right') {
        if (sidebarFocusIdx === 0) sidebarFocusIdx = 1;
        else { setZone('channels'); return; }
      } else if (dir === 'up') {
        if (sidebarFocusIdx === 2) {
          if (deps.isVodOrSeries()) setZone('tabs');
          else setZone('countries');
          return;
        } else if (sidebarFocusIdx > 2) {
          sidebarFocusIdx--;
        }
      } else if (dir === 'down') {
        if (sidebarFocusIdx === 0 || sidebarFocusIdx === 1) { setZone('tabs'); return; }
        sidebarFocusIdx = Math.min(els.length - 1, sidebarFocusIdx + 1);
      }
      const next = els[sidebarFocusIdx];
      if (next) {
        next.classList.add('focused');
        prevFocusedEl = next;
        next.scrollIntoView({ block: 'nearest', behavior: 'auto' });
        deps.previewGroup(next);
      }
      return;
    }

    if (dir === 'left' && deps.currentChannelColStart()) {
      setZone('groups');
      return;
    }
    deps.moveVirtualList(dir);
    deps.setChannelFocus(document.querySelector('.channel-card.focused'), true);
    deps.previewCurrentChannel();
  }

  function showExit() {
    prevFocusZone = focusZone;
    focusZone = 'exit';
    exitFocusIdx = 0;
    const el = document.getElementById('exit-popup');
    if (el) el.classList.remove('hidden');
    updateExit();
  }

  function hideExit() {
    focusZone = prevFocusZone;
    const el = document.getElementById('exit-popup');
    if (el) el.classList.add('hidden');
  }

  function moveExit(dir) {
    if (dir === 'left') exitFocusIdx = 0;
    else if (dir === 'right') exitFocusIdx = 1;
    updateExit();
  }

  function updateExit() {
    const cancel = document.getElementById('btn-exit-cancel');
    const confirm = document.getElementById('btn-exit-confirm');
    if (cancel) cancel.classList.toggle('focused', exitFocusIdx === 0);
    if (confirm) confirm.classList.toggle('focused', exitFocusIdx === 1);
  }

  return {
    getZone: () => focusZone,
    getSidebarFocusIdx: () => sidebarFocusIdx,
    setSidebarFocusIdx: (v) => { sidebarFocusIdx = v; },
    getTabFocusIdx: () => tabFocusIdx,
    setTabFocusIdx: (v) => { tabFocusIdx = v; },
    getExitFocusIdx: () => exitFocusIdx,
    setZone,
    move,
    showExit,
    hideExit,
    moveExit,
    updateExit,
  };
}
