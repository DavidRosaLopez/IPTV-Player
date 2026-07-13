/**
 * virtual-list.js — Virtual scroll renderer for channel grid
 * Only renders visible rows — handles 10,000+ channels smoothly
 * Performance: pre-cached sub-element references on card creation.
 */
import { DeviceProfile } from './device-profile.js';

export const VirtualList = (() => {
  let COLS        = 3;
  let ITEM_H      = 74;   // px — card height + gap
  let ITEM_GAP    = 12;
  let PADDING     = 16;
  let BUFFER_ROWS = 4;    // extra rows above/below viewport
  let _layout     = 'tv';

  let _container   = null;
  let _items       = [];
  let _onSelect    = null;
  let _getFavBadge = null;
  let _focusedIdx  = 0;
  let _scrollTop   = 0;
  let _rafId       = null;
  let _domCache    = {};    // index → DOM element
  let _pool        = [];    // recycled DOM elements
  let _colW        = 0;    // cacheado al inicializar, evita offsetWidth en cada tarjeta
  let _vH          = 900;   // cacheado de offsetHeight
  let _eventsBound = false;
  let _scrolling   = false;
  let _scrollSettleRaf = null;
  let _lastScrollAt = 0;
  let _logoResumeTimer = null;
  let _suppressLogosUntil = 0;

  const ImageQueue = (() => {
    const queue = [];
    const activeRequests = new Set();
    let active = 0;
    let generation = 0;
    const MAX = DeviceProfile.virtualList.imageConcurrency;
    const process = () => {
      while(active < MAX && queue.length > 0) {
        let bestIdx = 0;
        for (let i = 1; i < queue.length; i++) {
          if (queue[i].priority > queue[bestIdx].priority) bestIdx = i;
        }
        const { imgEl, src, gen } = queue.splice(bestIdx, 1)[0];
        if (gen !== generation || imgEl.dataset.targetSrc !== src) continue;
        active++;
        
        const loader = new Image();
        const request = { loader };
        activeRequests.add(request);
        const finish = () => {
          if (!activeRequests.delete(request)) return;
          active--;
          process();
        };
        
        loader.onload = () => {
          if (gen === generation && imgEl.dataset.targetSrc === src) {
            imgEl.src = src;
            imgEl.style.display = '';
            const el = imgEl.closest ? imgEl.closest('.channel-card') : null;
            if (el) _hideMediaFallback(el);
          }
          finish();
        };
        loader.onerror = () => {
          if (gen === generation && imgEl.dataset.targetSrc === src) {
            imgEl.dataset.targetSrc = ''; // Allow retry later
            _showMediaFallback(imgEl);
          }
          finish();
        };
        loader.src = src;
      }
    };
    return {
      add: (imgEl, src, priority = 0) => {
        if (imgEl.dataset.targetSrc === src && Number(imgEl.dataset.logoPriority || 0) >= priority) return;
        
        imgEl.dataset.targetSrc = src;
        imgEl.dataset.logoPriority = String(priority);
        if (imgEl.src && !imgEl.src.startsWith('data:')) {
          imgEl.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        }
        for (let i = queue.length - 1; i >= 0; i--) {
          if (queue[i].imgEl === imgEl) queue.splice(i, 1);
        }
        queue.push({ imgEl, src, priority, gen: generation });
        process();
      },
      // Discard pending requests so new icons aren't queued behind stale ones.
      flush: () => {
        queue.length = 0;
        generation++;
        for (const request of Array.from(activeRequests)) {
          activeRequests.delete(request);
          request.loader.onload = null;
          request.loader.onerror = null;
          try { request.loader.src = ''; } catch(e) {}
          active--;
        }
        if (active < 0) active = 0;
      }
    };
  })();

  function init({ containerId, items, onSelect, getFavBadge, layout = 'tv' }) {
    _layout = layout;
    if (_layout === 'poster') {
      COLS = 5;
      ITEM_H = 460;
      ITEM_GAP = 20;
    } else {
      COLS = 3;
      ITEM_H = 74;
      ITEM_GAP = 12;
    }

    _container   = document.getElementById(containerId);
    if (_container) _container.innerHTML = ''; // FIX OVERLAPPING
    _items       = items;
    _onSelect    = onSelect;
    _getFavBadge = getFavBadge;
    _focusedIdx  = 0;
    _scrollTop   = 0;
    _domCache    = {};
    _pool        = [];
    ImageQueue.flush(); // Discard stale requests from previous list
    // Cachear propiedades geométricas UNA sola vez (fuerzan reflow)
    if (_container) {
      _colW = (_container.offsetWidth - PADDING * 2 - ITEM_GAP * (COLS - 1)) / COLS;
      _vH   = _container.offsetHeight || 900;
    }
    _render();

    if (!_eventsBound) {
      _eventsBound = true;
      _container.addEventListener('scroll', _onScroll, { passive: true });
      _container.addEventListener('click', (e) => {
        const card = e.target.closest('.channel-card');
        if (!card) return;
        const i = parseInt(card.dataset.idx);
        setFocused(i);
        if (_onSelect) _onSelect(_items[i]);
      });
      _container.addEventListener('mouseover', (e) => {
        const card = e.target.closest('.channel-card');
        if (!card) return;
        const i = parseInt(card.dataset.idx);
        if (i !== _focusedIdx) setFocused(i);
      });
    }
  }

  let _sentinel = null;

  function update(items) {
    ImageQueue.flush(); // Discard stale requests from previous country/group
    _items = items;
    _focusedIdx = 0;
    _scrollTop  = 0;
    _container.scrollTop = 0;
    _domCache   = {};
    _container.innerHTML = '';
    _pool = [];
    _sentinel = null;
    _render();
  }

  function setFocused(idx) {
    if (_focusedIdx >= 0) _unfocus(_focusedIdx);
    if (idx < 0) {
      _focusedIdx = -1;
      return;
    }
    _focusedIdx = Math.max(0, Math.min(_items.length - 1, idx));
    _focus(_focusedIdx);
    _scrollToVisible(_focusedIdx);
  }

  function getFocused() { return _focusedIdx; }

  function move(dir) {
    _suspendLogoLoading(DeviceProfile.virtualList.logoPauseAfterNavMs);
    let next = _focusedIdx;
    const col = _focusedIdx % COLS;
    if (dir === 'down')  next = Math.min(_items.length - 1, _focusedIdx + COLS);
    if (dir === 'up')    next = Math.max(0, _focusedIdx - COLS);
    if (dir === 'right' && col < COLS - 1) next = Math.min(_items.length - 1, _focusedIdx + 1);
    if (dir === 'left' && col > 0)  next = Math.max(0, _focusedIdx - 1);
    if (next !== _focusedIdx) setFocused(next);
  }

  function getItem(idx) { return _items[idx]; }
  function getItems() { return _items; }
  function getCurrentItem() { return _items[_focusedIdx]; }
  function getFocusedElement() { return _domCache[_focusedIdx] || null; }
  function _ensureRefs(el) {
    if (el._favBadge && el._img && el._fallback && el._name) return el;
    el._favBadge = el._favBadge || el.querySelector('.fav-badge');
    el._img = el._img || el.querySelector('.channel-logo');
    el._fallback = el._fallback || el.querySelector('.channel-logo-fallback');
    if (!el._fallback) {
      el._fallback = document.createElement('span');
      el._fallback.className = 'channel-logo-fallback material-symbols-rounded';
      el._fallback.style.display = 'none';
      el._fallback.textContent = 'tv';
      el.insertBefore(el._fallback, el.querySelector('.channel-info'));
    }
    el._name = el._name || el.querySelector('.channel-name');
    return el;
  }

  function _getLogoPriority(idx) {
    if (idx === _focusedIdx) return 3;
    const row = Math.floor(idx / COLS);
    const y = PADDING + row * (ITEM_H + ITEM_GAP);
    if (y + ITEM_H >= _scrollTop && y <= _scrollTop + _vH) return 2;
    return 1;
  }

  function _queueLogo(img, src, idx) {
    ImageQueue.add(img, src, _getLogoPriority(idx));
  }

  function _setFallbackIcon(el) {
    const fallback = _ensureRefs(el)._fallback;
    if (!fallback) return;
    if (el.dataset.mediaType === 'series') fallback.textContent = 'live_tv';
    else fallback.textContent = _layout === 'poster' ? 'movie' : 'tv';
  }

  function _showMediaFallback(img) {
    const el = img && img.closest ? img.closest('.channel-card') : null;
    if (!el) return;
    _setFallbackIcon(el);
    img.dataset.targetSrc = '';
    img.dataset.logoPriority = '';
    img.removeAttribute('src');
    img.src = '';
    img.style.display = 'none';
    const fallback = _ensureRefs(el)._fallback;
    if (fallback) fallback.style.display = 'flex';
  }

  function _hideMediaFallback(el) {
    const fallback = _ensureRefs(el)._fallback;
    if (fallback) fallback.style.display = 'none';
  }

  function _showLoadingFallback(el) {
    _setFallbackIcon(el);
    const img = _ensureRefs(el)._img;
    if (img) {
      img.removeAttribute('src');
      img.style.display = 'none';
    }
    const fallback = _ensureRefs(el)._fallback;
    if (fallback) fallback.style.display = 'flex';
  }

  function _shouldDeferLogos() {
    return _scrolling || performance.now() < _suppressLogosUntil;
  }

  function _suspendLogoLoading(ms) {
    if (!ms) return;
    _suppressLogosUntil = performance.now() + ms;
    ImageQueue.flush();
    if (_logoResumeTimer) clearTimeout(_logoResumeTimer);
    _logoResumeTimer = setTimeout(() => {
      _logoResumeTimer = null;
      if (!_scrolling) _updateVisibleLogos();
    }, ms + 20);
  }

  // ── RENDER ───────────────────────────────────────────
  function _render() {
    if (!_container) return;
    const rowCount    = Math.ceil(_items.length / COLS);
    const totalH      = rowCount * (ITEM_H + ITEM_GAP) + PADDING * 2;

    // Sentinel div to maintain scroll height without breaking flexbox
    _container.style.position = 'relative';
    _container.style.overflow = 'hidden auto';
    _container.style.height   = ''; 

    if (!_sentinel) {
      _sentinel = document.createElement('div');
      _sentinel.style.width = '1px';
      _container.appendChild(_sentinel);
    }
    _sentinel.style.height = totalH + 'px';

    _renderVisible();
  }

  function _renderVisible() {
    if (!_container) return;
    // Usamos las variables cacheadas _vH y _scrollTop para no forzar reflows
    const startRow    = Math.max(0, Math.floor(_scrollTop / (ITEM_H + ITEM_GAP)) - BUFFER_ROWS);
    const endRow      = Math.min(Math.ceil(_items.length / COLS) - 1,
                          Math.ceil((_scrollTop + _vH) / (ITEM_H + ITEM_GAP)) + BUFFER_ROWS);

    const startIdx = startRow * COLS;
    const endIdx   = Math.min(_items.length - 1, (endRow + 1) * COLS - 1);

    // Remove out-of-view cached elements and recycle them
    for (const key in _domCache) {
      const i = parseInt(key);
      if (i < startIdx || i > endIdx) {
        const el = _domCache[key];
        el.remove();
        if (_pool.length < 30) {
          _pool.push(el);
        }
        delete _domCache[key];
      }
    }

    // Create or reuse visible elements
    let fragment = null;

    for (let i = startIdx; i <= endIdx; i++) {
      if (_domCache[i]) continue;
      
      if (!fragment) fragment = document.createDocumentFragment();

      let el;
      if (_pool.length > 0) {
        el = _pool.pop();
        _ensureRefs(el);
        // Clear stale targetSrc so ImageQueue doesn't skip re-loading on reuse
        const recycledImg = el._img;
        if (recycledImg) {
          recycledImg.dataset.targetSrc = '';
          recycledImg.dataset.logoPriority = '';
        }
      } else {
        el = document.createElement('div');
        // Pre-build structure ONLY once per new node
        el.innerHTML = '<span class="fav-badge material-symbols-rounded" style="display:none">favorite</span><img class="channel-logo" style="display:none" loading="lazy" decoding="async"><span class="channel-logo-fallback material-symbols-rounded" style="display:none">tv</span><div class="channel-info"><div class="channel-name"></div></div>';
        _ensureRefs(el);
      }
      _updateCard(el, i);
      fragment.appendChild(el);
      _domCache[i] = el;
    }

    if (fragment) {
      _container.appendChild(fragment);
    }
  }

  function refreshVisible() {
    if (!_container) return;
    for (const key in _domCache) {
      const i = parseInt(key);
      const el = _domCache[key];
      const ch = _items[i];
      const isFav  = _getFavBadge ? _getFavBadge(ch.id) : false;

      // Use cached refs — no querySelector needed
      const fav = _ensureRefs(el)._favBadge;
      if (fav) fav.style.display = isFav ? '' : 'none';

      const img = el._img;
      if (img) {
        if (ch.logo) {
          const src = _safeStr(ch.logo);
          // Route through ImageQueue so broken/stale images are retried properly
          if (img.dataset.targetSrc !== src) _queueLogo(img, src, i);
          if (img.getAttribute('src') !== src) _showLoadingFallback(el);
          else img.style.display = '';
        } else {
          img.removeAttribute('src');
          img.dataset.targetSrc = '';
          img.dataset.logoPriority = '';
          img.style.display = 'none';
          _showMediaFallback(img);
        }
      }

      const name = el._name;
      if (name) name.textContent = ch.name || '';
    }
  }

  function _updateCard(el, i) {
    const ch  = _items[i];
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const y   = PADDING + row * (ITEM_H + ITEM_GAP);
    const x   = PADDING + col * (_colW + ITEM_GAP);

    el.className   = 'channel-card' + (_layout === 'poster' ? ' poster' : '') + (i === _focusedIdx ? ' focused' : '');
    el.style.cssText = `position:absolute;top:0;left:0;transform:translate3d(${x}px,${y}px,0);width:${_colW}px;height:${ITEM_H}px;`;
    el.dataset.idx = i;
    el.dataset.mediaType = ch.type || (_layout === 'poster' ? 'vod' : 'tv');

    const isFav  = _getFavBadge ? _getFavBadge(ch.id) : false;

    // Use cached refs — fall back to querySelector for recycled pool elements that may lack refs
    const fav = _ensureRefs(el)._favBadge;
    if (fav) fav.style.display = isFav ? '' : 'none';

    const img = el._img;
    if (img) {
      _setFallbackIcon(el);
      if (ch.logo) {
        if (_shouldDeferLogos()) {
          // Mientras hace scroll, usar una imagen transparente para evitar congestión de red
          // Limpiar targetSrc para que _updateVisibleLogos lo re-encole al parar el scroll
          img.dataset.targetSrc = '';
          img.dataset.logoPriority = '';
          _showLoadingFallback(el);
        } else {
          // Solo actualizar src si cambia para evitar parpadeos de red
          if (img.getAttribute('src') !== ch.logo) {
            _queueLogo(img, _safeStr(ch.logo), i);
          }
          if (img.getAttribute('src') !== _safeStr(ch.logo)) _showLoadingFallback(el);
          else img.style.display = '';
        }
      } else {
        img.removeAttribute('src');
        img.dataset.targetSrc = '';
        img.dataset.logoPriority = '';
        img.style.display = 'none';
        _showMediaFallback(img);
      }
    }

    const name = el._name;
    if (name) name.textContent = ch.name || '';

    return el;
  }

  function _focus(idx) {
    const el = _domCache[idx];
    if (!el) return;
    el.classList.add('focused');
    const ch = _items[idx];
    const img = el._img;
    if (!_shouldDeferLogos() && img && ch && ch.logo && img.getAttribute('src') !== ch.logo) {
      _queueLogo(img, _safeStr(ch.logo), idx);
    }
  }
  function _unfocus(idx) {
    const el = _domCache[idx];
    if (el) el.classList.remove('focused');
  }

  function _scrollToVisible(idx) {
    if (!_container) return;
    const row = Math.floor(idx / COLS);
    const y   = row * (ITEM_H + ITEM_GAP) + PADDING;
    // Usar la posición cacheada evita leer .scrollTop y forzar un reflow síncrono por cada pulsación
    if (y < _scrollTop) {
      _scrollTop = y - PADDING;
      _container.scrollTop = _scrollTop;
    }
    else if (y + ITEM_H > _scrollTop + _vH) {
      _scrollTop = y + ITEM_H - _vH + PADDING;
      _container.scrollTop = _scrollTop;
    }
  }

  function _onScroll() {
    _scrollTop = _container.scrollTop; // Actualizar el caché real cuando ocurre el evento
    _lastScrollAt = performance.now();
    if (!_scrolling) ImageQueue.flush();
    _scrolling = true;

    if (!_rafId) {
      _rafId = requestAnimationFrame(() => {
        _rafId = null;
        _renderVisible();
      });
    }

    if (_scrollSettleRaf) return;
    const checkSettled = () => {
      const elapsed = performance.now() - _lastScrollAt;
      if (elapsed < 120) {
        _scrollSettleRaf = requestAnimationFrame(checkSettled);
        return;
      }
      _scrollSettleRaf = null;
      _scrolling = false;
      _updateVisibleLogos();
    };
    _scrollSettleRaf = requestAnimationFrame(checkSettled);
  }

  function _updateVisibleLogos() {
    for (const key in _domCache) {
      const i = parseInt(key);
      const el = _domCache[key];
      const ch = _items[i];
      if (!ch) continue;
      const img = el._img;
      if (img && ch.logo) {
        const src = _safeStr(ch.logo);
        if (img.getAttribute('src') !== src && img.dataset.targetSrc !== src) {
          _queueLogo(img, src, i);
          img.style.display = '';
        }
      }
    }
  }

  function _safeStr(s) {
    return s ? String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
  }

  return { init, update, setFocused, getFocused, move, getItem, getItems, getCurrentItem, getFocusedElement, refreshVisible };
})();
