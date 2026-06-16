/**
 * virtual-list.js — Virtual scroll renderer for channel grid
 * Only renders visible rows — handles 10,000+ channels smoothly
 */
const VirtualList = (() => {
  const COLS        = 3;
  const ITEM_H      = 74;   // px — card height + gap
  const ITEM_GAP    = 12;
  const PADDING     = 16;
  const BUFFER_ROWS = 4;    // extra rows above/below viewport

  let _container   = null;
  let _items       = [];
  let _onSelect    = null;
  let _getFavBadge = null;
  let _getEpgNow   = null;
  let _focusedIdx  = 0;
  let _scrollTop   = 0;
  let _rafId       = null;
  let _domCache    = {};    // index → DOM element
  let _colW        = 0;    // cacheado al inicializar, evita offsetWidth en cada tarjeta

  function init({ containerId, items, onSelect, getFavBadge, getEpgNow }) {
    _container   = document.getElementById(containerId);
    if (_container) _container.innerHTML = ''; // FIX OVERLAPPING
    _items       = items;
    _onSelect    = onSelect;
    _getFavBadge = getFavBadge;
    _getEpgNow   = getEpgNow;
    _focusedIdx  = 0;
    _scrollTop   = 0;
    _domCache    = {};
    // Cachear ancho de columna UNA sola vez (offsetWidth fuerza reflow)
    _colW = (_container.offsetWidth - PADDING * 2 - ITEM_GAP * (COLS - 1)) / COLS;
    _render();

    _container.addEventListener('scroll', _onScroll, { passive: true });
  }

  function update(items) {
    _items = items;
    _focusedIdx = 0;
    _scrollTop  = 0;
    _container.scrollTop = 0;
    _domCache   = {};
    _container.innerHTML = '';
    _render();
  }

  function setFocused(idx) {
    _unfocus(_focusedIdx);
    _focusedIdx = Math.max(0, Math.min(_items.length - 1, idx));
    _focus(_focusedIdx);
    _scrollToVisible(_focusedIdx);
  }

  function getFocused() { return _focusedIdx; }

  function move(dir) {
    let next = _focusedIdx;
    const col = _focusedIdx % COLS;
    if (dir === 'down')  next = Math.min(_items.length - 1, _focusedIdx + COLS);
    if (dir === 'up')    next = Math.max(0, _focusedIdx - COLS);
    if (dir === 'right' && col < COLS - 1) next = Math.min(_items.length - 1, _focusedIdx + 1);
    if (dir === 'left' && col > 0)  next = Math.max(0, _focusedIdx - 1);
    if (next !== _focusedIdx) setFocused(next);
  }

  function getItem(idx) { return _items[idx]; }
  function getCurrentItem() { return _items[_focusedIdx]; }

  // ── RENDER ───────────────────────────────────────────
  function _render() {
    if (!_container) return;
    const rowCount    = Math.ceil(_items.length / COLS);
    const totalH      = rowCount * (ITEM_H + ITEM_GAP) + PADDING * 2;

    // Sentinel div to maintain scroll height
    _container.style.position = 'relative';
    _container.style.height   = totalH + 'px';
    _container.style.overflow = 'hidden auto';

    _renderVisible();
  }

  function _renderVisible() {
    if (!_container) return;
    const vH          = _container.parentElement?.offsetHeight || 900;
    const scrollTop   = _container.scrollTop;
    const startRow    = Math.max(0, Math.floor(scrollTop / (ITEM_H + ITEM_GAP)) - BUFFER_ROWS);
    const endRow      = Math.min(Math.ceil(_items.length / COLS) - 1,
                          Math.ceil((scrollTop + vH) / (ITEM_H + ITEM_GAP)) + BUFFER_ROWS);

    const startIdx = startRow * COLS;
    const endIdx   = Math.min(_items.length - 1, (endRow + 1) * COLS - 1);

    // Remove out-of-view cached elements
    for (const key in _domCache) {
      const i = parseInt(key);
      if (i < startIdx || i > endIdx) {
        _domCache[key]?.remove();
        delete _domCache[key];
      }
    }

    // Create visible elements
    for (let i = startIdx; i <= endIdx; i++) {
      if (_domCache[i]) continue;
      const el = _createCard(i);
      _container.appendChild(el);
      _domCache[i] = el;
    }
  }

  function refreshVisible() {
    if (!_container) return;
    for (const key in _domCache) {
      const i = parseInt(key);
      const el = _domCache[key];
      const ch = _items[i];
      const isFav  = _getFavBadge ? _getFavBadge(ch.id) : false;
      const now    = _getEpgNow   ? _getEpgNow(ch.epgId) : null;

      el.innerHTML =
        (isFav ? '<span class="fav-badge material-symbols-rounded">favorite</span>' : '') +
        (ch.logo
          ? `<img class="channel-logo" src="${_safeStr(ch.logo)}" loading="lazy" decoding="async" onerror="this.style.display='none'">`
          : '') +
        `<div class="channel-info">` +
          `<div class="channel-name">${_safeStr(ch.name)}</div>` +
          (now ? `<div class="channel-prog">${_safeStr(now.title)}</div>` : '') +
        `</div>`;
    }
  }

  function _createCard(i) {
    const ch  = _items[i];
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const y   = PADDING + row * (ITEM_H + ITEM_GAP);

    const el = document.createElement('div');
    el.className   = 'channel-card' + (i === _focusedIdx ? ' focused' : '');
    el.style.cssText = `position:absolute;top:${y}px;left:${PADDING + col*(_colW+ITEM_GAP)}px;width:${_colW}px;height:${ITEM_H}px;`;
    el.dataset.idx = i;

    const isFav  = _getFavBadge ? _getFavBadge(ch.id) : false;
    const now    = _getEpgNow   ? _getEpgNow(ch.epgId) : null;

    // Use innerHTML once — fast
    el.innerHTML =
      (isFav ? '<span class="fav-badge material-symbols-rounded">favorite</span>' : '') +
      (ch.logo
        ? `<img class="channel-logo" src="${_safeStr(ch.logo)}" loading="lazy" decoding="async" onerror="this.style.display='none'">`
        : '') +
      `<div class="channel-info">` +
        `<div class="channel-name">${_safeStr(ch.name)}</div>` +
        (now ? `<div class="channel-prog">${_safeStr(now.title)}</div>` : '') +
      `</div>`;

    el.addEventListener('click', () => { setFocused(i); _onSelect && _onSelect(ch); });
    el.addEventListener('mouseenter', () => { setFocused(i); });
    return el;
  }

  function _focus(idx) {
    const el = _domCache[idx];
    if (el) el.classList.add('focused');
  }
  function _unfocus(idx) {
    const el = _domCache[idx];
    if (el) el.classList.remove('focused');
  }

  function _scrollToVisible(idx) {
    if (!_container) return;
    const row = Math.floor(idx / COLS);
    const y   = row * (ITEM_H + ITEM_GAP) + PADDING;
    const vH  = _container.parentElement?.offsetHeight || 900;
    const cur = _container.scrollTop;
    if (y < cur) _container.scrollTop = y - PADDING;
    else if (y + ITEM_H > cur + vH) _container.scrollTop = y + ITEM_H - vH + PADDING;
  }

  function _onScroll() {
    if (_rafId) return;
    _rafId = requestAnimationFrame(() => {
      _rafId = null;
      _renderVisible();
    });
  }

  function _safeStr(s) {
    return s ? String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
  }

  return { init, update, setFocused, getFocused, move, getItem, getCurrentItem, refreshVisible };
})();
