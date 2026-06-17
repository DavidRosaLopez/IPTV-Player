/**
 * vod-osd.js — Interfaz de reproducción estilo Netflix para VOD/Series
 */
const VodOSD = (() => {
  let _timer = null;
  let _progressTimer = null;
  let _isVisible = false;
  let _focusIdx = 1; // 0: Rewind, 1: Play/Pause, 2: Forward

  function show(currentCh) {
    if (!currentCh) return;
    const osd = document.getElementById('vod-osd');
    if (!osd) return;

    _isVisible = true;
    document.getElementById('vod-title').textContent = currentCh.name || 'Sin título';
    
    // Configurar estado inicial
    _updateProgress();
    _startProgressTimer();

    osd.classList.remove('hidden');
    _resetHideTimer();
  }

  function hide() {
    _isVisible = false;
    const osd = document.getElementById('vod-osd');
    if (osd) osd.classList.add('hidden');
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
      _resetHideTimer(); // Resetear timeout tras play/pause
      return true;
    }
    if (key === 'BACK' || key === 'UP' || key === 'DOWN') {
      hide();
      return true;
    }
    
    return false;
  }

  function isVisible() {
    return _isVisible;
  }

  return { show, hide, toggle, handleKey, isVisible };
})();
