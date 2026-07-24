import { Store } from '../store.js';
import { KeyHandler } from '../keyHandler.js';
import { Router } from '../router.js';
import { Search } from '../search.js';
import { Favorites } from '../favorites.js';
import { VirtualList } from '../virtual-list.js';
import { InfoPopup } from '../info-popup.js';

export function createChannelsInputController(deps) {
  let keysBound = false;
  let suppressNextTabClick = false;

  function isInputActive() {
    return document.activeElement && document.activeElement.tagName === 'INPUT';
  }

  function handleArrow(key, dir) {
    KeyHandler.on(key, () => {
      if (InfoPopup.isVisible()) return InfoPopup.handleKey(key);
      if (!Router.isView('channels')) return;
      if (isInputActive()) return false;
      if (deps.getFocusZone() === 'exit') {
        if (dir === 'left' || dir === 'right') {
          deps.moveExit(dir);
          return true;
        }
        return;
      }
      deps.moveActive(dir);
      return true;
    });
  }

  function init() {
    if (keysBound) return;
    keysBound = true;

    handleArrow('LEFT', 'left');
    handleArrow('RIGHT', 'right');
    handleArrow('UP', 'up');

    KeyHandler.on('DOWN', () => {
      if (InfoPopup.isVisible()) return InfoPopup.handleKey('DOWN');
      if (!Router.isView('channels') || deps.getFocusZone() === 'exit') return;
      if (isInputActive()) {
        document.activeElement.blur();
        deps.setFocusZone('channels');
        return true;
      }
      deps.moveActive('down');
      return true;
    });

    KeyHandler.on('ENTER', () => {
      if (InfoPopup.isVisible()) return InfoPopup.handleKey('ENTER');
      if (!Router.isView('channels')) return;

      const focusZone = deps.getFocusZone();
      if (focusZone === 'tabs') return enterTabs();
      if (focusZone === 'countries') return enterCountries();
      if (focusZone === 'groups') return enterGroups();
      if (focusZone === 'channels') return enterChannels();
      if (focusZone === 'exit') return enterExit();
    });

    KeyHandler.on('LONG_OK', () => {
      if (InfoPopup.isVisible()) return true;
      if (Router.isView('channels') && deps.getFocusZone() === 'channels') {
        const ch = VirtualList.getCurrentItem();
        if (ch) {
          Favorites.toggle(ch.id);
          deps.updateGroupCounts();
          if (deps.getCurrentGroup() === '__favs__') deps.renderChannels();
          else VirtualList.refreshFavoriteBadges();
        }
      }
      return true;
    });

    KeyHandler.on('BACK', () => {
      if (InfoPopup.isVisible()) return InfoPopup.handleKey('BACK');
      if (!Router.isView('channels')) return;
      if (Search.isOpen()) {
        Search.close();
        return true;
      }
      if (deps.getFocusZone() === 'exit') {
        deps.hideExitPopup();
        return true;
      }
      handleBack();
      return true;
    });

    document.querySelectorAll('.sidebar-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => handleTabClick(btn));
    });

    document.getElementById('btn-open-search')?.addEventListener('click', () => Search.open());
    document.getElementById('btn-open-setup')?.addEventListener('click', () => Router.showView('setup'));
  }

  function enterTabs() {
    suppressNextTabClick = true;
    const tabs = document.querySelectorAll('.sidebar-tab-btn');
    const tab = tabs[deps.getTabFocusIdx()];
    if (!tab) return true;
    activateTab(tab.dataset.type);
    return true;
  }

  function enterCountries() {
    const codes = Store.get('countries') || ['ALL'];
    const idx = deps.getCountryFocusIdx();
    const code = codes[idx];
    if (code) deps.selectCountry(code, idx);
    return true;
  }

  function enterGroups() {
    const els = deps.getSidebarFocusables();
    const el = els[deps.getSidebarFocusIdx()];
    if (!el) return;
    if (el.id === 'btn-open-search') {
      Search.open();
    } else if (el.id === 'btn-open-setup') {
      Router.showView('setup');
    } else {
      const groupId = el.dataset.groupId;
      const groups = Store.get('groups');
      const group = groups.find(g => g.id === groupId);
      if (group) deps.selectGroup(group, true);
    }
    return true;
  }

  function enterChannels() {
    if (isInputActive()) return false;
    const ch = VirtualList.getCurrentItem();
    if (ch) deps.playChannel(ch);
    return true;
  }

  function enterExit() {
    if (deps.getExitFocusIdx() === 0) {
      deps.hideExitPopup();
    } else {
      try { tizen?.application?.getCurrentApplication()?.exit(); } catch(e) {}
    }
    return true;
  }

  function handleBack() {
    const domZone = deps.getVisibleFocusZone();
    const currentTab = deps.getCurrentTab();
    const targetZone = (() => {
      if (domZone === 'channels') return 'groups';
      if (domZone === 'groups') return currentTab === 'tv' ? 'countries' : 'tabs';
      if (domZone === 'countries') return 'tabs';
      if (domZone === 'tabs') return null;
      return null;
    })();

    if (targetZone === 'tabs') {
      deps.setTabFocusIdx(deps.getTabs().indexOf(currentTab));
      deps.renderCountries();
    } else if (targetZone === 'countries') {
      const codes = Store.get('countries') || ['ALL'];
      deps.setCountryFocusIdx(Math.max(0, codes.indexOf(deps.getCurrentCountry())));
      deps.renderCountries();
    }

    if (targetZone) deps.setFocusZone(targetZone);
    else deps.showExitPopup();
  }

  function handleTabClick(btn) {
    if (suppressNextTabClick) {
      suppressNextTabClick = false;
      return;
    }
    deps.setTabFocusIdx(deps.getTabs().indexOf(btn.dataset.type));
    deps.setFocusZone('tabs');
    activateTab(btn.dataset.type);
  }

  function activateTab(tabId) {
    if (tabId === deps.getCurrentTab()) {
      if (tabId === 'tv') {
        deps.setFocusZone('countries');
      } else {
        deps.setSidebarFocusIdx(2);
        deps.setFocusZone('groups');
      }
      return;
    }

    deps.setPendingFocusAfterRender(tabId === 'tv' ? 'countries' : 'groups');
    deps.switchTab(tabId);
  }

  return { init };
}
