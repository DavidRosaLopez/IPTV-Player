/**
 * info-popup.js — Controlador de la Ficha de Películas y Series
 */
const InfoPopup = (() => {
  let _isVisible = false;
  let _current = null;
  let _data = null;
  let _zone = 'actions'; // 'actions', 'seasons', 'episodes'
  let _actionIdx = 0; // 0: Play, 1: Fav
  let _seasonIdx = 0;
  let _episodeIdx = 0;

  let _seasons = [];
  let _episodesMap = {};

  async function show(ch) {
    if (!ch || (ch.type !== 'vod' && ch.type !== 'series')) return;
    _current = ch;
    _isVisible = true;

    const popup = document.getElementById('info-popup');
    popup.classList.remove('hidden');

    _resetUI();
    document.getElementById('info-title').textContent = ch.name || 'Cargando...';
    if (ch.logo) {
      document.getElementById('info-poster').src = ch.logo;
      document.getElementById('info-popup-bg').style.backgroundImage = `url('${ch.logo}')`;
    }

    const list = Store.get('currentList');
    if (!list) return hide();

    try {
      if (ch.type === 'vod') {
        const idStr = ch.id.replace('vod_', '');
        _data = await Playlist.getVodInfo(list.server, list.user, list.pass, idStr);
        _renderVodData(_data);
      } else if (ch.type === 'series') {
        const idStr = ch.id.replace('series_', '');
        _data = await Playlist.getSeriesInfo(list.server, list.user, list.pass, idStr);
        _renderSeriesData(_data);
      }
    } catch (e) {
      console.error(e);
      document.getElementById('info-plot').textContent = 'Error al cargar la información.';
    }

    _updateFavIcon();
  }

  function hide() {
    _isVisible = false;
    _current = null;
    _data = null;
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

    document.getElementById('info-year').textContent = '';
    document.getElementById('info-duration').textContent = '';
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
    document.getElementById('info-rating').textContent = info.rating ? `⭐ ${info.rating}` : '';
    document.getElementById('info-genre').textContent = info.genre ? `🏷️ ${info.genre}` : '';
    
    document.getElementById('info-plot').textContent = info.plot || info.description || 'Sin sinopsis disponible.';
    document.getElementById('info-director').textContent = info.director || 'Desconocido';
    document.getElementById('info-cast').textContent = info.cast || info.actors || 'Desconocido';

    if (info.movie_image) document.getElementById('info-poster').src = info.movie_image;
    if (info.backdrop_path && info.backdrop_path.length > 0) {
      document.getElementById('info-popup-bg').style.backgroundImage = `url('${info.backdrop_path[0]}')`;
    }
  }

  function _renderSeriesData(d) {
    if (!d || !d.info) return;
    const info = d.info;
    
    document.getElementById('info-title').textContent = info.name || _current.name;
    document.getElementById('info-year').textContent = info.year || info.releaseDate ? `🗓️ ${info.year || info.releaseDate}` : '';
    document.getElementById('info-rating').textContent = info.rating ? `⭐ ${info.rating}` : '';
    document.getElementById('info-genre').textContent = info.genre ? `🏷️ ${info.genre}` : '';
    
    document.getElementById('info-plot').textContent = info.plot || 'Sin sinopsis disponible.';
    document.getElementById('info-director').textContent = info.director || 'Desconocido';
    document.getElementById('info-cast').textContent = info.cast || 'Desconocido';

    if (info.cover) document.getElementById('info-poster').src = info.cover;
    if (info.backdrop_path && info.backdrop_path.length > 0) {
      document.getElementById('info-popup-bg').style.backgroundImage = `url('${info.backdrop_path[0]}')`;
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
      const img = info.cover ? `<img src="${info.cover}" class="info-ep-img" onerror="this.style.display='none'">` : '';
      li.innerHTML = `
        ${img}
        <div class="info-ep-details">
          <div class="info-ep-title">${ep.episode_num}. ${ep.title || 'Episodio ' + ep.episode_num}</div>
          <div class="info-ep-desc">${info.plot || ''}</div>
        </div>
      `;
      list.appendChild(li);
    });

    if (_episodeIdx >= eps.length) _episodeIdx = Math.max(0, eps.length - 1);
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
          _renderSeasons();
          _renderEpisodes();
        }
      } else if (key === 'RIGHT') {
        if (_seasonIdx < _seasons.length - 1) {
          _seasonIdx++;
          _renderSeasons();
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

  function _updateFocus() {
    const btnPlay = document.getElementById('btn-info-play');
    const btnFav = document.getElementById('btn-info-fav');
    btnPlay.classList.toggle('focused', _zone === 'actions' && _actionIdx === 0 && _current.type === 'vod');
    btnFav.classList.toggle('focused', _zone === 'actions' && (_actionIdx === 1 || _current.type === 'series'));

    const seasonItems = document.querySelectorAll('#info-seasons-list li');
    seasonItems.forEach((el, i) => {
      el.classList.toggle('focused', _zone === 'seasons' && i === _seasonIdx);
      if (_zone === 'seasons' && i === _seasonIdx) el.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
    });

    const epItems = document.querySelectorAll('#info-episodes-list li');
    epItems.forEach((el, i) => {
      el.classList.toggle('focused', _zone === 'episodes' && i === _episodeIdx);
      if (_zone === 'episodes' && i === _episodeIdx) el.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    });
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
    if (typeof ViewChannels !== 'undefined') {
      ViewChannels.refreshUI();
    }
  }

  function _executeAction() {
    if (_actionIdx === 0 && _current.type === 'vod') {
      hide();
      Player.play(_current);
    } else if (_actionIdx === 1) {
      _toggleFav();
    }
  }

  function _playEpisode(ep) {
    if (!ep) return;
    const list = Store.get('currentList');
    const ext = ep.container_extension || 'mp4';
    const url = `${list.server}/series/${encodeURIComponent(list.user)}/${encodeURIComponent(list.pass)}/${ep.id}.${ext}`;
    
    // Create a temporary channel object for the episode
    const playCh = {
      id: `ep_${ep.id}`,
      name: `${_current.name} - ${ep.episode_num}. ${ep.title}`,
      url: url,
      logo: _current.logo,
      type: 'series'
    };

    hide();
    Player.play(playCh);
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

  return { show, hide, isVisible: () => _isVisible, handleKey };
})();
