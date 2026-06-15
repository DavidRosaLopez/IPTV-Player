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
  let _overlayTimer    = null;
  let _clockTimer      = null;
  let _onChannelChange = null;
  let _state           = 'IDLE'; // IDLE | BUFFERING | PLAYING | ERROR

  const OVERLAY_TIMEOUT = 5000;

  let _initialized = false;
  // ── INIT ─────────────────────────────────────────────
  function init(onChannelChangeCb) {
    if (_initialized) return;
    _initialized = true;
    _onChannelChange = onChannelChangeCb;
    _bindKeys();
    _startClock();
  }

  // ── PLAY ─────────────────────────────────────────────
  function play(channel) {
    if (_current && _current.id === channel.id && (_state === 'PLAYING' || _state === 'BUFFERING')) {
      _showOverlay(true);
      _scheduleHideOverlay();
      _updateOverlayInfo();
      return;
    }

    _current = channel;
    _setState('BUFFERING');

    _showOverlay(true);
    _scheduleHideOverlay();
    _updateOverlayInfo();

    setTimeout(() => {
      _safeStop();
      try {
        let playUrl = channel.url;
        if (playUrl.includes('|')) playUrl = playUrl.split('|')[0];

        webapis.avplay.open(playUrl);

        // ── CONFIGURACIÓN CRÍTICA PARA PANTALLA COMPLETA ──
        const vl = document.getElementById('video-layer');
        if (vl) {
          vl.style.width = '1920px';
          vl.style.height = '1080px';
        }

        // PLAYER_DISPLAY_MODE_FULL_SCREEN ignora el aspect ratio y fuerza que llene el rectángulo
        try { webapis.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN'); } catch(e) {}
        
        // El rectángulo debe coincidir exactamente con la resolución CSS de la App (1920x1080)
        try { webapis.avplay.setDisplayRect(0, 0, 1920, 1080); } catch(e) {}

        try {
          const name = (channel.name || '').toUpperCase();
          const is8K = name.includes('8K');
          const is4K = name.includes('4K') || name.includes('UHD') || name.includes('2160');
          const isHD = name.includes('FHD') || name.includes('HD') || name.includes('1080');
          const maxBr = is8K ? 80000000 : is4K ? 40000000 : isHD ? 20000000 : 10000000;
          // Buffer adaptado: 2-3 segundos para evitar cortes
          const bufMs = is8K ? 5000 : is4K ? 4000 : isHD ? 3000 : 3000;

          webapis.avplay.setStreamingProperty('ADAPTIVE_INFO',
            `STARTBITRATE=HIGHEST|MAXBITRATE=${maxBr}|BUFFERLENGTH=${Math.round(bufMs / 1000)}`);
        } catch(e) {}

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

  // ── SAFE STOP ────────────────────────────────────────
  function _safeStop() {
    try {
      const vl = document.getElementById('video-layer');
      if (vl) {
        vl.style.width = '0px';
        vl.style.height = '0px';
      }
      const s = webapis.avplay.getState();
      if (s !== 'NONE' && s !== 'IDLE') webapis.avplay.stop();
      if (s !== 'NONE') webapis.avplay.close();
    } catch(e) {}
  }

  // ── EVENTS ───────────────────────────────────────────
  function _onBufferingStart()    { _setState('BUFFERING'); }
  function _onBufferingComplete() { _setState('PLAYING'); }

  function _onError(err) {
    console.error('AVPlay error', err);
    _setState('ERROR');
    App.showToast('⚠ Error de reproducción. Reintentando…', 'error');
    setTimeout(() => { if (_current) play(_current); }, 3000);
  }

  function _setState(s) {
    _state = s;
    const spinner = document.getElementById('buffer-spinner');
    if (spinner) spinner.classList.toggle('hidden', s !== 'BUFFERING');
  }

  // ── OVERLAY ──────────────────────────────────────────
  function _showOverlay(show) {
    document.getElementById('player-overlay')?.classList.toggle('hidden', !show);
  }

  function _scheduleHideOverlay() {
    clearTimeout(_overlayTimer);
    _overlayTimer = setTimeout(() => _showOverlay(false), OVERLAY_TIMEOUT);
  }

  function toggleOverlay() {
    const el = document.getElementById('player-overlay');
    if (!el) return;
    if (el.classList.contains('hidden')) {
      _showOverlay(true);
      _scheduleHideOverlay();
    } else {
      // Si ya está visible, reiniciamos el temporizador en lugar de ocultarlo de golpe,
      // para evitar parpadeos si el mando de la TV dispara eventos dobles
      _scheduleHideOverlay();
    }
  }

  function _updateOverlayInfo() {
    if (!_current) return;
    const safe = s => s ? String(s) : '';
    _setText('overlay-ch-name', safe(_current.name));
    _setText('overlay-ch-num',  '#' + ((_current.id || 0) + 1));
    _setText('overlay-ch-fav',  Favorites.isFav(_current.id) ? '♥' : '');
    const logoEl = document.getElementById('overlay-logo');
    if (logoEl) logoEl.src = _current.logo || '';
    const now  = EPG.getNow(_current.epgId);
    const next = EPG.getNext(_current.epgId);
    _setText('prog-now-title',  now  ? now.title  : 'Sin datos EPG');
    _setText('prog-now-time',   now  ? _fmtRange(now.start, now.end) : '');
    _setText('prog-next-title', next ? next.title : '—');
    _setText('prog-next-time',  next ? _fmtRange(next.start, next.end) : '');
    _updateProgress();
  }

  function _updateProgress() {
    if (!_current) return;
    const now  = EPG.getNow(_current.epgId);
    const fill = document.getElementById('progress-fill');
    if (!fill || !now?.start || !now?.end) return;
    const pct = ((Date.now() - now.start.getTime()) / (now.end.getTime() - now.start.getTime())) * 100;
    fill.style.width = Math.min(100, Math.max(0, pct)) + '%';
  }

  // ── CLOCK ────────────────────────────────────────────
  function _startClock() {
    const update = () => _setText('overlay-time',
      new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }));
    update();
    _clockTimer = setInterval(update, 15000);
  }

  // ── KEY BINDINGS ─────────────────────────────────────
  function _bindKeys() {
    KeyHandler.on('INFO', () => { if (_isActive()) { toggleOverlay(); return true; } });

    KeyHandler.on('CH_UP',   () => { if (_isActive()) { _onChannelChange?.('prev'); return true; } });
    KeyHandler.on('CH_DOWN', () => { if (_isActive()) { _onChannelChange?.('next'); return true; } });

    KeyHandler.on('UP',   () => { if (_isActive()) { _showOverlay(true); _scheduleHideOverlay(); return true; } });
    KeyHandler.on('DOWN', () => { if (_isActive()) { _showOverlay(true); _scheduleHideOverlay(); return true; } });
    KeyHandler.on('ENTER',() => { if (_isActive()) { toggleOverlay(); return true; } });
    KeyHandler.on('LONG_OK',()=> { 
      if (_isActive() && _current) { 
        Favorites.toggle(_current.id); 
        _updateOverlayInfo();
        _showOverlay(true);
        _scheduleHideOverlay();
        return true; 
      } 
    });

    KeyHandler.on('BACK', () => {
      if (_isActive()) {
        // Volver a la lista de canales y parar el video
        stop();
        App.showView('channels');
        _showOverlay(false);
        return true;
      }
    });

    KeyHandler.on('GREEN', () => { if (_isActive()) { App.showView('epg'); return true; } });

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

  // ── UTILS ────────────────────────────────────────────
  function stop()         { _safeStop(); _current = null; }
  function getCurrent()   { return _current; }
  function getState()     { return _state; }
  function _isActive()    { return document.getElementById('view-player')?.classList.contains('active'); }
  function _setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }
  function _fmtRange(s, e) {
    if (!s || !e) return '';
    const f = d => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    return `${f(s)} – ${f(e)}`;
  }

  return { init, play, stop, toggleOverlay, getCurrent, getState };
})();
