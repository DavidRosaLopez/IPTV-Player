  /**
   * player.js â€” AVPlay wrapper optimized for RAW/HD/UHD/4K/8K
   * Samsung 83" SF93 OLED
   *
   * Arquitectura:
   *  - view-player activa cuando se reproduce en pantalla completa
   *  - setPreviewMode() encoge el video al preview-box de la vista channels
   *  - Dimensiones y Hz se detectan automÃ¡ticamente al arrancar
   */
  import { Store } from './store.js';
  import { Storage } from './storage.js';
  import { KeyHandler } from './keyHandler.js';
  import { Router } from './router.js';
  import { PlayerOSD } from './player-osd.js';
  import { VodOSD } from './vod-osd.js';
  import { Watching } from './watching.js';
  import { eventBus } from './eventBus.js';
  import { DeviceProfile, getDisplayRect } from './device-profile.js';


  export const Player = (() => {
    let _current = null;
    let _onChannelChange = null;
    let _state = 'IDLE'; // IDLE | BUFFERING | PLAYING | ERROR
    let _mode = 'IDLE'; // IDLE | FULLSCREEN | PIP
    const _timers = {
      preview: null,
      retry: null,
      error: null,
      playDelay: null,
      pipDelay: null,
      liveRestart: null,
      resumeSeek: null,
      seek: null
    };
    let _wasPlayingOnHide = false;
    let _retryCount = 0;      // declarado explÃ­citamente (evita fuga al scope global)
    let _videoLayerEl = null;   // referencia cacheada a #video-layer
    let _progressSaveTimer = null; // guardado periÃ³dico de progreso (series/vod)
    let _playSeq = 0;
    let _pipSeq = 0;

    let _initialized = false;
    function _setTimer(name, fn, delay) {
      _clearTimer(name);
      _timers[name] = setTimeout(() => {
        _timers[name] = null;
        fn();
      }, delay);
    }

    function _clearTimer(name) {
      const timer = _timers[name];
      if (!timer) return;
      clearTimeout(timer);
      _timers[name] = null;
    }

    function _clearTimers(names) {
      names.forEach(_clearTimer);
    }

    function _getStreamMode(ch = _current) {
      const name = String(ch?.name || '').toUpperCase();
      const meta = ch?.streamMeta || {};
      const quality = String(meta.quality || '').toLowerCase();
      const codec = String(meta.codec || '').toLowerCase();
      return {
        is8K: quality === '8k' || meta.height >= 4320 || /(8K|4320)/.test(name),
        is4K: quality === 'uhd' || meta.height >= 2160 || /(4K|UHD|2160|3840)/.test(name),
        isHD: quality === 'fhd' || quality === 'hd' || meta.height >= 720 || /(FHD|HD|1080|720)/.test(name),
        isHEVC: codec === 'hevc' || /(HEVC|H\.?265|H265|X265)/.test(name),
        isRaw: meta.isRaw || /(RAW|DIRECT|REMUX|BLURAY|BDREMUX|LOSSLESS)/.test(name),
        isLive: !!ch && ch.type !== 'vod' && ch.type !== 'series'
      };
    }

    function _applyPlaybackTuning(ch, pipMode = false) {
      const mode = _getStreamMode(ch);
      const limits = DeviceProfile.player.liveMaxBitrate;
      const maxBr = mode.is8K ? limits.uhd8k : mode.is4K ? limits.uhd : mode.isHD ? limits.hd : limits.raw;
      const adaptive = pipMode ? DeviceProfile.player.pipAdaptiveInfo : `${DeviceProfile.player.defaultAdaptiveInfo}|MAXBITRATE=${maxBr}`;

      try { webapis.avplay.setStreamingProperty('ADAPTIVE_INFO', adaptive); } catch (e) { }
      if (mode.isLive) {
        try { webapis.avplay.setStreamingProperty('IS_LIVE', 'true'); } catch (e) { }
      }
      if (mode.is4K || mode.is8K || mode.isHEVC || mode.isRaw) {
        try { webapis.avplay.setStreamingProperty('SET_MIX_RESOLUTION', DeviceProfile.player.resolutionMarker); } catch (e) { }
        try { webapis.avplay.setTimeoutForBuffering(DeviceProfile.player.heavyBufferingTimeoutMs); } catch (e) { }
        try { webapis.avplay.setBufferingParam('PLAYER_BUFFER_FOR_PLAY', 'PLAYER_BUFFER_SIZE_IN_SECOND', DeviceProfile.player.highBufferSeconds); } catch (e) { }
        try { webapis.avplay.setBufferingParam('PLAYER_BUFFER_FOR_RESUME', 'PLAYER_BUFFER_SIZE_IN_SECOND', DeviceProfile.player.highBufferSeconds); } catch (e) { }
      } else {
        try { webapis.avplay.setTimeoutForBuffering(DeviceProfile.player.bufferingTimeoutMs); } catch (e) { }
        try { webapis.avplay.setBufferingParam('PLAYER_BUFFER_FOR_PLAY', 'PLAYER_BUFFER_SIZE_IN_SECOND', DeviceProfile.player.lowBufferSeconds); } catch (e) { }
        try { webapis.avplay.setBufferingParam('PLAYER_BUFFER_FOR_RESUME', 'PLAYER_BUFFER_SIZE_IN_SECOND', DeviceProfile.player.lowBufferSeconds); } catch (e) { }
      }
    }
    // â€”â€”â€” INIT â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”
    function init(onChannelChange) {
      if (_initialized) return;
      _initialized = true;
      _onChannelChange = onChannelChange;
      _videoLayerEl = document.getElementById('video-layer'); // cache once
      _bindKeys();
      VodOSD.configure({
        getCurrent,
        getState,
        getCurrentTime,
        getDuration,
        togglePlayPause,
        seekTo,
        getAudioTracks,
        setAudioTrack,
        getCurrentAudioTrack,
        getSubtitleTracks,
        setSubtitleTrack,
        getCurrentSubtitleTrack
      });

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          if (_mode !== 'IDLE' && _current) {
            _wasPlayingOnHide = true;
            _safeStop(); // Liberar recursos de hardware
          }
        } else {
          if (_wasPlayingOnHide && _current) {
            _wasPlayingOnHide = false;
            // Restaurar reproducciÃ³n en el modo en el que estaba
            if (_mode === 'FULLSCREEN') play(_current);
            else if (_mode === 'PIP') _startPip(_current);
          }
        }
      });
    }

    // â€”â€”â€” PLAY (pantalla completa) â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”
    function play(ch) {
      if (!ch || !ch.url) return;
      if (_current && _current.id !== ch.id) _retryCount = 0;
      _clearTimer('preview');
      const playSeq = ++_playSeq;

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
        vl.style.width = '100%';
        vl.style.height = '100%';
      }
      const errEl = document.getElementById('player-error');
      if (errEl) errEl.classList.add('hidden');

      // Retraso para que Tizen libere el pipeline anterior
      _setTimer('playDelay', () => {
        if (playSeq !== _playSeq || _mode !== 'FULLSCREEN' || !_current || _current.id !== ch.id) return;
        try {
          let playUrl = _current.url;
          if (playUrl.includes('|')) playUrl = playUrl.split('|')[0];

          webapis.avplay.open(playUrl);

          // â€”â€”â€” CONFIGURACIÃ“N SEGÃšN MODO â€”â€”â€”
          _applyDisplayRect();

          _applyPlaybackTuning(_current, false);

          const handleStreamEnd = () => {
            if (_current && _current.type === 'series') {
              stop();
              if (typeof Router !== 'undefined') Router.showView('channels');
              eventBus.emit('info-popup:resume-requested');
            } else if (_current && _current.type === 'vod') {
              // PelÃ­cula terminada: volver a la ficha, no relanzar en bucle
              stop();
              if (typeof Router !== 'undefined') Router.showView('channels');
              eventBus.emit('info-popup:resume-requested');
            } else {
              // Canal TV en directo: relanzar automÃ¡ticamente
              _setTimer('liveRestart', () => { if (_current && playSeq === _playSeq) play(_current); }, 1000);
            }
          };

          webapis.avplay.setListener({
            onbufferingstart: () => _onBufferingStart(),
            onbufferingcomplete: () => _onBufferingComplete(),
            oncurrentplaytime: () => {
              if (_state === 'BUFFERING') {
                _setState('PLAYING');
                _retryCount = 0;
              }
            },
            onevent: (type) => {
              if (type === 'PLAYER_MSG_END_OF_STREAM') handleStreamEnd();
              if (type === 'PLAYER_MSG_BITRATE_CHANGE' || type === 'PLAYER_MSG_RESOLUTION_CHANGED') {
                if (_state === 'BUFFERING') _setState('PLAYING');
                // Tizen a veces no escala el video si la resoluciÃ³n cambia al vuelo (HLS)
                if (type === 'PLAYER_MSG_RESOLUTION_CHANGED') _applyDisplayRect();
              }
            },
            onerror: (err) => _onError(err),
            ondrmevent: () => { },
            onstreamcompleted: () => handleStreamEnd(),
          });

          webapis.avplay.prepareAsync(
            () => {
              if (playSeq !== _playSeq) return;
              try {
                webapis.avplay.play();
                if (_current && (_current.type === 'vod' || _current.type === 'series')) {
                  // Buscar progreso: primero en Storage (persiste entre reinicios), luego en Store (sesiÃ³n actual)
                  const saved = Storage.getEpisodeProgress(_current.id) || Store.get('progress_' + _current.id);
                  if (saved && saved > 10000) {
                    _setTimer('resumeSeek', () => {
                      if (playSeq !== _playSeq) return;
                      // seekTo es posiciÃ³n absoluta (ms), jumpForward es relativa â†’ seekTo es el correcto aquÃ­
                      try { webapis.avplay.seekTo(saved); } catch (e) { }
                    }, 200);
                  }
                  _startProgressSaveTimer();
                }
              } catch (e) { _onError(e); }
            },
            (err) => _onError(err)
          );

        } catch (e) {
          console.error('AVPlay open error', e);
          _onError('OPEN_FAILED');
        }
      }, 150);
    }

    function _applyDisplayRect() {
      const vl = _videoLayerEl || document.getElementById('video-layer');
      const rect = getDisplayRect(_mode);
      if (_mode === 'FULLSCREEN') {
        if (vl) { vl.style.left = rect.x + 'px'; vl.style.top = rect.y + 'px'; vl.style.width = rect.width + 'px'; vl.style.height = rect.height + 'px'; }
        const mode = _getStreamMode();
        const _isUHD = mode.is4K || mode.is8K || mode.isHEVC || mode.isRaw;
        const _isLive = mode.isLive;
        const _dispMethod = (_isUHD && _isLive) ? 'PLAYER_DISPLAY_MODE_FULL_SCREEN' : 'PLAYER_DISPLAY_MODE_LETTER_BOX';
        try { webapis.avplay.setDisplayMethod(_dispMethod); } catch (e) { }
        try { webapis.avplay.setDisplayRect(rect.x, rect.y, rect.width, rect.height); } catch (e) { }
      } else if (_mode === 'PIP') {
        if (vl) { vl.style.left = rect.x + 'px'; vl.style.top = rect.y + 'px'; vl.style.width = rect.width + 'px'; vl.style.height = rect.height + 'px'; }
        try { webapis.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN'); } catch (e) { }
        try { webapis.avplay.setDisplayRect(rect.x, rect.y, rect.width, rect.height); } catch (e) { }
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

    // â€”â€”â€” MODO PIP (volver desde pantalla completa a lista) â€”
    function shrinkToPip() {
      if (!_current || _mode === 'PIP') return;
      _mode = 'PIP';
      _showPip(_current);
      _applyDisplayRect();
    }

    // â€”â€”â€” EXPANDIR PIP A PANTALLA COMPLETA â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”
    function expandToFullscreen() {
      if (!_current || _mode === 'FULLSCREEN') return;
      cancelPreview();
      _mode = 'FULLSCREEN';
      _hidePip();
      _applyDisplayRect();
    }
    function schedulePreview(ch) {
      if (!ch || !ch.url) return;
      if (ch.type === 'vod' || ch.type === 'series') {
        cancelPreview();
        return;
      }
      // Si ya estamos en PiP con el mismo canal, nada que hacer
      if (_mode === 'PIP' && _current && _current.id === ch.id) return;
      _setTimer('preview', () => {
        _startPip(ch);
      }, DeviceProfile.player.pipPreviewDelayMs); // evita reiniciar AVPlay con cada pulsacion
    }

    function cancelPreview() {
      _clearTimer('preview');
    }

    function _startPip(ch) {
      if (!ch || !ch.url) return;
      if (typeof Router !== 'undefined' && !Router.isView('channels')) return;
      if (_mode === 'FULLSCREEN') return; // no interrumpir reproductor
      if (_current && _current.id === ch.id && _mode === 'PIP') return;
      const pipSeq = ++_pipSeq;

      _retryCount = 0;
      _safeStop();
      _current = ch;
      _mode = 'PIP';
      _setState('BUFFERING');
      _showPip(ch);

      const box = document.getElementById('pip-box');
      if (box) box.classList.add('pip-loading');

      // NO ponemos video-layer en 1920x1080 aquÃ­; _applyDisplayRect lo ajustarÃ¡

      _setTimer('pipDelay', () => {
        if (pipSeq !== _pipSeq || _mode !== 'PIP' || !_current || _current.id !== ch.id) return;
        try {
          let url = ch.url;
          if (url.includes('|')) url = url.split('|')[0];
          webapis.avplay.open(url);
          _applyDisplayRect();
          _applyPlaybackTuning(ch, true);
          webapis.avplay.setListener({
            onbufferingstart: () => _setState('BUFFERING'),
            onbufferingcomplete: () => {
              _setState('PLAYING');
              _retryCount = 0;
              _applyDisplayRect(); // reconfirmar posiciÃ³n despuÃ©s de buffering
              document.getElementById('pip-box')?.classList.remove('pip-loading');
            },
            oncurrentplaytime: () => {
              if (_state === 'BUFFERING') {
                _setState('PLAYING');
                _retryCount = 0;
                document.getElementById('pip-box')?.classList.remove('pip-loading');
              }
            },
            onevent: (type) => {
              if (type === 'PLAYER_MSG_BITRATE_CHANGE' || type === 'PLAYER_MSG_RESOLUTION_CHANGED') {
                if (_state === 'BUFFERING') {
                  _setState('PLAYING');
                  document.getElementById('pip-box')?.classList.remove('pip-loading');
                }
              }
            },
            onerror: () => _hidePip(),
            ondrmevent: () => { },
            onstreamcompleted: () => { },
          });
          webapis.avplay.prepareAsync(
            () => { if (pipSeq === _pipSeq) { try { webapis.avplay.play(); } catch (e) { } } },
            () => { _hidePip(); }
          );
        } catch (e) { _hidePip(); }
      }, 150);
    }

    // â€”â€”â€” SAFE STOP â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”
    function _safeStop() {
      _clearTimers(['retry', 'error', 'playDelay', 'pipDelay', 'liveRestart', 'resumeSeek']);
      try {
        const vl = _videoLayerEl || document.getElementById('video-layer');
        if (vl) {
          vl.style.left = '0px';
          vl.style.top = '0px';
          vl.style.width = '0px';
          vl.style.height = '0px';
        }
        const s = webapis.avplay.getState();
        if (s !== 'NONE' && s !== 'IDLE') webapis.avplay.stop();
        if (s !== 'NONE') webapis.avplay.close();
      } catch (e) { }
    }

    // â€”â€”â€” EVENTS â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”
    function _onBufferingStart() { _setState('BUFFERING'); }
    function _onBufferingComplete() { _setState('PLAYING'); _retryCount = 0; }

    function _onError(err) {
      console.error('AVPlay error', err);
      _handleError();
    }

    function _handleError() {
      _safeStop();
      _clearTimers(['retry', 'error']);

      if (_isActive() && _current && _retryCount < 3) {
        _retryCount++;
        if (typeof Router !== 'undefined' && Router.showToast) {
          Router.showToast(`Error de conexiÃ³n. Reconectando (${_retryCount}/3)...`, 'error');
        }
        _setTimer('retry', () => {
          if (_isActive() && _current) play(_current);
        }, 2000);
        return;
      }

      _retryCount = 0;
      const errEl = document.getElementById('player-error');
      if (errEl) errEl.classList.remove('hidden');
      _setTimer('error', () => {
        if (errEl) errEl.classList.add('hidden');
        if (_isActive()) Router.showView('channels');
      }, 4000);
    }

    function _setState(s) {
      _state = s;
      const spinner = document.getElementById('buffer-spinner');
      if (spinner) spinner.classList.toggle('hidden', s !== 'BUFFERING');
    }



    // â€”â€”â€” KEY BINDINGS â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”
    function _bindKeys() {
      KeyHandler.on('CH_UP', () => { if (_isActive()) { _onChannelChange?.('prev'); return true; } });
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

      // â€”â€”â€” TECLAS DE MEDIOS DEL MANDO FÃSICO â€”â€”â€”â€”â€”â€”â€”â€”
      KeyHandler.on('PLAY_PAUSE', () => {
        if (_isActive()) { togglePlayPause(); if (typeof VodOSD !== 'undefined' && (_current?.type === 'vod' || _current?.type === 'series')) VodOSD.show(_current); return true; }
      });
      KeyHandler.on('PLAY', () => {
        if (_isActive() && _state !== 'PLAYING') { togglePlayPause(); return true; }
      });
      KeyHandler.on('PAUSE', () => {
        if (_isActive() && _state === 'PLAYING') { togglePlayPause(); return true; }
      });
      KeyHandler.on('REWIND', () => {
        if (_isActive()) { _handleSeek('left'); return true; }
      });
      KeyHandler.on('FAST_FWD', () => {
        if (_isActive()) { _handleSeek('right'); return true; }
      });
      KeyHandler.on('STOP', () => {
        if (_isActive() && _current) { stop(); Router.showView('channels'); return true; }
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

    // â€”â€”â€” SEEK LOGIC â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”
    let _seekAccumulator = 0;
    let _seekLastTime = 0;

    function _resetSeekFeedback() {
      document.getElementById('seek-feedback-left')?.classList.add('hidden');
      document.getElementById('seek-feedback-right')?.classList.add('hidden');
      _seekAccumulator = 0;
    }

    function _handleSeek(dir) {
      if (!_current) return;
      const now = Date.now();
      if (now - _seekLastTime > 600) {
        _seekAccumulator = 0;
      }
      _seekLastTime = now;

      // AceleraciÃ³n dinÃ¡mica: mÃ¡s veces pulsado = saltos mÃ¡s grandes
      let stepSecs = 10;
      const absAcc = Math.abs(_seekAccumulator);
      if (absAcc >= 300) stepSecs = 120; // +2 mins
      else if (absAcc >= 120) stepSecs = 60;  // +1 min
      else if (absAcc >= 60) stepSecs = 30;   // +30 segs
      else if (absAcc >= 30) stepSecs = 20;   // +20 segs

      if (dir === 'left') _seekAccumulator -= stepSecs;
      if (dir === 'right') _seekAccumulator += stepSecs;

      const elLeft = document.getElementById('seek-feedback-left');
      const elRight = document.getElementById('seek-feedback-right');

      if (elLeft) elLeft.classList.add('hidden');
      if (elRight) elRight.classList.add('hidden');

      const el = _seekAccumulator < 0 ? elLeft : elRight;
      const icon = _seekAccumulator < 0 ? 'fast_rewind' : 'fast_forward';

      const totalSecs = Math.abs(_seekAccumulator);
      let text = totalSecs + 's';
      if (totalSecs >= 60) {
        const m = Math.floor(totalSecs / 60);
        const s = totalSecs % 60;
        text = m + 'm' + (s > 0 ? ' ' + s + 's' : '');
      }

      if (el) {
        el.replaceChildren();
        const iconEl = document.createElement('span');
        iconEl.className = 'material-symbols-rounded';
        iconEl.textContent = icon;
        const timeEl = document.createElement('span');
        timeEl.className = 'seek-time';
        timeEl.textContent = text;
        el.append(iconEl, timeEl);
        el.classList.remove('hidden');

        // Reset animation to replay it
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = null;
      }

      // Ejecutar el salto inmediatamente para ver el frame
      try {
        if (dir === 'right') {
          webapis.avplay.jumpForward(stepSecs * 1000);
        } else {
          webapis.avplay.jumpBackward(stepSecs * 1000);
        }
      } catch (e) {
        console.error('AVPlay jump error', e);
      }

      _setTimer('seek', _resetSeekFeedback, 600);
    }

    // â€”â€”â€” UTILS â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”
    function stop() {
      if (_current && (_current.type === 'vod' || _current.type === 'series')) {
        const ms = getCurrentTime();
        if (ms > 10000) {
          Store.set('progress_' + _current.id, ms);
          Storage.setEpisodeProgress(_current.id, ms); // Persistente entre reinicios
        }
      }
      _stopProgressSaveTimer();
      _safeStop();
      _current = null;
      _mode = 'IDLE';
      _hidePip();
      _clearTimer('seek');
      _resetSeekFeedback();
      _clearTimers(['preview', 'retry', 'error', 'playDelay', 'pipDelay', 'liveRestart', 'resumeSeek']);
      if (typeof PlayerOSD !== 'undefined') PlayerOSD.hide();
      if (typeof VodOSD !== 'undefined') VodOSD.hide();
    }
    function _startProgressSaveTimer() {
      _stopProgressSaveTimer();
      _progressSaveTimer = setInterval(() => {
        if (_current && (_current.type === 'vod' || _current.type === 'series') && _state === 'PLAYING') {
          const ms = getCurrentTime();
          if (ms > 10000) {
            Store.set('progress_' + _current.id, ms);
            Storage.setEpisodeProgress(_current.id, ms);
            // Actualizar "Seguir viendo" con el minuto actual
            if (_current.type === 'series' && _current.seriesId) {
              Watching.updateProgress(_current.seriesId, _current.id, ms, Store.peek('currentList')?.id);
            }
          }
        }
      }, 10000); // cada 10 segundos
    }
    function _stopProgressSaveTimer() {
      if (_progressSaveTimer) { clearInterval(_progressSaveTimer); _progressSaveTimer = null; }
    }

    function getCurrentTime() {
      try { return webapis.avplay.getCurrentTime(); } catch (e) { return 0; }
    }
    function getDuration() {
      try { return webapis.avplay.getDuration(); } catch (e) { return 0; }
    }
    function togglePlayPause() {
      if (_state === 'PLAYING') {
        try { webapis.avplay.pause(); _setState('PAUSED'); } catch (e) { }
      } else if (_state === 'PAUSED') {
        try { webapis.avplay.play(); _setState('PLAYING'); } catch (e) { }
      }
    }
    function seek(seconds) {
      try {
        const ms = seconds * 1000;
        if (ms > 0) webapis.avplay.jumpForward(ms);
        else webapis.avplay.jumpBackward(Math.abs(ms));
      } catch (e) { }
    }
    function seekTo(ms) {
      try { webapis.avplay.seekTo(ms); } catch (e) { }
    }
    function _normalizeTrackInfo(track) {
      if (!track || (track.type !== 'AUDIO' && track.type !== 'TEXT')) return track;
      let extra = track.extra_info;
      if (typeof extra === 'string') {
        try {
          extra = extra ? JSON.parse(extra) : {};
        } catch (e) {
          extra = { language: extra };
        }
      }
      return { ...track, extra_info: extra || {} };
    }
    function getAudioTracks() {
      try {
        if (typeof webapis === 'undefined') return [];
        const tracks = webapis.avplay.getTotalTrackInfo();
        return tracks.filter(t => t.type === 'AUDIO').map(_normalizeTrackInfo);
      } catch (e) { return []; }
    }
    function setAudioTrack(index) {
      try { if (typeof webapis !== 'undefined') webapis.avplay.setSelectTrack('AUDIO', index); } catch (e) { }
    }
    function getCurrentAudioTrack() {
      try {
        if (typeof webapis === 'undefined') return null;
        const current = webapis.avplay.getCurrentStreamInfo() || [];
        return _normalizeTrackInfo(current.find(t => t.type === 'AUDIO'));
      } catch (e) { return null; }
    }

    function getSubtitleTracks() {
      try {
        if (typeof webapis === 'undefined' || !webapis.avplay.getTotalTrackInfo) return [];
        const tracks = webapis.avplay.getTotalTrackInfo() || [];
        return tracks.filter(t => t.type === 'TEXT').map(_normalizeTrackInfo);
      } catch (e) { return []; }
    }
    function setSubtitleTrack(index) {
      try {
        if (typeof webapis !== 'undefined' && webapis.avplay.setSelectTrack) {
          webapis.avplay.setSelectTrack('TEXT', index);
        }
      } catch (e) { }
    }
    function getCurrentSubtitleTrack() {
      try {
        if (typeof webapis === 'undefined' || !webapis.avplay.getCurrentStreamInfo) return null;
        const current = webapis.avplay.getCurrentStreamInfo() || [];
        return _normalizeTrackInfo(current.find(t => t.type === 'TEXT'));
      } catch (e) { return null; }
    }

    function getCurrent() { return _current; }
    function getState() { return _state; }
    function getMode() { return _mode; }
    function reapplyPip() { if (_mode === 'PIP') _applyDisplayRect(); }
    function _isActive() { return document.getElementById('view-player')?.classList.contains('active'); }

    return { init, play, stop, getCurrent, getState, getMode, reapplyPip, shrinkToPip, expandToFullscreen, schedulePreview, cancelPreview, getCurrentTime, getDuration, togglePlayPause, seek, seekTo, getAudioTracks, setAudioTrack, getCurrentAudioTrack, getSubtitleTracks, setSubtitleTrack, getCurrentSubtitleTrack };
  })();

