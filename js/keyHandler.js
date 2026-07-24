/**
 * keyHandler.js — Remote control key management
 * Samsung Tizen 9 / S91F
 */
import { DeviceProfile } from './device-profile.js';

export const KeyHandler = (() => {
  // Key codes
  const KEYS = {
    UP: 38, DOWN: 40, LEFT: 37, RIGHT: 39,
    ENTER: 13, LONG_OK: 9999, BACK: 10009, RETURN: 88,
    INFO: 457,
    RED: 403, GREEN: 405, YELLOW: 404, BLUE: 406,
    PLAY: 415, PAUSE: 19, PLAY_PAUSE: 10252, STOP: 413,
    REWIND: 412, FAST_FWD: 417,
    NUM_0: 48, NUM_9: 57,
    CH_UP: 427, CH_DOWN: 428,
  };

  let _listeners = {};
  let _initialized = false;

  function init() {
    if (_initialized) return;
    _initialized = true;

    // Register keys with Tizen
    if (window.tizen && tizen.tvinputdevice) {
      const toRegister = [
        'MediaPlay','MediaPause','MediaPlayPause','MediaStop',
        'MediaRewind','MediaFastForward',
        'ColorF0Red','ColorF1Green','ColorF2Yellow','ColorF3Blue',
        'Info','ChannelUp','ChannelDown',
        'Return','Exit','Enter','Up','Down','Left','Right'
      ];
      toRegister.forEach(k => {
        try { tizen.tvinputdevice.registerKey(k); } catch(e) {}
      });
    }

    document.addEventListener('keydown', _handleKeyDown);
    document.addEventListener('keyup', _handleKeyUp);
    document.addEventListener('iptv-back', () => _dispatch(KEYS.BACK, { preventDefault: () => {}, stopPropagation: () => {} }));
  }

  let _okTimeout = null;
  let _okLongPressed = false;

  let _lastNavTime = 0;
  const NAV_THROTTLE_MS = DeviceProfile.key.navThrottleMs;

  function _handleKeyDown(e) {
    const code = e.keyCode;
    const activeTag = document.activeElement ? document.activeElement.tagName : '';
    const isInput = activeTag === 'INPUT' || activeTag === 'TEXTAREA';

    // Throttle de teclas de navegación (evitar colapso de la CPU si se mantiene pulsado)
    if (!isInput && (code === KEYS.UP || code === KEYS.DOWN || code === KEYS.LEFT || code === KEYS.RIGHT || code === KEYS.CH_UP || code === KEYS.CH_DOWN)) {
      const now = Date.now();
      if (now - _lastNavTime < NAV_THROTTLE_MS) {
        e.preventDefault();
        e.stopPropagation();
        return; // Ignorar evento por ser demasiado rápido
      }
      _lastNavTime = now;
    }

    if (code === 13 && !isInput) {
      if (!_okTimeout) {
        _okLongPressed = false;
        _okTimeout = setTimeout(() => {
          _okLongPressed = true;
          _dispatch(KEYS.LONG_OK, { preventDefault: () => {}, stopPropagation: () => {} });
        }, DeviceProfile.key.longOkMs);
      }
      // NOTA: Tizen SÍ necesita que no hagamos preventDefault siempre en keydown, 
      // porque puede tragarse el evento completo. Lo quitamos.
      return; // No procesar el short-click todavía
    }

    _dispatch(code, e);
  }

  function _handleKeyUp(e) {
    if (e.keyCode === 13) {
      const activeTag = document.activeElement ? document.activeElement.tagName : '';
      const isInput = activeTag === 'INPUT' || activeTag === 'TEXTAREA';
      
      if (!isInput) {
        clearTimeout(_okTimeout);
        _okTimeout = null;
        if (!_okLongPressed) {
          // Fue pulsación corta
          _dispatch(13, e);
        }
        _okLongPressed = false;
      }
    }
  }

  function _dispatch(code, e) {
    let consumed = false;
    let actualCode = code;
    if (code === 88) actualCode = 10009; // Map RETURN (88) to BACK (10009)

    // Dispatch to registered listeners (most recently added first)
    const handlers = _listeners[actualCode] || [];
    for (let i = handlers.length - 1; i >= 0; i--) {
      const result = handlers[i](e);
      if (result === true) {
        consumed = true;
        break;
      }
    }

    // Only prevent default if a handler explicitly consumed the event,
    // OR if we are not focused on an input and the key is a UI navigation key
    // (to prevent unwanted scrolling or browser back behavior)
    if (consumed) {
      e.preventDefault();
      e.stopPropagation();
    } else {
      const activeTag = document.activeElement ? document.activeElement.tagName : '';
      const isInput = activeTag === 'INPUT' || activeTag === 'TEXTAREA';
      const isNavKey = [37, 38, 39, 40, 13, 10009, 88].includes(code);
      
      if (!isInput && isNavKey) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }

  function on(keyName, handler) {
    const code = KEYS[keyName];
    if (!code) return;
    if (!_listeners[code]) _listeners[code] = [];
    _listeners[code].push(handler);
  }

  function off(keyName, handler) {
    const code = KEYS[keyName];
    if (!code || !_listeners[code]) return;
    _listeners[code] = _listeners[code].filter(h => h !== handler);
  }

  // Focus management helpers
  let _focusedEl = null;

  function setFocus(el, skipScroll = false) {
    if (!el) return;
    if (_focusedEl) _focusedEl.classList.remove('focused');
    _focusedEl = el;
    el.classList.add('focused');
    if (!skipScroll) {
      el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    }
  }

  function getFocused() { return _focusedEl; }

  // Navigate within a list of elements
  function navigate(elements, currentIndex, direction) {
    if (!elements || elements.length === 0) return currentIndex;
    let next = currentIndex;
    if (direction === 'up' || direction === 'left')  next = Math.max(0, currentIndex - 1);
    if (direction === 'down' || direction === 'right') next = Math.min(elements.length - 1, currentIndex + 1);
    return next;
  }

  return { init, on, off, setFocus, getFocused, navigate, KEYS };
})();
