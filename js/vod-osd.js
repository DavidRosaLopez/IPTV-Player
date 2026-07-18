import { InfoPopup } from './info-popup.js';


export const VodOSD = (() => {
  let _player = null;
  let _timer = null;
  let _progressTimer = null;
  let _isVisible = false;
  let _focusState = 'default'; // 'default' | 'btn-audio' | 'audio-menu'
  let _btnIdx = 0; // 0=audio, 1=restart, 2=next
  let _visibleBtns = [];
  let _audioTracks = [];
  let _audioIdx = 0;
  
  let _lastSeekTime = 0;
  let _seekVelocity = 0; // 0=parado, 1=3s, 2=5s, 3=10s, 4=30s, 5=60s
  let _seekDirection = null; // 'left' | 'right'
  let _seekAccelTimer = null;
  
  // ── PREVIEW THUMBNAIL ────────────────────────────────
  let _previewVisible = false;
  let _previewSeekTime = 0;

  function configure(playerApi) {
    _player = playerApi;
  }

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
       const hasNext = typeof InfoPopup !== 'undefined' && InfoPopup.hasNextEpisode();
       if (currentCh.type === 'series' && hasNext) {
         btnNext.classList.remove('hidden');
         btnNext.style.display = 'flex';
         _visibleBtns.push('btn-vod-next');
       } else {
         btnNext.classList.add('hidden');
         btnNext.style.display = 'none';
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
    else if (_player && _player.getCurrent()) {
      show(_player.getCurrent());
    }
  }

  function _resetHideTimer() {
    clearTimeout(_timer);
    // Don't auto-hide if menu is open
    if (_focusState === 'audio-menu') return;
    
    _timer = setTimeout(() => {
      if (_player && _player.getState() === 'PLAYING') {
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
    if (!_player) return;
    const current = _player.getCurrentTime();
    const total = _player.getDuration();
    const remaining = Math.max(0, total - current);

    document.getElementById('vod-time-current').textContent = _formatTime(current);
    document.getElementById('vod-time-total').textContent = '-' + _formatTime(remaining);

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
          _player.setAudioTrack(track.index);
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
           if (_player) _player.seekTo(0);
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
    if (key === 'ENTER') {
      if (_player) _player.togglePlayPause();
      _resetHideTimer(); 
      return true;
    }
    if (key === 'BACK' || key === 'DOWN') {
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

  function _labelFromText(text) {
    const v = String(text || '').trim().toLowerCase().replace(/[^a-z0-9]+/gi, '');
    if (!v) return '';
    if (['es', 'spa', 'esp', 'spanish', 'espanol', 'castellano'].includes(v)) return 'Espa\u00f1ol';
    if (['lat', 'latino'].includes(v)) return 'Latino';
    if (['eng', 'en', 'english'].includes(v)) return 'Ingl\u00e9s';
    if (['original', 'vo', 'vos', 'vose'].includes(v)) return 'Original';
    if (['fr', 'fra', 'french'].includes(v)) return 'Franc\u00e9s';
    if (['it', 'ita', 'italian'].includes(v)) return 'Italiano';
    if (['pt', 'por', 'portuguese'].includes(v)) return 'Portugu\u00e9s';
    if (['de', 'ger', 'german'].includes(v)) return 'Alem\u00e1n';
    return '';
  }

  function _getTrackLabel(track, index) {
    let info = track?.extra_info || {};
    if (typeof info === 'string') {
      try {
        info = info ? JSON.parse(info) : {};
      } catch (e) {
        info = { language: info };
      }
    }
    const candidates = [info.language, info.track_lang, info.lang, track?.language, track?.lang, track?.title, track?.name];
    for (const value of candidates) {
      const mapped = _labelFromText(value);
      if (mapped) return mapped;
    }
    const raw = candidates.find(v => String(v || '').trim()) || '';
    if (raw) return String(raw).trim();
    return `Pista ${index + 1}`;
  }

  function _syncAudioListScroll() {
    const list = document.getElementById('vod-audio-list');
    if (!list) return;
    const needsScroll = list.scrollHeight > list.clientHeight + 1;
    list.style.overflowY = needsScroll ? 'auto' : 'hidden';
    return needsScroll;
  }
  function _openAudioMenu() {
    if (!_player) return;
    _audioTracks = _player.getAudioTracks() || [];
    const current = _player.getCurrentAudioTrack();
    
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
    
    const current = _player ? _player.getCurrentAudioTrack() : null;
    
    _audioTracks.forEach((t, i) => {
      const li = document.createElement('li');
      li.className = 'vod-audio-item' + (i === _audioIdx ? ' focused' : '');
      if (current && current.index === t.index) li.classList.add('active');
      
      const lang = _getTrackLabel(t, i);
      
      const label = document.createElement('span');
      label.textContent = lang;
      li.appendChild(label);
      if (current && current.index === t.index) {
         const check = document.createElement('span');
         check.className = 'material-symbols-rounded';
         check.textContent = 'check';
         li.appendChild(check);
      }
      
      list.appendChild(li);
    });

    const needsScroll = _syncAudioListScroll();
    if (needsScroll) {
      const focusedEl = list.querySelector('.focused');
      if (focusedEl) focusedEl.scrollIntoView({ block: 'nearest' });
    } else {
      list.scrollTop = 0;
    }
  }

  function isVisible() {
    return _isVisible;
  }

  return { configure, show, hide, toggle, handleKey, isVisible };
})();
