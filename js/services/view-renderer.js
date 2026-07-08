function _getGroupIcon(g) {
  if (g?.icon) return g.icon;
  const match = String(g?.name || '').match(/<span[^>]*material-symbols-rounded[^>]*>([^<]+)<\/span>/);
  return match ? match[1].trim() : null;
}

function _getGroupLabel(g) {
  return String(g?.name || '').replace(/<span[^>]*>.*?<\/span>\s*/g, '');
}

function _setGroupContent(li, g, count = null, folderExpanded = null) {
  li.replaceChildren();
  const label = document.createElement('span');
  const icon = _getGroupIcon(g);
  if (icon) {
    const iconEl = document.createElement('span');
    iconEl.className = 'material-symbols-rounded';
    iconEl.textContent = icon;
    label.appendChild(iconEl);
    label.appendChild(document.createTextNode(' '));
  }
  label.appendChild(document.createTextNode(_getGroupLabel(g)));
  li.appendChild(label);

  if (folderExpanded !== null) {
    const folderIcon = document.createElement('span');
    folderIcon.className = 'material-symbols-rounded folder-icon';
    folderIcon.textContent = folderExpanded ? 'expand_less' : 'expand_more';
    li.appendChild(folderIcon);
  } else if (count !== null) {
    const countEl = document.createElement('span');
    countEl.className = 'group-count';
    countEl.textContent = count;
    li.appendChild(countEl);
  }
}

export function renderCountryItems({ container, codes, currentCountry, focusedIdx, onSelect }) {
  if (!container) return;
  container.innerHTML = '';
  codes.forEach((code, i) => {
    const info = code === 'ALL' ? { emoji: '🌎', name: 'Todos' } : code;
    const el = document.createElement('div');
    el.className = 'country-item' + (i === focusedIdx ? ' focused' : '') + (code === currentCountry ? ' active' : '');
    el.textContent = typeof info === 'string' ? info : `${info.emoji} ${info.name}`;
    el.addEventListener('click', () => onSelect(code, i));
    container.appendChild(el);
  });
}

export function renderGroupList({
  list,
  groups,
  counts,
  currentGroup,
  groupIdx,
  focusZone,
  expandedFolders,
  onFolderClick,
  onGroupClick,
}) {
  if (!list) return;
  const existingItems = Array.from(list.children);
  const existingMap = new Map();
  for (const li of existingItems) {
    if (li.dataset.groupId) existingMap.set(li.dataset.groupId, li);
  }

  const newIds = new Set();
  const fragment = document.createDocumentFragment();
  groups.forEach((g, i) => {
    newIds.add(g.id);
    let li = existingMap.get(g.id);
    if (g.isFolder) {
      if (!li) {
        li = document.createElement('li');
        li.dataset.groupId = g.id;
        li.addEventListener('click', () => onFolderClick(g, i));
      }
      li.className = 'group-item folder-item' + (i === groupIdx && focusZone === 'groups' ? ' focused' : '');
      li.dataset.idx = i;
      _setGroupContent(li, g, null, Boolean(expandedFolders[g.id]));
      fragment.appendChild(li);
      return;
    }

    const isChild = Boolean(g.parentId);
    const isHidden = isChild && !expandedFolders[g.parentId];
    if (!li) {
      li = document.createElement('li');
      li.dataset.groupId = g.id;
      li.addEventListener('click', () => onGroupClick(g, li));
    }
    li.className = 'group-item' +
      (isChild ? ' group-child' : '') +
      (isHidden ? ' hidden' : '') +
      (i === groupIdx && focusZone === 'groups' ? ' focused' : '') +
      (g.id === currentGroup ? ' active' : '');
    li.dataset.idx = i;
    _setGroupContent(li, g, counts[g.id] || 0);
    fragment.appendChild(li);
  });

  for (const [id, li] of existingMap) {
    if (!newIds.has(id)) li.remove();
  }
  list.appendChild(fragment);
}

export function renderChannelList({ items, layout, containerId, onSelect, getFavBadge }) {
  const container = document.getElementById(containerId);
  if (!container) return;
  // VirtualList owns DOM updates after this init/update call.
  return { container, items, layout, onSelect, getFavBadge };
}

export function getGroupLabel(g) {
  return _getGroupLabel(g);
}

export function setChannelHeader({ currentGroup, currentTab, count }) {
  const groupNameEl = document.getElementById('current-group-name');
  if (groupNameEl) {
    if (!currentGroup) {
      groupNameEl.textContent = currentTab === 'tv' ? 'TV' : (currentTab === 'vod' ? 'Películas' : 'Series');
    } else if (currentGroup === '__all__') {
      groupNameEl.textContent = currentTab === 'tv' ? 'Canales' : (currentTab === 'vod' ? 'Películas' : 'Series');
    } else if (currentGroup === '__favs__') {
      groupNameEl.textContent = 'Favoritos';
    } else {
      groupNameEl.textContent = 'Canales';
    }
  }

  const cnt = document.getElementById('channel-count');
  if (cnt) {
    if (!currentGroup) {
      cnt.textContent = '';
      cnt.style.display = 'none';
    } else {
      cnt.style.display = '';
      cnt.textContent = `${count}${currentTab === 'tv' ? ' canales' : (currentTab === 'vod' ? ' películas' : ' series')}`;
    }
  }
}
