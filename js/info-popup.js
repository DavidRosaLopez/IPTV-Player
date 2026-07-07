/**
 * info-popup.js — Controlador de la Ficha de Películas y Series
 */
import { Store } from './store.js';
import { Storage } from './storage.js';
import { Router } from './router.js';
import { Favorites } from './favorites.js';
import { Playlist } from './playlist.js';
import { Watching } from './watching.js';
import { eventBus } from './eventBus.js';


export const InfoPopup = (() => {
  let _isVisible = false;
  let _current = null;
  let _data = null;
  let _zone = 'actions'; // 'actions', 'seasons', 'episodes'
  let _actionIdx = 0; // 0: Play, 1: Fav
  let _seasonIdx = 0;
  let _episodeIdx = 0;

  let _seasons = [];
  let _episodesMap = {};

  function _requestPlay(ch) { eventBus.emit('player:play-requested', ch); }
  function _requestStop() { eventBus.emit('player:stop-requested'); }
  function _requestChannelsRefresh() { eventBus.emit('channels:refresh-requested'); }
  function _requestGroupsRender() { eventBus.emit('channels:render-groups-requested'); }
  function _escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }
  function _safeMediaUrl(value) {
    const url = String(value || '').trim();
    if (/^(https?:|data:image\/)/i.test(url)) return url;
    return '';
  }
  function _setImage(id, url) {
    const safe = _safeMediaUrl(url);
    const el = document.getElementById(id);
    if (el && safe) el.src = safe;
  }
  function _setBackground(id, url) {
    const safe = _safeMediaUrl(url).replace(/["\\\r\n]/g, '');
    const el = document.getElementById(id);
    if (el && safe) el.style.backgroundImage = `url("${safe}")`;
  }

  async function show(ch) {
    if (!ch || (ch.type !== 'vod' && ch.type !== 'series')) return;
    _current = ch;
    _isVisible = true;

    const popup = document.getElementById('info-popup');
    popup.classList.remove('hidden');

    _resetUI();
    document.getElementById('info-title').textContent = ch.name || 'Cargando...';
    if (ch.logo) {
      _setImage('info-poster', ch.logo);
      _setBackground('info-popup-bg', ch.logo);
    }

    const list = Store.get('currentList');
    if (!list) return hide();

    try {
      if (ch.type === 'vod') {
        const idStr = ch.id.replace('vod_', '');
        const data = await Playlist.getVodInfo(list.server, list.user, list.pass, idStr);
        if (_current !== ch) return; // Prevent race condition if user closed/changed before load
        _data = data;
        _renderVodData(_data);
        if (_data && _data.info && _data.info.name) {
          document.getElementById('info-title').textContent = _data.info.name;
        }
      } else if (ch.type === 'series') {
        const idStr = ch.id.replace('series_', '');
        const data = await Playlist.getSeriesInfo(list.server, list.user, list.pass, idStr);
        if (_current !== ch) return; // Prevent race condition if user closed/changed before load
        _data = data;
        _renderSeriesData(_data);
        if (_data && _data.info && _data.info.name) {
          document.getElementById('info-title').textContent = _data.info.name;
        }
      }
    } catch (e) {
      console.error(e);
      document.getElementById('info-plot').textContent = 'Error al cargar la información.';
    }

    _updateFavIcon();
  }

  let _isSuspended = false;
  let _playingEpisode = null;

  function _focusPlayingEpisode() {
    if (!_playingEpisode || _seasons.length === 0) return;
    for (let sIdx = 0; sIdx < _seasons.length; sIdx++) {
      const sNum = _seasons[sIdx].season_number;
      const eps = _episodesMap[sNum] || [];
      const eIdx = eps.findIndex(e => String(e.id) === String(_playingEpisode.id));
      if (eIdx !== -1) {
        _seasonIdx = sIdx;
        _episodeIdx = eIdx;
        _zone = 'episodes';
        _updateActiveSeasonClass();
        _renderEpisodes();
        _updateFocus();
        break;
      }
    }
  }

  function suspend() {
    _isVisible = false;
    _isSuspended = true;
    document.getElementById('info-popup').classList.add('hidden');
  }

  function resume() {
    _isVisible = true;
    _isSuspended = false;
    document.getElementById('info-popup').classList.remove('hidden');
    if (_playingEpisode && _current && _current.type === 'series') {
      _focusPlayingEpisode();
    } else {
      _updateFocus();
    }
  }

  function isSuspended() { return _isSuspended; }
  function isVisible() { return _isVisible; }

  function hide() {
    _isVisible = false;
    _isSuspended = false;
    _current = null;
    _data = null;
    _playingEpisode = null;
    document.getElementById('info-popup').classList.add('hidden');
    document.getElementById('info-popup-bg').style.backgroundImage = 'none';
  }

  function _resetUI() {
    _zone = 'actions';
    _actionIdx = _current && _current.type === 'series' ? 1 : 0;
    _seasonIdx = 0;
    _episodeIdx = 0;
    _seasons = [];
    _episodesMap = {};

    document.getElementById('info-seasons-list').innerHTML = '';
    document.getElementById('info-episodes-list').innerHTML = '';

    document.getElementById('info-year').textContent = '';
    document.getElementById('info-duration').textContent = '';
    document.getElementById('info-quality').innerHTML = '';
    document.getElementById('info-rating').textContent = '';
    document.getElementById('info-genre').textContent = '';
    document.getElementById('info-plot').textContent = 'Cargando datos...';
    document.getElementById('info-director').textContent = '';
    document.getElementById('info-cast').textContent = '';
    
    document.getElementById('info-series-container').classList.add('hidden');
    document.getElementById('btn-info-play').style.display = _current.type === 'vod' ? '' : 'none';
    
    _updateFocus();
  }

  function _renderVodData(d) {
    if (!d || !d.info) return;
    const info = d.info;
    
    document.getElementById('info-title').textContent = info.name || _current.name;
    document.getElementById('info-year').textContent = info.releasedate ? `🗓️ ${info.releasedate}` : '';
    document.getElementById('info-duration').textContent = info.duration ? `⏱️ ${info.duration}` : (info.episode_run_time ? `⏱️ ${info.episode_run_time} min` : '');
    
    // Usamos _current.name en vez de info.name porque las etiquetas (FHD, 4K) suelen venir en el nombre original de la playlist, no en la info limpia de TMDB.
    const quality = _detectQuality(_current.name);
    document.getElementById('info-quality').innerHTML = quality.html;
    
    document.getElementById('info-rating').textContent = info.rating ? `⭐ ${info.rating}` : '';
    document.getElementById('info-genre').textContent = info.genre ? `🏷️ ${info.genre}` : '';
    
    document.getElementById('info-plot').textContent = info.plot || info.description || 'Sin sinopsis disponible.';
    document.getElementById('info-director').textContent = info.director || 'Desconocido';
    document.getElementById('info-cast').textContent = info.cast || info.actors || 'Desconocido';

    if (info.movie_image) _setImage('info-poster', info.movie_image);
    if (info.backdrop_path && info.backdrop_path.length > 0) {
      _setBackground('info-popup-bg', info.backdrop_path[0]);
    }
  }

  function _renderSeriesData(d) {
    if (!d || !d.info) return;
    const info = d.info;
    
    document.getElementById('info-title').textContent = info.name || _current.name;
    document.getElementById('info-year').textContent = info.year || info.releaseDate ? `🗓️ ${info.year || info.releaseDate}` : '';
    
    // Usamos _current.name en vez de info.name porque las etiquetas (FHD, 4K) suelen venir en el nombre del archivo de la playlist, no en TMDB.
    const quality = _detectQuality(_current.name);
    document.getElementById('info-quality').innerHTML = quality.html;
    
    document.getElementById('info-rating').textContent = info.rating ? `⭐ ${info.rating}` : '';
    document.getElementById('info-genre').textContent = info.genre ? `🏷️ ${info.genre}` : '';
    
    document.getElementById('info-plot').textContent = info.plot || 'Sin sinopsis disponible.';
    document.getElementById('info-director').textContent = info.director || 'Desconocido';
    document.getElementById('info-cast').textContent = info.cast || 'Desconocido';

    if (info.cover) _setImage('info-poster', info.cover);
    if (info.backdrop_path && info.backdrop_path.length > 0) {
      _setBackground('info-popup-bg', info.backdrop_path[0]);
    }

    // Series lists
    _episodesMap = d.episodes || {};
    _seasons = d.seasons || [];
    
    // Si la API no manda metadata de temporadas pero sí hay episodios, las generamos manualmente
    if ((!_seasons || _seasons.length === 0) && Object.keys(_episodesMap).length > 0) {
      _seasons = Object.keys(_episodesMap).map(k => ({ season_number: k, name: `Temporada ${k}` }));
    }
    
    if (_seasons.length > 0) {
      document.getElementById('info-series-container').classList.remove('hidden');
      _zone = 'seasons'; // Mover foco a temporadas por defecto
      _renderSeasons();
      _renderEpisodes();
      if (_playingEpisode) {
        _focusPlayingEpisode();
      }
    }
    _updateFocus();
  }

  function _renderSeasons() {
    const list = document.getElementById('info-seasons-list');
    list.innerHTML = '';
    _seasons.forEach((s, i) => {
      const li = document.createElement('li');
      li.textContent = s.name || `Temporada ${s.season_number}`;
      if (i === _seasonIdx) li.classList.add('active');
      list.appendChild(li);
    });
  }

  function _updateActiveSeasonClass() {
    const list = document.getElementById('info-seasons-list');
    if (!list) return;
    Array.from(list.children).forEach((li, i) => {
      li.classList.toggle('active', i === _seasonIdx);
    });
  }

  function _renderEpisodes() {
    const list = document.getElementById('info-episodes-list');
    list.innerHTML = '';
    if (_seasons.length === 0) return;
    
    const s = _seasons[_seasonIdx];
    const sNum = s.season_number;
    const eps = _episodesMap[sNum] || [];
    
    eps.forEach((ep, i) => {
      const li = document.createElement('li');
      const info = ep.info || {};
      const epCover = _safeMediaUrl(info.cover);
      const img = epCover ? `<img src="${_escapeHtml(epCover)}" class="info-ep-img" loading="lazy" onerror="this.style.display='none'">` : '';
      let cleanTitle = _escapeHtml(String(info.name || ep.title || 'Episodio ' + ep.episode_num).trim());
      
      // Mostrar progreso guardado si existe
      const epId = `ep_${ep.id}`;
      const savedMs = Storage.getEpisodeProgress(epId);
      let progressHtml = '';
      if (savedMs && savedMs > 10000) {
        const totalSecs = Math.floor(savedMs / 1000);
        const m = Math.floor(totalSecs / 60);
        const s = totalSecs % 60;
        const timeStr = `${m}:${s.toString().padStart(2,'0')}`;
        progressHtml = `<div class="info-ep-progress"><div class="info-ep-progress-fill" style="width:0%" data-ms="${savedMs}"></div></div><span class="info-ep-resume">▶ ${timeStr}</span>`;
      }
      
      li.innerHTML = `
        ${img}
        <div class="info-ep-details">
          <div class="info-ep-title">${ep.episode_num}. ${cleanTitle}</div>
          ${progressHtml}
        </div>
      `;
      list.appendChild(li);
    });

    // Rellenar barras de progreso con % real (necesita getDuration del episodio — se aproxima con el tiempo guardado)
    // Las barras se actualizan con el ancho relativo al máximo de todos los episodios
    if (typeof Storage !== 'undefined') {
      const fills = list.querySelectorAll('.info-ep-progress-fill');
      fills.forEach(fill => {
        const ms = parseInt(fill.dataset.ms || 0);
        // Aproximamos 45 minutos (2700000ms) como duración típica de serie; la barra es orientativa
        const pct = Math.min(100, Math.round((ms / 2700000) * 100));
        fill.style.width = pct + '%';
      });
    }

    if (_episodeIdx >= eps.length) _episodeIdx = Math.max(0, eps.length - 1);
  }

  // ── DETECCIÓN DE CALIDAD ────────────────────────────
  function _detectQuality(name) {
    if (!name) return { html: '<span class="quality-badge quality-sd">SD</span>', quality: 'SD' };
    
    const nameUpper = name.toUpperCase();
    
    // Prioridad de detección: primero las más altas, luego las más bajas
    if (nameUpper.includes('8K') || nameUpper.includes('7680')) {
      return { html: '<span class="quality-badge quality-8k">8K</span>', quality: '8K' };
    }
    
    // 4K y UHD
    if (nameUpper.includes('4K') || nameUpper.includes('2160') || /(?:^|[^A-Z])UHD(?:[^A-Z]|$)/.test(nameUpper)) {
      return { html: '<span class="quality-badge quality-4k">4K</span>', quality: '4K' };
    }
    
    // 1080p, FHD, Bluray
    if (nameUpper.includes('1080') || /(?:^|[^A-Z])(?:FHD|BLURAY|BLU-RAY)(?:[^A-Z]|$)/.test(nameUpper)) {
      if (nameUpper.includes('HDR')) {
        return { html: '<span class="quality-badge quality-1080p-hdr">1080p HDR</span>', quality: '1080p HDR' };
      }
      if (/(?:^|[^A-Z])FHD(?:[^A-Z]|$)/.test(nameUpper)) {
        return { html: '<span class="quality-badge quality-fhd">FHD</span>', quality: 'FHD' };
      }
      return { html: '<span class="quality-badge quality-1080p">1080p</span>', quality: '1080p' };
    }
    
    // 720p, HD, HDTV (Evitamos falsos positivos con regex como 'BIRTHDAY', 'WATCHDOG')
    if (nameUpper.includes('720') || /(?:^|[^A-Z])(?:HD|HDTV)(?:[^A-Z]|$)/.test(nameUpper)) {
      return { html: '<span class="quality-badge quality-720p">720p</span>', quality: '720p' };
    }
    
    // Por defecto, SD (Standard Definition)
    return { html: '<span class="quality-badge quality-sd">SD</span>', quality: 'SD' };
  }

  function handleKey(key) {
    if (!_isVisible) return false;

    if (key === 'BACK') {
      hide();
      return true;
    }

    if (_current.type === 'vod') {
      // VOD solo tiene acciones (Play, Fav)
      if (key === 'LEFT') _actionIdx = 0;
      if (key === 'RIGHT') _actionIdx = 1;
      if (key === 'ENTER') _executeAction();
      _updateFocus();
      return true;
    }

    // SERIES Navigation
    if (_zone === 'actions') {
      if (key === 'LEFT') _actionIdx = 1; // Solo hay un botón visible (Favoritos)
      if (key === 'RIGHT') _actionIdx = 1;
      if (key === 'DOWN') {
        _zone = 'seasons';
      }
      if (key === 'ENTER') {
        if (_actionIdx === 1) _executeAction();
      }
    } else if (_zone === 'seasons') {
      if (key === 'UP') {
        _zone = 'actions';
      } else if (key === 'DOWN') {
        if ((_episodesMap[_seasons[_seasonIdx].season_number] || []).length > 0) {
          _zone = 'episodes';
          _episodeIdx = 0;
        }
      } else if (key === 'LEFT') {
        if (_seasonIdx > 0) {
          _seasonIdx--;
          _updateActiveSeasonClass();
          _renderEpisodes();
        }
      } else if (key === 'RIGHT') {
        if (_seasonIdx < _seasons.length - 1) {
          _seasonIdx++;
          _updateActiveSeasonClass();
          _renderEpisodes();
        }
      }
    } else if (_zone === 'episodes') {
      const eps = _episodesMap[_seasons[_seasonIdx].season_number] || [];
      if (key === 'UP') {
        if (_episodeIdx > 0) {
          _episodeIdx--;
        } else {
          _zone = 'seasons';
        }
      } else if (key === 'DOWN') {
        if (_episodeIdx < eps.length - 1) {
          _episodeIdx++;
        }
      } else if (key === 'ENTER') {
        _playEpisode(eps[_episodeIdx]);
      }
    }

    _updateFocus();
    return true;
  }

  // O(1) Focus tracking variables
  let _lastSeasonIdx = -1;
  let _lastEpisodeIdx = -1;
  let _lastZone = null;

  // FIX 2: Layout thrashing removed, O(1) updates
  function _updateFocus() {
    const btnPlay = document.getElementById('btn-info-play');
    const btnFav = document.getElementById('btn-info-fav');
    btnPlay.classList.toggle('focused', _zone === 'actions' && _actionIdx === 0 && _current.type === 'vod');
    btnFav.classList.toggle('focused', _zone === 'actions' && (_actionIdx === 1 || _current.type === 'series'));

    const seasonItems = document.getElementById('info-seasons-list').children;
    if (_lastZone === 'seasons' && _lastSeasonIdx >= 0 && _lastSeasonIdx < seasonItems.length) {
      seasonItems[_lastSeasonIdx].classList.remove('focused');
    }
    if (_zone === 'seasons' && _seasonIdx >= 0 && _seasonIdx < seasonItems.length) {
      seasonItems[_seasonIdx].classList.add('focused');
      seasonItems[_seasonIdx].scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    
    const epItems = document.getElementById('info-episodes-list').children;
    if ((_lastZone === 'episodes' || _zone !== 'episodes') && _lastEpisodeIdx >= 0 && _lastEpisodeIdx < epItems.length) {
      epItems[_lastEpisodeIdx].classList.remove('focused');
    }
    if (_zone === 'episodes' && _episodeIdx >= 0 && _episodeIdx < epItems.length) {
      epItems[_episodeIdx].classList.add('focused');
      epItems[_episodeIdx].scrollIntoView({ block: 'nearest' });
    }

    _lastZone = _zone;
    _lastSeasonIdx = _seasonIdx;
    _lastEpisodeIdx = _episodeIdx;
  }

  function _updateFavIcon() {
    const isFav = Favorites.getIds().includes(_current.id);
    document.getElementById('info-fav-icon').textContent = isFav ? 'favorite' : 'favorite_border';
    if (isFav) {
      document.getElementById('btn-info-fav').classList.add('active-fav');
    } else {
      document.getElementById('btn-info-fav').classList.remove('active-fav');
    }
  }

  function _toggleFav() {
    Favorites.toggle(_current.id);
    const isFav = Favorites.getIds().includes(_current.id);
    _updateFavIcon();
    
    if (typeof Router !== 'undefined') {
      Router.showToast(isFav ? 'Añadido a Favoritos' : 'Eliminado de Favoritos', isFav ? 'success' : 'info');
    }
    _requestChannelsRefresh();
  }

  function _executeAction() {
    if (_actionIdx === 0 && _current.type === 'vod') {
      Watching.add(_current, null);
      _requestGroupsRender();
      suspend();
      _requestPlay(_current);
    } else if (_actionIdx === 1) {
      _toggleFav();
    }
  }

  function _playEpisode(ep) {
    if (!ep) return;
    _playingEpisode = ep;
    const list = Store.get('currentList');
    const ext = ep.container_extension || 'mp4';
    const url = `${list.server}/series/${encodeURIComponent(list.user)}/${encodeURIComponent(list.pass)}/${ep.id}.${ext}`;
    
    // Guardar en seguir viendo
    Watching.add(_current, ep);
    _requestGroupsRender();

    // Create a temporary channel object for the episode
    const playCh = {
      id: `ep_${ep.id}`,
      seriesId: _current.id, // para Watching.updateProgress()
      name: `${_current.name} - ${ep.episode_num}. ${ep.title}`,
      url: url,
      logo: _current.logo,
      type: 'series'
    };

    suspend();
    _requestPlay(playCh);
  }

  function _getFlattenedEpisodes() {
    const list = [];
    for (let s of _seasons) {
      const eps = _episodesMap[s.season_number] || [];
      for (let ep of eps) {
        list.push(ep);
      }
    }
    return list;
  }

  function playNextEpisode() {
    if (!_playingEpisode || !_current || _current.type !== 'series') return;
    const list = _getFlattenedEpisodes();
    const idx = list.findIndex(ep => String(ep.id) === String(_playingEpisode.id));
    
    let nextEp = null;
    if (idx !== -1) {
      for (let i = idx + 1; i < list.length; i++) {
        if (String(list[i].id) !== String(_playingEpisode.id)) {
          nextEp = list[i];
          break;
        }
      }
    }

    if (nextEp) {
      _playEpisode(nextEp);
    } else {
      _requestStop();
      if (typeof Router !== 'undefined') Router.showView('channels');
      if (isSuspended()) resume();
    }
  }

  function setPlayingEpisode(ep) {
    _playingEpisode = ep;
  }

  function hasNextEpisode() {
    if (!_playingEpisode || !_current || _current.type !== 'series') return false;
    const list = _getFlattenedEpisodes();
    const idx = list.findIndex(ep => String(ep.id) === String(_playingEpisode.id));
    
    if (idx !== -1) {
      for (let i = idx + 1; i < list.length; i++) {
        if (String(list[i].id) !== String(_playingEpisode.id)) {
          return true;
        }
      }
    }
    return false;
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-info-play')?.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (!_isVisible) return;
      _actionIdx = 0;
      _executeAction();
    });
    
    document.getElementById('btn-info-fav')?.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (!_isVisible) return;
      _actionIdx = 1;
      _executeAction();
    });
  });

  eventBus.on('info-popup:resume-requested', () => {
    if (isSuspended()) resume();
  });

  return { show, hide, handleKey, isVisible: () => _isVisible, suspend, resume, isSuspended: () => _isSuspended, playNextEpisode, setPlayingEpisode, hasNextEpisode };
})();
