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
  let _retryTimer      = null;   // retry cuando falla el stream
  let _errorTimer      = null;   // ocultar error / volver a vista
  let _wasPlayingOnHide = false;
  let _retryCount      = 0;      // declarado explícitamente (evita fuga al scope global)
  let _videoLayerEl    = null;   // referencia cacheada a #video-layer

  let _initialized = false;
  // ── INIT ─────────────────────────────────────────────
  function init(onChannelChange) {
    if (_initialized) return;
    _initialized = true;
    _onChannelChange = onChannelChange;
    _videoLayerEl = document.getElementById('video-layer'); // cache once
    _bindKeys();

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (_mode !== 'IDLE' && _current) {
          _wasPlayingOnHide = true;
          _safeStop(); // Liberar recursos de hardware
        }
      } else {
        if (_wasPlayingOnHide && _current) {
          _wasPlayingOnHide = false;
          // Restaurar reproducción en el modo en el que estaba
          if (_mode === 'FULLSCREEN') play(_current);
          else if (_mode === 'PIP') _startPip(_current);
        }
      }
    });
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

    Router.showView('player');
    if (_current && (_current.type === 'vod' || _current.type === 'series')) {
      if (typeof VodOSD !== 'undefined') VodOSD.show(_current);
    } else {
      if (typeof PlayerOSD !== 'undefined') PlayerOSD.show(_current);
    }
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

        // ── CONFIGURACIÓN SEGÚN MODO ──
        _applyDisplayRect();

        try {
          const name = (_current.name || '').toUpperCase();
          const is8K = name.includes('8K');
          const is4K = name.includes('4K') || name.includes('UHD') || name.includes('2160');
          const isHD = name.includes('FHD') || name.includes('HD') || name.includes('1080');
          const isHEVC = name.includes('HEVC') || name.includes('H265');
          const isRaw = name.includes('RAW') || name.includes('DIRECT');
          const isLive = _current.type !== 'vod' && _current.type !== 'series';

          // 1. Adaptive Info (afecta a conexiones HLS / .m3u8)
          const maxBr = is8K ? 150000000 : is4K ? 100000000 : isHD ? 50000000 : 25000000;
          const bufMs = is8K ? 12000 : is4K ? 10000 : isHD ? 6000 : 4000;
          webapis.avplay.setStreamingProperty('ADAPTIVE_INFO', `STARTBITRATE=HIGHEST|MAXBITRATE=${maxBr}|BUFFERLENGTH=${Math.round(bufMs / 1000)}`);

          // 2. Optimizaciones para señales en Vivo (MPEG-TS / Multicast)
          if (isLive) {
            try { webapis.avplay.setStreamingProperty("IS_LIVE", "true"); } catch(e) {}
          }

          // 3. Forzar plano de decodificación de hardware para Ultra Alta Definición 
          // (Evita que el sistema base de Tizen downscalee HEVC/RAW antes de mostrarlo)
          if (is4K || is8K || isHEVC || isRaw) {
            try { webapis.avplay.setStreamingProperty("SET_MIX_RESOLUTION", "4k"); } catch(e) {}
          }

          // 4. Aumentar timeout de buffering para codecs pesados que tardan más en dar el primer frame
          // También aumentamos el buffer inicial en conexiones inestables (PLAYER_SPROPERTY_SET_INITIAL_BUFFER)
          if (isRaw || isHEVC || is4K || is8K) {
            try { webapis.avplay.setTimeoutForBuffering(10000); } catch(e) {}
            try { webapis.avplay.setStreamingProperty("SET_INITIAL_BUFFER", "10000"); } catch(e) {}
          } else {
            try { webapis.avplay.setTimeoutForBuffering(5000); } catch(e) {}
            try { webapis.avplay.setStreamingProperty("SET_INITIAL_BUFFER", "5000"); } catch(e) {}
          }
        } catch(e) {}

          const handleStreamEnd = () => {
            if (_current && _current.type === 'series') {
               stop();
               if (typeof Router !== 'undefined') Router.showView('channels');
               if (typeof InfoPopup !== 'undefined' && InfoPopup.isSuspended()) {
                 InfoPopup.resume();
               }
            } else {
               setTimeout(() => { if (_current) play(_current); }, 1000);
            }
          };

          webapis.avplay.setListener({
            onbufferingstart:    () => _onBufferingStart(),
            onbufferingcomplete: () => _onBufferingComplete(),
            oncurrentplaytime:   () => {
              if (_state === 'BUFFERING') {
                _setState('PLAYING');
                _retryCount = 0;
              }
            },
            onevent:             (type) => {
              if (type === 'PLAYER_MSG_END_OF_STREAM') handleStreamEnd();
              if (type === 'PLAYER_MSG_BITRATE_CHANGE' || type === 'PLAYER_MSG_RESOLUTION_CHANGED') {
                if (_state === 'BUFFERING') _setState('PLAYING');
                // Tizen a veces no escala el video si la resolución cambia al vuelo (HLS)
                if (type === 'PLAYER_MSG_RESOLUTION_CHANGED') _applyDisplayRect();
              }
            },
            onerror:           (err) => _onError(err),
            ondrmevent:        () => {},
            onstreamcompleted: () => handleStreamEnd(),
          });

        webapis.avplay.prepareAsync(
          () => {
            try { 
              webapis.avplay.play(); 
              if (_current && (_current.type === 'vod' || _current.type === 'series')) {
                 const saved = Store.get('progress_' + _current.id);
                 if (saved && saved > 10000) {
                   setTimeout(() => {
                     try { webapis.avplay.jumpForward(saved); } catch(e){}
                   }, 200);
                 }
              }
            } catch(e) { _onError(e); }
          },
          (err) => _onError(err)
        );

      } catch(e) {
        console.error('AVPlay open error', e);
        _onError('OPEN_FAILED');
      }
    }, 150);
  }

  // Coordenadas fijas calculadas del CSS de .pip-box
  // .pip-box { bottom:40; right:40; width:480; height:270 } en viewport 1920x1080
  // No usamos getBoundingClientRect() porque puede fallar si la vista está oculta.
  const PIP_X = 1400, PIP_Y = 770, PIP_W = 480, PIP_H = 270;

  function _applyDisplayRect() {
    const vl = _videoLayerEl || document.getElementById('video-layer');
    if (_mode === 'FULLSCREEN') {
      if (vl) { vl.style.left='0px'; vl.style.top='0px'; vl.style.width='1920px'; vl.style.height='1080px'; }
      try { webapis.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX'); } catch(e) {}
      try { webapis.avplay.setDisplayRect(0, 0, 1920, 1080); } catch(e) {}
    } else if (_mode === 'PIP') {
      if (vl) { vl.style.left=PIP_X+'px'; vl.style.top=PIP_Y+'px'; vl.style.width=PIP_W+'px'; vl.style.height=PIP_H+'px'; }
      try { webapis.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN'); } catch(e) {}
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
    _applyDisplayRect();
  }

  // ── PREVIEW RÁPIDO AL NAVEGAR LA LISTA ───────────────
  // Llamado por app.js al mover el foco en la lista, con delay
  let _previewCh = null;
  function schedulePreview(ch) {
    if (!ch || !ch.url) return;
    if (ch.type === 'vod' || ch.type === 'series') {
      cancelPreview();
      return;
    }
    // Si ya estamos en PiP con el mismo canal, nada que hacer
    if (_mode === 'PIP' && _current && _current.id === ch.id) return;
    clearTimeout(_previewTimer);
    _previewTimer = setTimeout(() => {
      _startPip(ch);
    }, 700); // 700ms para que no cambie con cada tecla
  }

  function cancelPreview() {
    clearTimeout(_previewTimer);
  }

  function _startPip(ch) {
    if (!ch || !ch.url) return;
    if (typeof Router !== 'undefined' && !Router.isView('channels')) return;
    if (_mode === 'FULLSCREEN') return; // no interrumpir reproductor
    if (_current && _current.id === ch.id && _mode === 'PIP') return;

    _retryCount = 0;
    _safeStop();
    _current = ch;
    _mode = 'PIP';
    _setState('BUFFERING');
    _showPip(ch);

    const box = document.getElementById('pip-box');
    if (box) box.classList.add('pip-loading');

    // NO ponemos video-layer en 1920x1080 aquí; _applyDisplayRect lo ajustará

    setTimeout(() => {
      try {
        let url = ch.url;
        if (url.includes('|')) url = url.split('|')[0];
        webapis.avplay.open(url);
        _applyDisplayRect();
        try {
          webapis.avplay.setStreamingProperty('ADAPTIVE_INFO',
            'STARTBITRATE=LOWEST|MAXBITRATE=3000000|BUFFERLENGTH=3');
          webapis.avplay.setStreamingProperty("SET_INITIAL_BUFFER", "3000");
        } catch(e) {}
        webapis.avplay.setListener({
          onbufferingstart:    () => _setState('BUFFERING'),
          onbufferingcomplete: () => {
            _setState('PLAYING');
            _retryCount = 0;
            _applyDisplayRect(); // reconfirmar posición después de buffering
            document.getElementById('pip-box')?.classList.remove('pip-loading');
          },
          oncurrentplaytime: () => {
            if (_state === 'BUFFERING') {
              _setState('PLAYING');
              _retryCount = 0;
              document.getElementById('pip-box')?.classList.remove('pip-loading');
            }
          },
          onevent:  (type) => {
            if (type === 'PLAYER_MSG_BITRATE_CHANGE' || type === 'PLAYER_MSG_RESOLUTION_CHANGED') {
              if (_state === 'BUFFERING') {
                _setState('PLAYING');
                document.getElementById('pip-box')?.classList.remove('pip-loading');
              }
            }
          },
          onerror:  () => _hidePip(),
          ondrmevent: () => {},
          onstreamcompleted: () => {},
        });
        webapis.avplay.prepareAsync(
          () => { try { webapis.avplay.play(); } catch(e) {} },
          () => { _hidePip(); }
        );
      } catch(e) { _hidePip(); }
    }, 150);
  }

  // ── SAFE STOP ────────────────────────────────────────
  function _safeStop() {
    if (_retryTimer) {
      clearTimeout(_retryTimer);
      _retryTimer = null;
    }
    if (_errorTimer) {
      clearTimeout(_errorTimer);
      _errorTimer = null;
    }
    try {
      const vl = _videoLayerEl || document.getElementById('video-layer');
      if (vl) {
        vl.style.left   = '0px';
        vl.style.top    = '0px';
        vl.style.width  = '0px';
        vl.style.height = '0px';
      }
      const s = webapis.avplay.getState();
      if (s !== 'NONE' && s !== 'IDLE') webapis.avplay.stop();
      if (s !== 'NONE') webapis.avplay.close();
    } catch(e) {}
  }

  // ── EVENTS ───────────────────────────────────────────
  function _onBufferingStart()    { _setState('BUFFERING'); }
  function _onBufferingComplete() { _setState('PLAYING'); _retryCount = 0; }

  function _onError(err) {
    console.error('AVPlay error', err);
    _handleError();
  }

  function _handleError() {
    _safeStop();
    if (_retryTimer) clearTimeout(_retryTimer);
    if (_errorTimer) clearTimeout(_errorTimer);

    if (_isActive() && _current && _retryCount < 3) {
      _retryCount++;
      if (typeof Router !== 'undefined' && Router.showToast) {
        Router.showToast(`Error de conexión. Reconectando (${_retryCount}/3)...`, 'error');
      }
      _retryTimer = setTimeout(() => {
        _retryTimer = null;
        if (_isActive() && _current) play(_current);
      }, 2000);
      return;
    }

    _retryCount = 0;
    const errEl = document.getElementById('player-error');
    if (errEl) errEl.classList.remove('hidden');
    _errorTimer = setTimeout(() => {
      _errorTimer = null;
      if (errEl) errEl.classList.add('hidden');
      if (_isActive()) Router.showView('channels');
    }, 4000);
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
      if (_isActive()) { 
        if (_current && (_current.type === 'vod' || _current.type === 'series')) {
          if (typeof VodOSD !== 'undefined') {
            if (VodOSD.isVisible()) VodOSD.handleKey('ENTER');
            else VodOSD.show(_current);
          }
        } else {
          if (typeof PlayerOSD !== 'undefined') PlayerOSD.show(_current); 
        }
        return true; 
      } 
    });

    KeyHandler.on('LEFT', () => {
      if (_isActive()) { 
        if (_current && (_current.type === 'vod' || _current.type === 'series')) {
          if (typeof VodOSD !== 'undefined') {
            if (VodOSD.isVisible()) {
              if (!VodOSD.handleKey('LEFT')) _handleSeek('left');
            } else {
              VodOSD.show(_current);
              _handleSeek('left');
            }
          }
        } else {
          _handleSeek('left'); 
        }
        return true; 
      }
    });

    KeyHandler.on('RIGHT', () => {
      if (_isActive()) { 
        if (_current && (_current.type === 'vod' || _current.type === 'series')) {
          if (typeof VodOSD !== 'undefined') {
            if (VodOSD.isVisible()) {
              if (!VodOSD.handleKey('RIGHT')) _handleSeek('right');
            } else {
              VodOSD.show(_current);
              _handleSeek('right');
            }
          }
        } else {
          _handleSeek('right'); 
        }
        return true; 
      }
    });

    KeyHandler.on('UP', () => {
      if (_isActive()) {
        if (_current && (_current.type === 'vod' || _current.type === 'series')) {
          if (typeof VodOSD !== 'undefined') {
            if (VodOSD.isVisible()) VodOSD.handleKey('UP');
            else VodOSD.show(_current);
          }
        }
        return true;
      }
    });

    KeyHandler.on('DOWN', () => {
      if (_isActive()) {
        if (_current && (_current.type === 'vod' || _current.type === 'series')) {
          if (typeof VodOSD !== 'undefined') {
            if (VodOSD.isVisible()) VodOSD.handleKey('DOWN');
            else VodOSD.show(_current);
          }
        }
        return true;
      }
    });

    KeyHandler.on('BACK', () => {
      if (_isActive() && _current) {
        if (_current.type === 'vod' || _current.type === 'series') {
          if (typeof VodOSD !== 'undefined' && VodOSD.isVisible()) {
            if (VodOSD.handleKey('BACK')) return true;
          }
          stop();
          Router.showView('channels');
        } else {
          _mode = 'PIP';
          Router.showView('channels');
          _showPip(_current);
          _applyDisplayRect();
        }
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

    // Ejecutar el salto inmediatamente para ver el frame
    try {
      if (dir === 'right') {
        webapis.avplay.jumpForward(10000);
      } else {
        webapis.avplay.jumpBackward(10000);
      }
    } catch(e) {
      console.error('AVPlay jump error', e);
    }

    clearTimeout(_seekTimer);
    _seekTimer = setTimeout(() => {
      if (elLeft) elLeft.classList.add('hidden');
      if (elRight) elRight.classList.add('hidden');
      _seekAccumulator = 0;
    }, 600);
  }

  // ── UTILS ────────────────────────────────────────────
  function stop() { 
    if (_current && (_current.type === 'vod' || _current.type === 'series')) {
      const ms = getCurrentTime();
      if (ms > 10000) Store.set('progress_' + _current.id, ms);
    }
    _safeStop(); 
    _current = null;
    _mode = 'IDLE';
    _hidePip();
    if (_previewTimer) {
      clearTimeout(_previewTimer);
      _previewTimer = null;
    }
    if (_retryTimer) {
      clearTimeout(_retryTimer);
      _retryTimer = null;
    }
    if (_errorTimer) {
      clearTimeout(_errorTimer);
      _errorTimer = null;
    }
    if (typeof PlayerOSD !== 'undefined') PlayerOSD.hide();
    if (typeof VodOSD !== 'undefined') VodOSD.hide();
  }
  function getCurrentTime() {
    try { return webapis.avplay.getCurrentTime(); } catch(e) { return 0; }
  }
  function getDuration() {
    try { return webapis.avplay.getDuration(); } catch(e) { return 0; }
  }
  function togglePlayPause() {
    if (_state === 'PLAYING') {
      try { webapis.avplay.pause(); _setState('PAUSED'); } catch(e) {}
    } else if (_state === 'PAUSED') {
      try { webapis.avplay.play(); _setState('PLAYING'); } catch(e) {}
    }
  }
  function seek(seconds) {
    try {
      const ms = seconds * 1000;
      if (ms > 0) webapis.avplay.jumpForward(ms);
      else webapis.avplay.jumpBackward(Math.abs(ms));
    } catch(e) {}
  }
  function seekTo(ms) {
    try { webapis.avplay.seekTo(ms); } catch(e) {}
  }
  function getAudioTracks() {
    try {
      if (typeof webapis === 'undefined') return [];
      const tracks = webapis.avplay.getTotalTrackInfo();
      return tracks.filter(t => t.type === 'AUDIO');
    } catch(e) { return []; }
  }
  function setAudioTrack(index) {
    try { if (typeof webapis !== 'undefined') webapis.avplay.setSelectTrack('AUDIO', index); } catch(e) {}
  }
  function getCurrentAudioTrack() {
    try {
      if (typeof webapis === 'undefined') return null;
      const current = webapis.avplay.getCurrentStreamInfo() || [];
      return current.find(t => t.type === 'AUDIO');
    } catch(e) { return null; }
  }

  function getCurrent()   { return _current; }
  function getState()     { return _state; }
  function getMode()      { return _mode; }
  function reapplyPip()   { if (_mode === 'PIP') _applyDisplayRect(); }
  function _isActive()    { return document.getElementById('view-player')?.classList.contains('active'); }
  
  return { init, play, stop, getCurrent, getState, getMode, reapplyPip, shrinkToPip, expandToFullscreen, schedulePreview, cancelPreview, getCurrentTime, getDuration, togglePlayPause, seek, seekTo, getAudioTracks, setAudioTrack, getCurrentAudioTrack };
})();
