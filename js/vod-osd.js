const VodOSD = (() => {
  let _timer = null;
  let _progressTimer = null;
  let _isVisible = false;
  let _focusState = 'default'; // 'default' | 'btn-audio' | 'audio-menu'
  let _audioTracks = [];
  let _audioIdx = 0;


  function show(currentCh) {
    if (!currentCh) return;
    const osd = document.getElementById('vod-osd');
    if (!osd) return;

    _isVisible = true;
    _focusState = 'default';
    document.getElementById('vod-title').textContent = currentCh.name || 'Sin título';
    
    const btnAudio = document.getElementById('btn-vod-audio');
    if (btnAudio) btnAudio.classList.remove('focused');
    
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
        document.getElementById('btn-vod-audio')?.classList.remove('focused');
        return true;
      }
      if (key === 'ENTER') {
        _openAudioMenu();
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
      document.getElementById('btn-vod-audio')?.classList.add('focused');
      return true;
    }
    if (key === 'LEFT') {
      Player.seek(-10);
      return true;
    }
    if (key === 'RIGHT') {
      Player.seek(10);
      return true;
    }
    if (key === 'ENTER') {
      Player.togglePlayPause();
      _resetHideTimer(); 
      return true;
    }
    if (key === 'BACK' || key === 'DOWN') {
      hide();
      return true;
    }
    
    return false;
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
    document.getElementById('btn-vod-audio')?.classList.add('focused');
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

  function isVisible() {
    return _isVisible;
  }

  return { show, hide, toggle, handleKey, isVisible };
})();
