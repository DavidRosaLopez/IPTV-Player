/**
 * epg.js — XMLTV EPG loader and renderer
 */
const EPG = (() => {
  let _programs = {};   // { channelId: [{start, end, title, desc, category}] }
  let _channels = {};   // { channelId: {name, logo} }
  let _offsetMs = 0;    // EPG view offset in ms

  const SLOT_W = 200;   // px per 30 min
  const ROW_H  = 72;

  // ── LOAD & PARSE XMLTV ──────────────────────────────
  async function load(url, validIds) {
    if (!url) return false;

    // Check cache (12h)
    const cached = Storage.getEpgCache(url);
    if (cached && Date.now() - cached.ts < 12 * 3600 * 1000) {
      _programs = cached.data.programs;
      _channels = cached.data.channels;
      return true;
    }

    try {
      const res  = await fetch(url);
      const text = await res.text();
      await _parseXMLTVString(text, validIds);
      Storage.setEpgCache(url, { programs: _programs, channels: _channels });
      return true;
    } catch (e) {
      console.error('EPG load error', e);
      return false;
    }
  }

  function _unescape(str) {
    if (!str) return '';
    return str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&apos;/g, "'")
              .trim();
  }

  async function _parseXMLTVString(text, validIds) {
    _programs = {};
    _channels = {};

    let chunkCount = 0;

    // 1. Extract Channels
    let chPos = 0;
    while ((chPos = text.indexOf('<channel ', chPos)) !== -1) {
      const endCh = text.indexOf('</channel>', chPos);
      if (endCh === -1) break;

      const chunk = text.substring(chPos, endCh);
      const idMatch = chunk.match(/id=["']([^"']*)["']/);
      if (idMatch) {
        const id = _unescape(idMatch[1]);
        if (!validIds || validIds.has(id)) {
          const nameMatch = chunk.match(/<display-name[^>]*>([\s\S]*?)<\/display-name>/);
          const logoMatch = chunk.match(/<icon[^>]*src=["']([^"']*)["']/);
          _channels[id] = {
            name: nameMatch ? _unescape(nameMatch[1]) : id,
            logo: logoMatch ? logoMatch[1].trim() : ''
          };
        }
      }
      chPos = endCh + 10;
      chunkCount++;
      if (chunkCount % 500 === 0) await new Promise(r => setTimeout(r, 0));
    }

    // 2. Extract Programmes
    let prgPos = 0;
    chunkCount = 0;
    while ((prgPos = text.indexOf('<programme ', prgPos)) !== -1) {
      const endPrg = text.indexOf('</programme>', prgPos);
      if (endPrg === -1) break;
      
      const firstLineEnd = text.indexOf('>', prgPos);
      if (firstLineEnd === -1) break;

      const firstLine = text.substring(prgPos, firstLineEnd);
      const chIdMatch = firstLine.match(/channel=["']([^"']*)["']/);
      
      if (chIdMatch) {
        const chId = _unescape(chIdMatch[1]);
        // FILTER: Skip instantly if channel is not in our loaded M3U
        if (!validIds || validIds.has(chId)) {
          const startMatch = firstLine.match(/start=["']([^"']*)["']/);
          const stopMatch  = firstLine.match(/stop=["']([^"']*)["']/);
          
          if (startMatch && stopMatch) {
            const start = _parseXMLTVDate(startMatch[1]);
            const end   = _parseXMLTVDate(stopMatch[1]);
            
            const chunk = text.substring(firstLineEnd + 1, endPrg);
            const titleMatch = chunk.match(/<title[^>]*>([\s\S]*?)<\/title>/);
            const descMatch  = chunk.match(/<desc[^>]*>([\s\S]*?)<\/desc>/);
            const catMatch   = chunk.match(/<category[^>]*>([\s\S]*?)<\/category>/);

            if (!_programs[chId]) _programs[chId] = [];
            _programs[chId].push({
              start, end,
              title: titleMatch ? _unescape(titleMatch[1]) : '',
              desc: descMatch ? _unescape(descMatch[1]) : '',
              cat: catMatch ? _unescape(catMatch[1]) : ''
            });
          }
        }
      }
      
      prgPos = endPrg + 12;
      chunkCount++;
      // Yield thread every 2000 programs to avoid UI freeze
      if (chunkCount % 2000 === 0) await new Promise(r => setTimeout(r, 0));
    }
  }

  function _parseXMLTVDate(str) {
    if (!str) return null;
    const s = str.trim();
    // format: YYYYMMDDHHmmss +0200
    const tzMatch = s.match(/([+-]\d{2})(\d{2})$/);
    const tz = tzMatch ? `${tzMatch[1]}:${tzMatch[2]}` : 'Z';
    
    const dt = new Date(
      `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(8,10)}:${s.slice(10,12)}:${s.slice(12,14)}${tz}`
    );
    return isNaN(dt) ? null : dt;
  }

  // ── QUERY ────────────────────────────────────────────
  function getNow(epgId) {
    const now = Date.now();
    return ((_programs[epgId] || []).find(p => p.start && p.end &&
      p.start.getTime() <= now && p.end.getTime() >= now)) || null;
  }

  function getNext(epgId) {
    const now  = Date.now();
    const prog = (_programs[epgId] || []).filter(p => p.start && p.start.getTime() > now);
    return prog.length ? prog[0] : null;
  }

  function getForChannel(epgId, fromMs, toMs) {
    return (_programs[epgId] || []).filter(p =>
      p.start && p.end && p.end.getTime() > fromMs && p.start.getTime() < toMs
    );
  }

  // ── RENDER EPG GRID ──────────────────────────────────
  function render(channels, containerId, chColId, timelineId) {
    const grid    = document.getElementById(containerId);
    const chCol   = document.getElementById(chColId);
    const timeline = document.getElementById(timelineId);
    if (!grid || !chCol || !timeline) return;

    const viewStart = Date.now() + _offsetMs;
    const viewEnd   = viewStart + 3 * 3600 * 1000; // 3h window

    // Build timeline
    timeline.innerHTML = '';
    let t = viewStart - (viewStart % (30 * 60 * 1000)); // round to 30min
    while (t < viewEnd) {
      const slot = document.createElement('div');
      slot.className = 'epg-time-slot';
      slot.textContent = _fmt(new Date(t));
      timeline.appendChild(slot);
      t += 30 * 60 * 1000;
    }

    // Build channel col and grid rows
    chCol.innerHTML = '';
    grid.innerHTML  = '';

    channels.forEach(ch => {
      // Channel label
      const row = document.createElement('div');
      row.className = 'epg-channel-row';
      const logo = document.createElement('img');
      logo.className = 'epg-ch-logo';
      logo.src = ch.logo || '';
      logo.onerror = () => { logo.style.display = 'none'; };
      const name = document.createElement('span');
      name.className = 'epg-ch-name';
      name.textContent = ch.name;
      row.appendChild(logo);
      row.appendChild(name);
      chCol.appendChild(row);

      // Programs row
      const gridRow = document.createElement('div');
      gridRow.className = 'epg-row';
      const progs = getForChannel(ch.epgId, viewStart, viewEnd);

      if (progs.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'epg-prog';
        empty.style.width = (SLOT_W * 6) + 'px';
        empty.innerHTML = '<span class="epg-prog-title" style="color:var(--text-dim)">Sin datos EPG</span>';
        gridRow.appendChild(empty);
      } else {
        progs.forEach(p => {
          const ps = Math.max(p.start.getTime(), viewStart);
          const pe = Math.min(p.end.getTime(),   viewEnd);
          const w  = ((pe - ps) / (30 * 60 * 1000)) * SLOT_W;
          const isNow = p.start.getTime() <= Date.now() && p.end.getTime() >= Date.now();

          const el = document.createElement('div');
          el.className = 'epg-prog' + (isNow ? ' now-prog' : '');
          el.style.width = Math.max(w, 40) + 'px';
          el.dataset.title = p.title;
          el.dataset.desc  = p.desc;
          el.dataset.start = p.start.getTime();
          el.dataset.end   = p.end.getTime();
          el.innerHTML = `
            <span class="epg-prog-title">${p.title}</span>
            <span class="epg-prog-time">${_fmt(p.start)} – ${_fmt(p.end)}</span>
          `;
          el.addEventListener('click', () => _showDetail(p, ch));
          gridRow.appendChild(el);
        });
      }
      grid.appendChild(gridRow);
    });

    // Now-line
    const nowOffset = ((Date.now() - viewStart) / (30 * 60 * 1000)) * SLOT_W;
    if (nowOffset >= 0 && nowOffset < SLOT_W * 6) {
      const line = document.createElement('div');
      line.className = 'epg-now-line';
      line.style.left = nowOffset + 'px';
      grid.style.position = 'relative';
      grid.appendChild(line);
    }
  }

  function _showDetail(prog, ch) {
    const el = document.getElementById('epg-detail');
    if (!el) return;
    el.innerHTML = `
      <div class="epg-detail-title">${prog.title}</div>
      <div class="epg-detail-time">${_fmt(prog.start)} – ${_fmt(prog.end)} · ${ch.name}</div>
      <div class="epg-detail-desc">${prog.desc || 'Sin descripción disponible'}</div>
    `;
  }

  function shiftOffset(deltaMs) {
    _offsetMs += deltaMs;
  }
  function resetOffset() { _offsetMs = 0; }

  function _fmt(d) {
    if (!d) return '';
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  return { load, getNow, getNext, render, shiftOffset, resetOffset, getForChannel };
})();
