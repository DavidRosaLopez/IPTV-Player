const VodOSD = (() => {
  let _timer = null;
  let _progressTimer = null;
  let _isVisible = false;
  let _focusState = 'default'; // 'default' | 'btn-audio' | 'audio-menu'
  let _btnIdx = 0; // 0=audio, 1=restart, 2=next
  let _visibleBtns = [];
  let _audioTracks = [];
  let _audioIdx = 0;
  
  // ── SEEK ACELERADO ──────────────────────────────────
  let _lastSeekTime = 0;
  let _seekVelocity = 0; // 0=parado, 1=3s, 2=5s, 3=10s, 4=30s, 5=60s
  let _seekDirection = null; // 'left' | 'right'
  let _seekAccelTimer = null;
  
  // ── PREVIEW THUMBNAIL ────────────────────────────────
  let _previewVisible = false;
  let _previewSeekTime = 0;


  function show(currentCh) {
    if (!currentCh) return;
    const osd = document.getElementById('vod-osd');
    if (!osd) return;

    _isVisible = true;
    _focusState = 'default';
    document.getElementById('vod-title').textContent = currentCh.name || 'Sin título';
    
    const btnAudio = document.getElementById('btn-vod-audio');
    const btnRestart = document.getElementById('btn-vod-restart');
    const btnNext = document.getElementById('btn-vod-next');
    
    _visibleBtns = ['btn-vod-audio'];
    
    if (btnAudio) btnAudio.classList.remove('focused');
    if (btnRestart) {
       btnRestart.classList.remove('focused');
       btnRestart.classList.remove('hidden');
       _visibleBtns.push('btn-vod-restart');
    }
    if (btnNext) {
       btnNext.classList.remove('focused');
       if (currentCh.type === 'series') {
         btnNext.classList.remove('hidden');
         _visibleBtns.push('btn-vod-next');
       } else {
         btnNext.classList.add('hidden');
       }
    }
    
    const audioMenu = document.getElementById('vod-audio-menu');
    if (audioMenu) audioMenu.classList.add('hidden');

    _updateProgress();
    _startProgressTimer();

    osd.classList.remove('hidden');
    _resetHideTimer();
  }

  function hide() {
    _isVisible = false;
    const osd = document.getElementById('vod-osd');
    if (osd) osd.classList.add('hidden');
    const audioMenu = document.getElementById('vod-audio-menu');
    if (audioMenu) audioMenu.classList.add('hidden');
    clearTimeout(_timer);
    clearInterval(_progressTimer);
  }

  function toggle() {
    if (_isVisible) hide();
    else if (typeof Player !== 'undefined' && Player.getCurrent()) {
      show(Player.getCurrent());
    }
  }

  function _resetHideTimer() {
    clearTimeout(_timer);
    // Don't auto-hide if menu is open
    if (_focusState === 'audio-menu') return;
    
    _timer = setTimeout(() => {
      if (typeof Player !== 'undefined' && Player.getState() === 'PLAYING') {
        hide();
      }
    }, 4000);
  }

  function _startProgressTimer() {
    clearInterval(_progressTimer);
    _progressTimer = setInterval(_updateProgress, 1000);
  }

  function _formatTime(ms) {
    if (ms < 0 || isNaN(ms)) ms = 0;
    const totalSecs = Math.floor(ms / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    const pad = (n) => n.toString().padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  function _updateProgress() {
    if (typeof Player === 'undefined') return;
    const current = Player.getCurrentTime();
    const total = Player.getDuration();

    document.getElementById('vod-time-current').textContent = _formatTime(current);
    document.getElementById('vod-time-total').textContent = _formatTime(total);

    let pct = 0;
    if (total > 0) {
      pct = (current / total) * 100;
      pct = Math.max(0, Math.min(100, pct));
    }

    document.getElementById('vod-progress-fill').style.width = pct + '%';
    document.getElementById('vod-progress-thumb').style.left = pct + '%';
  }

  function handleKey(key) {
    if (!_isVisible) return false;
    _resetHideTimer();

    if (_focusState === 'audio-menu') {
      if (key === 'UP') {
        _audioIdx = Math.max(0, _audioIdx - 1);
        _renderAudioMenu();
        return true;
      }
      if (key === 'DOWN') {
        _audioIdx = Math.min(_audioTracks.length - 1, _audioIdx + 1);
        _renderAudioMenu();
        return true;
      }
      if (key === 'ENTER') {
        const track = _audioTracks[_audioIdx];
        if (track && track.index !== -1) {
          Player.setAudioTrack(track.index);
        }
        _closeAudioMenu();
        return true;
      }
      if (key === 'BACK' || key === 'LEFT' || key === 'RIGHT') {
        _closeAudioMenu();
        return true;
      }
      return true;
    }

    if (_focusState === 'btn-audio') {
      if (key === 'DOWN') {
        _focusState = 'default';
        _visibleBtns.forEach(id => document.getElementById(id)?.classList.remove('focused'));
        return true;
      }
      if (key === 'LEFT') {
        _btnIdx = Math.max(0, _btnIdx - 1);
        _updateBtnFocus();
        return true;
      }
      if (key === 'RIGHT') {
        _btnIdx = Math.min(_visibleBtns.length - 1, _btnIdx + 1);
        _updateBtnFocus();
        return true;
      }
      if (key === 'ENTER') {
        const activeId = _visibleBtns[_btnIdx];
        if (activeId === 'btn-vod-audio') {
           _openAudioMenu();
        } else if (activeId === 'btn-vod-restart') {
           if (typeof Player !== 'undefined') Player.seekTo(0);
           hide();
        } else if (activeId === 'btn-vod-next') {
           if (typeof InfoPopup !== 'undefined') InfoPopup.playNextEpisode();
           hide();
        }
        return true;
      }
      if (key === 'BACK') {
        hide();
        return true;
      }
      return true;
    }

    if (key === 'UP') {
      _focusState = 'btn-audio';
      _btnIdx = 0;
      _updateBtnFocus();
      return true;
    }
    if (key === 'LEFT') {
      _handleAcceleratedSeek('left');
      return true;
    }
    if (key === 'RIGHT') {
      _handleAcceleratedSeek('right');
      return true;
    }
    if (key === 'ENTER') {
      Player.togglePlayPause();
      _resetHideTimer(); 
      return true;
    }
    if (key === 'BACK' || key === 'DOWN') {
      _hidePreview();
      hide();
      return true;
    }
    
    
    return false;
  }

  function _updateBtnFocus() {
    _visibleBtns.forEach((id, idx) => {
       document.getElementById(id)?.classList.toggle('focused', idx === _btnIdx);
    });
  }

  function _openAudioMenu() {
    _audioTracks = Player.getAudioTracks() || [];
    const current = Player.getCurrentAudioTrack();
    
    if (_audioTracks.length === 0) {
       _audioTracks = [{ index: -1, extra_info: { language: 'Predeterminado' } }];
    }

    _audioIdx = 0;
    if (current) {
      const idx = _audioTracks.findIndex(t => t.index === current.index);
      if (idx !== -1) _audioIdx = idx;
    }

    _focusState = 'audio-menu';
    document.getElementById('vod-audio-menu')?.classList.remove('hidden');
    _renderAudioMenu();
  }

  function _closeAudioMenu() {
    _focusState = 'btn-audio';
    document.getElementById('vod-audio-menu')?.classList.add('hidden');
    _updateBtnFocus();
    _resetHideTimer();
  }

  function _renderAudioMenu() {
    const list = document.getElementById('vod-audio-list');
    if (!list) return;
    list.innerHTML = '';
    
    const current = Player.getCurrentAudioTrack();
    
    _audioTracks.forEach((t, i) => {
      const li = document.createElement('li');
      li.className = 'vod-audio-item' + (i === _audioIdx ? ' focused' : '');
      if (current && current.index === t.index) li.classList.add('active');
      
      const lang = (t.extra_info && t.extra_info.language) ? t.extra_info.language.toUpperCase() : ('Pista ' + (i+1));
      
      li.innerHTML = `<span>${lang}</span>`;
      if (current && current.index === t.index) {
         li.innerHTML += `<span class="material-symbols-rounded">check</span>`;
      }
      
      list.appendChild(li);
    });

    const focusedEl = list.querySelector('.focused');
    if (focusedEl) focusedEl.scrollIntoView({ block: 'nearest' });
  }

  // ── SEEK ACELERADO ──────────────────────────────────
  function _handleAcceleratedSeek(direction) {
    const now = Date.now();
    const deltaTime = now - _lastSeekTime;
    
    // Resetear si pasó más de 500ms desde el último seek
    if (deltaTime > 500 || _seekDirection !== direction) {
      _seekVelocity = 0;
      _seekDirection = direction;
    }
    
    // Incrementar velocidad: 3s → 5s → 10s → 30s → 60s
    if (_seekVelocity < 5) {
      _seekVelocity++;
    }
    
    const seekValues = [3, 5, 10, 30, 60];
    const seekAmount = seekValues[_seekVelocity - 1] || 60;
    const amount = direction === 'left' ? -seekAmount : seekAmount;
    
    _lastSeekTime = now;
    Player.seek(amount);
    _showPreview(amount, seekAmount);
    _resetHideTimer();
  }

  function _showPreview(seekDelta, displaySpeed) {
    if (typeof Player === 'undefined') return;
    const current = Player.getCurrentTime();
    const total = Player.getDuration();
    const newTime = Math.max(0, Math.min(total, current + seekDelta));
    
    _previewSeekTime = newTime;
    _previewVisible = true;
    
    const preview = document.getElementById('vod-seek-preview');
    if (!preview) return;
    
    // Calcular posición y mostrar preview
    const pct = (newTime / total) * 100;
    const container = document.querySelector('.vod-progress-bar-container');
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const offset = (pct / 100) * rect.width - 40; // 80px de ancho del preview
    
    preview.style.left = Math.max(0, Math.min(rect.width - 80, offset)) + 'px';
    preview.classList.remove('hidden');
    
    // Actualizar tiempo en la preview
    const timeEl = preview.querySelector('.vod-preview-time');
    if (timeEl) {
      const timeText = _formatTime(newTime * 1000);
      const speedText = seekDelta > 0 ? `⏩ +${displaySpeed}s` : `⏪ -${displaySpeed}s`;
      timeEl.innerHTML = `<div>${timeText}</div><div style="font-size: 12px; opacity: 0.8;">${speedText}</div>`;
    }
    
    // Auto-hide la preview después de 2s de inactividad
    clearTimeout(_seekAccelTimer);
    _seekAccelTimer = setTimeout(() => {
      _hidePreview();
    }, 2000);
  }

  function _hidePreview() {
    _previewVisible = false;
    const preview = document.getElementById('vod-seek-preview');
    if (preview) preview.classList.add('hidden');
    clearTimeout(_seekAccelTimer);
  }

  function isVisible() {
    return _isVisible;
  }

  return { show, hide, toggle, handleKey, isVisible };
})();
