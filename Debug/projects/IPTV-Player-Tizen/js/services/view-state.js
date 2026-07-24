export function createViewState(deps) {
  function getFilterContext() {
    return {
      channels: deps.getCurrentData(),
      currentCountry: deps.getCurrentCountry(),
      currentGroup: deps.getCurrentGroup(),
      currentTab: deps.getCurrentTab(),
      currentListId: deps.getCurrentListId ? deps.getCurrentListId() : null,
      favIds: deps.getFavIds ? deps.getFavIds() : [],
      favSet: deps.getFavSet ? deps.getFavSet() : new Set(deps.getFavIds ? deps.getFavIds() : []),
    };
  }

  function resolveSyncContext(ch) {
    const currentTab = deps.getCurrentTab();
    const currentCountry = currentTab === 'vod' || currentTab === 'series' ? 'ALL' : (ch.countryCode || 'ALL');
    deps.setCurrentCountry(currentCountry);
    deps.setCountryFocusIdx((deps.getCountries() || ['ALL']).indexOf(currentCountry));
    if (deps.getCountryFocusIdx() < 0) deps.setCountryFocusIdx(0);
    deps.updateCountryClasses();

    const groups = deps.getGroupsForCountry(currentCountry);
    deps.setGroups(groups);

    let targetGroupId = deps.getCurrentGroup();
    let filtered = targetGroupId ? deps.filterGroup(targetGroupId) : [];
    if (!targetGroupId || filtered.findIndex(c => c.id === ch.id) === -1) {
      const groupObj = groups.find(g => g.id === ch.group) || groups.find(g => g.id === '__all__');
      targetGroupId = groupObj ? groupObj.id : '__all__';
      filtered = deps.filterGroup(targetGroupId);
    }

    deps.setCurrentGroup(targetGroupId);
    deps.setGroupIdx(Math.max(0, groups.findIndex(g => g.id === targetGroupId)));
    deps.setSidebarFocusIdx(deps.getGroupIdx() + 2);

    return { currentCountry, groups, targetGroupId, filtered };
  }

  function updateCountriesList() {
    const channels = deps.getCurrentData();
    const codesSet = new Set();
    for (const c of channels) if (c.countryCode) codesSet.add(c.countryCode);
    const codes = deps.sortCountryCodes(codesSet);

    deps.setAllCountries([...codes]);
    const visible = deps.getVisibleCountries();
    const filteredCodes = visible !== null ? codes.filter(code => visible.includes(code)) : codes;
    filteredCodes.unshift('ALL');
    deps.setCountries(filteredCodes);

    const currentCountry = deps.getCurrentCountry();
    if (currentCountry && !filteredCodes.includes(currentCountry)) {
      deps.setCurrentCountry('ALL');
      deps.setCountryFocusIdx(0);
      deps.onCountryInvalidated();
    } else {
      deps.setCountryFocusIdx(currentCountry ? filteredCodes.indexOf(currentCountry) : 0);
      if (deps.getCountryFocusIdx() < 0) deps.setCountryFocusIdx(0);
    }
  }

  function selectCountry(code, idx) {
    const prevCountry = deps.getCurrentCountry();
    deps.setCountryFocusIdx(idx);

    if (prevCountry === code) {
      deps.restoreGroupFocus();
      return;
    }

    deps.setCurrentCountry(code);
    deps.renderCountries();
    deps.updateCountryClasses();
    deps.clearGroupCache();
    deps.setGroups(deps.getGroupsForCountry(code));
    deps.setCurrentGroup('__all__');
    deps.setGroupIdx(0);
    deps.setSidebarFocusIdx(2);
    if (deps.refreshAll) deps.refreshAll();
    else {
      deps.refreshGroups();
      deps.refreshChannels();
    }
    deps.focusGroups();
  }

  function selectGroup(g, autoFocusChannels = true) {
    if (g.isFolder) {
      if (autoFocusChannels) deps.toggleExpandedFolder(g.id);
      deps.refreshGroups();
      deps.focusGroupById(g.id);
      deps.focusGroups();
      return;
    }

    const items = deps.filterGroup(g.id);
    if (deps.getCurrentGroup() === g.id) {
      deps.focusGroupById(g.id);
      deps.updateGroupClasses();
      if (autoFocusChannels && items.length > 0) {
        deps.focusChannels();
      } else {
        deps.focusGroups();
      }
      return;
    }

    deps.setCurrentGroup(g.id);
    deps.setGroupIdx(deps.findGroupIndex(g.id));
    deps.focusGroupById(g.id);
    deps.updateGroupClasses();
    deps.clearVirtualList();
    deps.refreshChannels();
    if (autoFocusChannels && items.length > 0) deps.focusChannels();
    else deps.focusGroups();
  }

  function renderData(data) {
    deps.hideLoader();
    deps.setCurrentData(data);
    deps.setGroups(deps.getGroupsForData(data));
    deps.setCurrentGroup(deps.getInitialGroup(data));
    deps.setGroupIdx(0);
    if (deps.refreshAll) deps.refreshAll();
    else {
      deps.refreshGroups();
      deps.refreshChannels();
    }
    deps.restoreFocusAfterRender();
  }

  function syncWithChannel(ch, options = {}) {
    const focusChannels = options.focusChannels !== false;
    if (!ch || deps.isSearchOpen()) return;
    updateCountriesList();
    deps.renderCountries();

    const { targetGroupId } = resolveSyncContext(ch);
    let filtered = deps.filterGroup(targetGroupId);

    let chIdx = filtered.findIndex(c => c.id === ch.id);
    if (chIdx < 0) {
      deps.setCurrentGroup('__all__');
      deps.setGroupIdx(0);
      deps.setSidebarFocusIdx(2);
      filtered = deps.filterGroup('__all__');
      chIdx = filtered.findIndex(c => c.id === ch.id);
    }
    if (deps.refreshAll) deps.refreshAll();
    else {
      deps.refreshGroups();
      deps.refreshChannels();
    }
    if (chIdx >= 0) deps.focusChannelIndex(chIdx);
    if (focusChannels) deps.focusChannels();
    else deps.focusGroups();
  }

  return { getFilterContext, resolveSyncContext, updateCountriesList, selectCountry, selectGroup, renderData, syncWithChannel };
}
