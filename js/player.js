/**
 * player.js — AVPlay wrapper optimized for RAW/HD/UHD/4K/8K
 * Samsung Tizen 9 / S91F OLED
 *
 * Arquitectura:
 *  - view-player activa cuando se reproduce en pantalla completa
 *  - setPreviewMode() encoge el video al preview-box de la vista channels
 *  - Dimensiones y Hz se detectan automáticamente al arrancar
 */
const Player = (() => {
  let _current         = null;
  let _onChannelChange = null;
  let _state           = 'IDLE'; // IDLE | BUFFERING | PLAYING | ERROR
  let _mode            = 'IDLE'; // IDLE | FULLSCREEN | PIP
  let _previewTimer    = null;   // delay para preview al navegar

  let _initialized = false;
  // ── INIT ─────────────────────────────────────────────
  function init(onChannelChange) {
    if (_initialized) return;
    _initialized = true;
    _onChannelChange = onChannelChange;
    _bindKeys();
  }

  // ── PLAY (pantalla completa) ──────────────────────────
  function play(ch) {
    if (!ch || !ch.url) return;
    if (_current && _current.id !== ch.id) _retryCount = 0;
    clearTimeout(_previewTimer);
    
    _safeStop();
    _current = ch;
    _mode = 'FULLSCREEN';
    _setState('BUFFERING');
    _hidePip();

    App.showView('player');
    showOSD();

    const vl = document.getElementById('video-layer');
    if (vl) {
      vl.style.width  = '100%';
      vl.style.height = '100%';
    }
    const errEl = document.getElementById('player-error');
    if (errEl) errEl.classList.add('hidden');

    // Retraso para que Tizen libere el pipeline anterior
    setTimeout(() => {
      try {
        let playUrl = _current.url;
        if (playUrl.includes('|')) playUrl = playUrl.split('|')[0];

        webapis.avplay.open(playUrl);
        try { webapis.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_CUSTOM'); } catch(e) {}
        try { webapis.avplay.setDisplayRect(0, 0, 1920, 1080); } catch(e) {}

        // ── CONFIGURACIÓN SEGÚN MODO ──
        _applyDisplayRect(false); // Configurar coords nativas, pero con DOM oculto

          webapis.avplay.setStreamingProperty('ADAPTIVE_INFO', 'STARTBITRATE=HIGHEST|BUFFERLENGTH=2');

        webapis.avplay.setListener({
          onbufferingstart:    () => _onBufferingStart(),
          onbufferingcomplete: () => _onBufferingComplete(),
          oncurrentplaytime:   ()  => _updateProgress(),
          onevent:             (type) => {
            if (type === 'PLAYER_MSG_END_OF_STREAM')
              setTimeout(() => { if (_current) play(_current); }, 1000);
          },
          onerror:           (err) => _onError(err),
          ondrmevent:        () => {},
          onstreamcompleted: () => {
            setTimeout(() => { if (_current) play(_current); }, 1000);
          },
        });

        webapis.avplay.prepareAsync(
          () => {
            try { webapis.avplay.play(); } catch(e) { _onError(e); }
          },
          (err) => _onError(err)
        );

      } catch(e) {
        console.error('AVPlay open error', e);
        _onError('OPEN_FAILED');
      }
    }, 50);
  }

  // Coordenadas fijas calculadas del CSS de .pip-box
  // .pip-box { bottom:40; right:40; width:480; height:270 } en viewport 1920x1080
  // No usamos getBoundingClientRect() porque puede fallar si la vista está oculta.
  const PIP_X = 1400, PIP_Y = 770, PIP_W = 480, PIP_H = 270;

  function _applyDisplayRect(makeVisible = false) {
    const vl = document.getElementById('video-layer');
    if (_mode === 'FULLSCREEN') {
      if (vl) { 
        vl.style.left='0px'; vl.style.top='0px'; vl.style.width='1920px'; vl.style.height='1080px'; 
        vl.style.visibility = makeVisible ? 'visible' : 'hidden';
      }
      try { webapis.avplay.setDisplayRect(0, 0, 1920, 1080); } catch(e) {}
    } else if (_mode === 'PIP') {
      const pipBox = document.getElementById('pip-box');
      if (vl) { 
        vl.style.left=PIP_X+'px'; vl.style.top=PIP_Y+'px'; vl.style.width=PIP_W+'px'; vl.style.height=PIP_H+'px'; 
        vl.style.visibility = makeVisible ? 'visible' : 'hidden';
      }
      if (pipBox) pipBox.style.background = makeVisible ? 'transparent' : '#000';
      try { webapis.avplay.setDisplayRect(PIP_X, PIP_Y, PIP_W, PIP_H); } catch(e) {}
    }
  }

  function _showPip(ch) {
    const box = document.getElementById('pip-box');
    const nameEl = document.getElementById('pip-name');
    if (!box) return;
    if (nameEl) nameEl.textContent = ch.name || '';
    box.classList.remove('hidden');
  }

  function _hidePip() {
    document.getElementById('pip-box')?.classList.add('hidden');
  }

  // ── MODO PIP (volver desde pantalla completa a lista) ─
  function shrinkToPip() {
    if (!_current || _mode === 'PIP') return;
    _mode = 'PIP';
    _showPip(_current);
    _applyDisplayRect();
  }

  // ── EXPANDIR PIP A PANTALLA COMPLETA ─────────────────
  function expandToFullscreen() {
    if (!_current || _mode === 'FULLSCREEN') return;
    cancelPreview();
    _mode = 'FULLSCREEN';
    _hidePip();
    _applyDisplayRect(true);
  }

  // ── PREVIEW RÁPIDO AL NAVEGAR LA LISTA ───────────────
  // Llamado por app.js al mover el foco en la lista, con delay
  let _previewCh = null;
  function schedulePreview(ch) {
    if (!ch || !ch.url) return;
    // Si ya estamos en PiP con el mismo canal, nada que hacer
    if (_mode === 'PIP' && _current && _current.id === ch.id) return;
    clearTimeout(_previewTimer);
    _previewTimer = setTimeout(() => {
      _startPip(ch);
    }, 200); // Reducido a 200ms para máxima rapidez
  }

  function cancelPreview() {
    clearTimeout(_previewTimer);
    _safeStop();
    const pipBox = document.getElementById('pip-box');
    if (pipBox) pipBox.style.background = '#000'; // Inmediatamente volver a negro absoluto
  }

  function _startPip(ch) {
    if (!ch || !ch.url) return;
    if (_mode === 'FULLSCREEN') return; // no interrumpir reproductor
    if (_current && _current.id === ch.id && _mode === 'PIP') return;

    _retryCount = 0;
    _safeStop();
    _current = ch;
    _mode = 'PIP';
    _setState('BUFFERING');
    _showPip(ch);
    // Ya no oscurecemos el pip-box (pip-loading) para una navegación más limpia

    // NO ponemos video-layer en 1920x1080 aquí; _applyDisplayRect lo ajustará

    setTimeout(() => {
      try {
        let url = ch.url;
        if (url.includes('|')) url = url.split('|')[0];
        webapis.avplay.open(url);
        try { webapis.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_CUSTOM'); } catch(e) {}
        try { webapis.avplay.setDisplayRect(PIP_X, PIP_Y, PIP_W, PIP_H); } catch(e) {}
        
        _applyDisplayRect(false); // Configurar coords nativas ocultas
        
        try {
          // Para el PiP usamos un buffer muy corto para que empiece casi al instante
          webapis.avplay.setStreamingProperty('ADAPTIVE_INFO', `STARTBITRATE=HIGHEST|BUFFERLENGTH=1`);
        } catch(e) {}

        webapis.avplay.setListener({
          onbufferingstart:    () => _setState('BUFFERING'),
          onbufferingcomplete: () => {
            _setState('PLAYING');
            _retryCount = 0;
            _applyDisplayRect(true); // Mostrar vídeo!
          },
          oncurrentplaytime: () => {},
          onevent:  () => {},
          onerror:  () => { _safeStop(); _hidePip(); },
          ondrmevent: () => {},
          onstreamcompleted: () => {},
        });
        webapis.avplay.prepareAsync(
          () => { try { webapis.avplay.play(); } catch(e) {} },
          () => { _safeStop(); _hidePip(); }
        );
      } catch(e) { _safeStop(); _hidePip(); }
    }, 50);
  }

  // ── SAFE STOP ────────────────────────────────────────
  function _safeStop() {
    try {
      const vl = document.getElementById('video-layer');
      if (vl) {
        vl.style.left   = '0px';
        vl.style.top    = '0px';
        vl.style.width  = '0px';
        vl.style.height = '0px';
        vl.style.visibility = 'hidden';
      }
      const s = webapis.avplay.getState();
      if (s !== 'NONE' && s !== 'IDLE') webapis.avplay.stop();
      if (s !== 'NONE') webapis.avplay.close();
    } catch(e) {}
  }

  // ── EVENTS ───────────────────────────────────────────
  function _onBufferingStart()    { _setState('BUFFERING'); }
  function _onBufferingComplete() { _setState('PLAYING'); _retryCount = 0; _applyDisplayRect(true); }

  function _onError(err) {
    console.error('AVPlay error', err);
    _handleError();
  }

  function _handleError() {
    _safeStop();

    if (_isActive() && _current && _retryCount < 3) {
      _retryCount++;
      if (typeof App !== 'undefined' && App.showToast) {
        App.showToast(`Error de conexión. Reconectando (${_retryCount}/3)...`, 'error');
      }
      setTimeout(() => {
        if (_isActive() && _current) play(_current);
      }, 2000);
      return;
    }

    _retryCount = 0;
    
    // Solo mostramos la tarjeta de error gigante si estamos a pantalla completa
    if (_isActive()) {
      const errEl = document.getElementById('player-error');
      if (errEl) errEl.classList.remove('hidden');
      setTimeout(() => { 
        if (errEl) errEl.classList.add('hidden');
        if (_isActive()) App.showView('channels');
      }, 4000);
    }
  }

  function _setState(s) {
    _state = s;
    const spinner = document.getElementById('buffer-spinner');
    if (spinner) spinner.classList.toggle('hidden', s !== 'BUFFERING');
  }



  // ── KEY BINDINGS ─────────────────────────────────────
  function _bindKeys() {
    KeyHandler.on('CH_UP',   () => { if (_isActive()) { _onChannelChange?.('prev'); return true; } });
    KeyHandler.on('CH_DOWN', () => { if (_isActive()) { _onChannelChange?.('next'); return true; } });

    KeyHandler.on('ENTER', () => { 
      if (_isActive()) { showOSD(); return true; } 
    });

    KeyHandler.on('LEFT', () => {
      if (_isActive()) { _handleSeek('left'); return true; }
    });

    KeyHandler.on('RIGHT', () => {
      if (_isActive()) { _handleSeek('right'); return true; }
    });

    KeyHandler.on('BACK', () => {
      if (_isActive() && _current) {
        _mode = 'PIP';
        App.showView('channels');
        _showPip(_current);
        _applyDisplayRect(true); // coords fijas → no necesita esperar al DOM
        return true;
      }
    });

    KeyHandler.on('PLAY_PAUSE', () => {
      if (_isActive()) {
        try {
          const s = webapis.avplay.getState();
          if (s === 'PLAYING') webapis.avplay.pause();
          else webapis.avplay.play();
        } catch(e) {}
        return true;
      }
    });
  }

  // ── SEEK LOGIC ───────────────────────────────────────
  let _seekTimer = null;
  let _seekAccumulator = 0;
  let _seekLastTime = 0;

  function _handleSeek(dir) {
    if (!_current) return;
    const now = Date.now();
    if (now - _seekLastTime > 600) {
      _seekAccumulator = 0;
    }
    _seekLastTime = now;

    if (dir === 'left')  _seekAccumulator -= 10;
    if (dir === 'right') _seekAccumulator += 10;

    const elLeft = document.getElementById('seek-feedback-left');
    const elRight = document.getElementById('seek-feedback-right');
    
    if (elLeft) elLeft.classList.add('hidden');
    if (elRight) elRight.classList.add('hidden');

    const el = _seekAccumulator < 0 ? elLeft : elRight;
    const icon = _seekAccumulator < 0 ? 'fast_rewind' : 'fast_forward';
    const text = Math.abs(_seekAccumulator) + 's';

    if (el) {
      el.innerHTML = `<span class="material-symbols-rounded">${icon}</span><span class="seek-time">${text}</span>`;
      el.classList.remove('hidden');
      
      // Reset animation to replay it
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = null;
    }

    clearTimeout(_seekTimer);
    _seekTimer = setTimeout(() => {
      if (elLeft) elLeft.classList.add('hidden');
      if (elRight) elRight.classList.add('hidden');
      
      if (_seekAccumulator !== 0) {
        try {
          const jumpMs = _seekAccumulator * 1000;
          if (jumpMs > 0) {
            webapis.avplay.jumpForward(jumpMs);
          } else {
            webapis.avplay.jumpBackward(Math.abs(jumpMs));
          }
        } catch(e) {
          console.error('AVPlay jump error', e);
        }
      }
      _seekAccumulator = 0;
    }, 600);
  }

  // ── OSD ──────────────────────────────────────────────
  let _osdTimer = null;
  let _osdPollInterval = null;

  function showOSD() {
    if (!_current) return;
    const osd = document.getElementById('player-osd');
    if (!osd) return;

    const logo = document.getElementById('osd-logo');
    if (logo) {
      if (_current.logo) { logo.src = _current.logo; logo.style.display = 'block'; }
      else { logo.style.display = 'none'; }
    }

    const num = document.getElementById('osd-num');
    if (num) {
      const idx = (typeof VirtualList !== 'undefined') ? VirtualList.getFocused() + 1 : _current.num;
      if (idx) { num.textContent = idx; num.style.display = 'inline-block'; }
      else { num.style.display = 'none'; }
    }

    const name = document.getElementById('osd-name');
    if (name) name.textContent = _current.name || '';

    const favIcon = document.getElementById('osd-fav-icon');
    if (favIcon) {
      if (typeof Favorites !== 'undefined' && Favorites.isFav(_current.id)) {
        favIcon.classList.remove('hidden');
      } else {
        favIcon.classList.add('hidden');
      }
    }

    osd.classList.remove('hidden');
    clearTimeout(_osdTimer);

    _osdTimer = setTimeout(() => {
      osd.classList.add('hidden');
    }, 3000);
  }

  async function _fetchShortEpg(ch) {
    if (!ch) return;
    if (!ch.shortEpgUrl) {
      ch._shortEpgFetched = true;
      if (_current && _current.id === ch.id && !_osdTimer?.hidden) _updateEpgOSD();
      return;
    }
    
    try {
      const res = await fetch(ch.shortEpgUrl);
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.epg_listings && data.epg_listings.length > 0) {
        const now = Date.now();
        let nowP = null;
        let nextP = null;

        for (const item of data.epg_listings) {
          let startMs, endMs;
          if (item.start_timestamp && item.stop_timestamp) {
            startMs = parseInt(item.start_timestamp) * 1000;
            endMs = parseInt(item.stop_timestamp) * 1000;
          } else {
            startMs = new Date(item.start.replace(' ', 'T')).getTime();
            endMs = new Date(item.end.replace(' ', 'T')).getTime();
          }

          if (startMs <= now && endMs >= now) {
            nowP = { title: _b64DecodeUnicode(item.title), start: new Date(startMs), end: new Date(endMs) };
          } else if (startMs > now && !nextP) {
            nextP = { title: _b64DecodeUnicode(item.title), start: new Date(startMs), end: new Date(endMs) };
          }
        }
        
        if (nowP) {
          ch._shortEpgData = { nowP, nextP };
        }
      }
    } catch (e) {} finally {
      ch._shortEpgFetched = true;
      if (_current && _current.id === ch.id) {
        const osd = document.getElementById('player-osd');
        if (osd && !osd.classList.contains('hidden')) _updateEpgOSD();
      }
    }
  }

  function _b64DecodeUnicode(str) {
    try {
      return decodeURIComponent(atob(str).split('').map(function(c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
    } catch (e) { return atob(str); }
  }

  function _fmt(d) { return d?.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) || ''; }

  // ── UTILS ────────────────────────────────────────────
  function stop() { 
    _safeStop(); 
    _current = null;
    _mode = 'IDLE';
    _hidePip();
    clearTimeout(_previewTimer);
    clearTimeout(_osdTimer);
    clearInterval(_osdPollInterval);
  }
  function getCurrent()   { return _current; }
  function getState()     { return _state; }
  function getMode()      { return _mode; }
  function reapplyPip()   { if (_mode === 'PIP') _applyDisplayRect(); }
  function _isActive()    { return document.getElementById('view-player')?.classList.contains('active'); }
  return { init, play, stop, getCurrent, getState, getMode, reapplyPip, shrinkToPip, expandToFullscreen, schedulePreview, cancelPreview };
})();
