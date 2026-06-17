/**
 * player-osd.js — On-Screen Display logic for the player
 */
const PlayerOSD = (() => {
  let _osdTimer = null;

  function show(currentCh) {
    if (!currentCh) return;
    const osd = document.getElementById('player-osd');
    if (!osd) return;

    const logo = document.getElementById('osd-logo');
    if (logo) {
      if (currentCh.logo) { logo.src = currentCh.logo; logo.style.display = 'block'; }
      else { logo.style.display = 'none'; }
    }

    const num = document.getElementById('osd-num');
    if (num) {
      const idx = (typeof VirtualList !== 'undefined') ? VirtualList.getFocused() + 1 : currentCh.num;
      if (idx) { num.textContent = idx; num.style.display = 'inline-block'; }
      else { num.style.display = 'none'; }
    }

    const name = document.getElementById('osd-name');
    if (name) name.textContent = currentCh.name || '';

    const favIcon = document.getElementById('osd-fav-icon');
    if (favIcon) {
      if (typeof Favorites !== 'undefined' && Favorites.isFav(currentCh.id)) {
        favIcon.classList.remove('hidden');
      } else {
        favIcon.classList.add('hidden');
      }
    }

    // Fetch and display EPG info
    if (typeof EPG !== 'undefined') {
      _showEPGLoading();

      const targetCh = currentCh;
      EPG.fetchRealEpg(targetCh).then(listings => {
        if (typeof Player !== 'undefined' && Player.getCurrent() && Player.getCurrent().id === targetCh.id) {
          const realData = EPG.parseRealEpg(listings);
          _updateEPGDisplay(realData);
        }
      }).catch(err => {
        console.error('Error loading real EPG:', err);
        if (typeof Player !== 'undefined' && Player.getCurrent() && Player.getCurrent().id === targetCh.id) {
          _updateEPGDisplay(null);
        }
      });
    }

    _updateOSDClock();

    osd.classList.remove('hidden');
    clearTimeout(_osdTimer);

    _osdTimer = setTimeout(() => {
      osd.classList.add('hidden');
    }, 3000);
  }

  function hide() {
    const osd = document.getElementById('player-osd');
    if (osd) osd.classList.add('hidden');
    clearTimeout(_osdTimer);
  }

  function _showEPGLoading() {
    const curTitleEl = document.getElementById('osd-current-title');
    const fillEl = document.getElementById('osd-progress-fill');
    const currentMeta = document.querySelector('.osd-current-meta');
    const nextTitleEl = document.getElementById('osd-next-title');
    const nextMeta = document.querySelector('.osd-next-meta');
    const nextWrap = document.querySelector('.osd-epg-next');
    const epgWrap = document.querySelector('.osd-epg');

    if (epgWrap) epgWrap.style.display = '';
    if (curTitleEl) curTitleEl.textContent = 'Cargando programación...';
    if (fillEl) fillEl.style.width = '0%';
    if (currentMeta) currentMeta.style.display = 'none';

    if (nextTitleEl) nextTitleEl.textContent = 'Cargando programación...';
    if (nextMeta) nextMeta.style.display = 'none';
    if (nextWrap) nextWrap.style.display = 'none';
  }

  function _updateEPGDisplay(epgData) {
    const curStartEl = document.getElementById('osd-current-start');
    const curEndEl = document.getElementById('osd-current-end');
    const curTitleEl = document.getElementById('osd-current-title');
    const fillEl = document.getElementById('osd-progress-fill');
    const nextStartEl = document.getElementById('osd-next-start');
    const nextEndEl = document.getElementById('osd-next-end');
    const nextTitleEl = document.getElementById('osd-next-title');
    const currentMeta = document.querySelector('.osd-current-meta');
    const nextMeta = document.querySelector('.osd-next-meta');
    const nextWrap = document.querySelector('.osd-epg-next');
    const epgWrap = document.querySelector('.osd-epg');

    if (epgWrap) epgWrap.style.display = '';

    if (epgData) {
      const fmtTime = (d) => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      
      if (curStartEl) curStartEl.textContent = fmtTime(epgData.current.start);
      if (curEndEl) curEndEl.textContent = fmtTime(epgData.current.end);
      if (curTitleEl) curTitleEl.textContent = epgData.current.title;
      if (fillEl) fillEl.style.width = `${epgData.current.progress}%`;
      if (currentMeta) currentMeta.style.display = 'inline-flex';
      
      if (epgData.next) {
        if (nextStartEl) nextStartEl.textContent = fmtTime(epgData.next.start);
        if (nextEndEl) nextEndEl.textContent = fmtTime(epgData.next.end);
        if (nextTitleEl) nextTitleEl.textContent = epgData.next.title;
        if (nextMeta) nextMeta.style.display = 'inline-flex';
        if (nextWrap) nextWrap.style.display = '';
      } else {
        if (nextTitleEl) nextTitleEl.textContent = 'Sin información de programa';
        if (nextMeta) nextMeta.style.display = 'none';
        if (nextWrap) nextWrap.style.display = 'none';
      }
    } else {
      if (curTitleEl) curTitleEl.textContent = 'Sin información de programa';
      if (fillEl) fillEl.style.width = '0%';
      if (currentMeta) currentMeta.style.display = 'none';
      
      if (nextTitleEl) nextTitleEl.textContent = 'Sin información de programa';
      if (nextMeta) nextMeta.style.display = 'none';
      if (nextWrap) nextWrap.style.display = 'none';
    }
  }

  function _updateOSDClock() {
    const clockEl = document.getElementById('osd-clock');
    if (clockEl) {
      clockEl.textContent = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    }
  }

  return { show, hide };
})();
