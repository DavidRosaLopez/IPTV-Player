const { contextBridge, ipcRenderer } = require('electron');
const Hls = require('hls.js');

const HlsCtor = Hls?.default || Hls;

function emitBack() {
  document.dispatchEvent(new Event('iptv-back'));
}

function bindDesktopBackGestures() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.keyCode === 27) {
      e.preventDefault();
      e.stopPropagation();
      emitBack();
    }
  }, true);

  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    emitBack();
  }, true);
}

function exposeDisplayMetrics() {
  const bridge = {
    getInitialMetrics() {
      try {
        return ipcRenderer.sendSync('iptv-get-display-metrics');
      } catch {
        return null;
      }
    },
    onMetricsChanged(callback) {
      if (typeof callback !== 'function') return () => {};
      const handler = (_event, metrics) => callback(metrics);
      ipcRenderer.on('iptv-display-metrics', handler);
      return () => ipcRenderer.removeListener('iptv-display-metrics', handler);
    }
  };
  contextBridge.exposeInMainWorld('__IPTV_DESKTOP__', bridge);
  contextBridge.exposeInMainWorld('__IPTV_WINDOW_METRICS__', bridge.getInitialMetrics());
}

function createAvPlayShim() {
  let video = null;
  let hls = null;
  let listener = {};
  let state = 'IDLE';
  let sourceUrl = '';
  let timeTimer = null;
  let wired = false;

  const ensureVideo = () => {
    if (video) return video;
    const layer = document.getElementById('video-layer');
    if (!layer) return null;
    const existing = document.getElementById('desktop-video');
    if (existing) {
      video = existing;
      wireEvents();
      return video;
    }
    const el = document.createElement('video');
    el.id = 'desktop-video';
    el.autoplay = false;
    el.controls = false;
    el.playsInline = true;
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    el.disablePictureInPicture = true;
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.display = 'block';
    el.style.objectFit = 'contain';
    layer.replaceChildren(el);
    video = el;
    wireEvents();
    return video;
  };

  const clearTimer = () => {
    if (!timeTimer) return;
    clearInterval(timeTimer);
    timeTimer = null;
  };

  const setState = next => {
    state = next;
  };

  const emitPlaytime = () => listener.oncurrentplaytime?.();

  const wireEvents = () => {
    if (wired || !video) return;
    wired = true;
    video.addEventListener('loadedmetadata', () => {
      listener.onbufferingcomplete?.();
      emitPlaytime();
    });
    video.addEventListener('canplay', () => listener.onbufferingcomplete?.());
    video.addEventListener('playing', () => {
      setState('PLAYING');
      listener.onbufferingcomplete?.();
      clearTimer();
      timeTimer = setInterval(emitPlaytime, 1000);
    });
    video.addEventListener('pause', () => {
      if (state !== 'IDLE') setState('PAUSED');
      clearTimer();
    });
    video.addEventListener('waiting', () => {
      setState('BUFFERING');
      listener.onbufferingstart?.();
    });
    video.addEventListener('stalled', () => {
      setState('BUFFERING');
      listener.onbufferingstart?.();
    });
    video.addEventListener('seeking', () => listener.onbufferingstart?.());
    video.addEventListener('seeked', () => {
      if (state !== 'IDLE') setState('PLAYING');
      listener.onbufferingcomplete?.();
      emitPlaytime();
    });
    video.addEventListener('timeupdate', emitPlaytime);
    video.addEventListener('ended', () => {
      clearTimer();
      listener.onevent?.('PLAYER_MSG_END_OF_STREAM');
      listener.onstreamcompleted?.();
    });
    video.addEventListener('error', () => {
      clearTimer();
      listener.onerror?.({ code: video?.error?.code || 0, message: 'desktop playback error' });
    });
  };

  const destroyHls = () => {
    if (!hls) return;
    hls.destroy();
    hls = null;
  };

  const toWindowsCandidateUrls = (url) => {
    const urls = [url];
    if (/\.ts(\?|#|$)/i.test(url)) {
      urls.unshift(url.replace(/\.ts(\?|#|$)/i, '.m3u8$1'));
    }
    return [...new Set(urls)];
  };

  const attachSource = url => {
    const el = ensureVideo();
    if (!el) return;
    destroyHls();
    sourceUrl = url;
    el.pause();
    el.removeAttribute('src');
    el.load();

    const candidates = toWindowsCandidateUrls(url);
    const isHls = /\.m3u8(\?|#|$)/i.test(candidates[0]);
    const canPlayNativeHls = typeof el.canPlayType === 'function'
      && (el.canPlayType('application/vnd.apple.mpegurl') || el.canPlayType('application/x-mpegURL'));

    if (isHls && HlsCtor && HlsCtor.isSupported() && !canPlayNativeHls) {
      hls = new HlsCtor({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        capLevelToPlayerSize: true,
        startLevel: -1
      });
      hls.on(HlsCtor.Events.ERROR, (_event, data) => {
        if (data?.fatal) listener.onerror?.(data);
      });
      hls.attachMedia(el);
      hls.loadSource(candidates[0]);
      return;
    }

    el.src = candidates[0];
  };

  const currentTimeMs = () => Math.max(0, Math.floor((video?.currentTime || 0) * 1000));
  const setTimeMs = ms => {
    if (!video) return;
    const next = Math.max(0, ms / 1000);
    if (Number.isFinite(video.duration)) {
      video.currentTime = Math.min(next, Math.max(0, video.duration - 0.1));
    } else {
      video.currentTime = next;
    }
  };

  const trackInfo = kind => {
    if (!video) return [];
    const list = kind === 'AUDIO' ? video.audioTracks : video.textTracks;
    if (!list) return [];
    return Array.from(list).map((track, index) => ({
      type: kind,
      index,
      name: track.label || track.language || `Track ${index + 1}`,
      language: track.language || '',
      extra_info: {
        language: track.language || '',
        label: track.label || '',
        enabled: !!track.enabled,
        mode: track.mode || ''
      }
    }));
  };

  return {
    open(url) {
      attachSource(url);
      setState('BUFFERING');
      listener.onbufferingstart?.();
    },
    setListener(next) {
      listener = next || {};
    },
    prepareAsync(success, fail) {
      const el = ensureVideo();
      if (!el) return fail?.();
      if (el.readyState >= 1) {
        success?.();
        return;
      }
      const done = () => success?.();
      el.addEventListener('loadedmetadata', done, { once: true });
      el.addEventListener('canplay', done, { once: true });
      setTimeout(done, 700);
    },
    play() {
      const el = ensureVideo();
      if (!el) return;
      el.play().catch(() => {});
      setState('PLAYING');
    },
    pause() {
      video?.pause();
      setState('PAUSED');
      clearTimer();
    },
    stop() {
      clearTimer();
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      destroyHls();
      sourceUrl = '';
      setState('IDLE');
    },
    close() {
      this.stop();
    },
    getState() {
      return state;
    },
    getCurrentTime() {
      return currentTimeMs();
    },
    getDuration() {
      const duration = video?.duration;
      return Number.isFinite(duration) ? Math.floor(duration * 1000) : 0;
    },
    seekTo(ms) {
      setTimeMs(ms);
      emitPlaytime();
    },
    jumpForward(ms) {
      setTimeMs(currentTimeMs() + ms);
      emitPlaytime();
    },
    jumpBackward(ms) {
      setTimeMs(currentTimeMs() - ms);
      emitPlaytime();
    },
    setDisplayMethod() {},
    setDisplayRect() {},
    setStreamingProperty() {},
    setTimeoutForBuffering() {},
    setBufferingParam() {},
    getTotalTrackInfo() {
      return [...trackInfo('AUDIO'), ...trackInfo('TEXT')];
    },
    getCurrentStreamInfo() {
      return [...trackInfo('AUDIO'), ...trackInfo('TEXT')];
    },
    setSelectTrack(kind, index) {
      if (!video) return;
      if (kind === 'AUDIO' && video.audioTracks && video.audioTracks[index]) {
        Array.from(video.audioTracks).forEach((track, i) => {
          track.enabled = i === index;
        });
      }
      if (kind === 'TEXT' && video.textTracks && video.textTracks[index]) {
        Array.from(video.textTracks).forEach((track, i) => {
          track.mode = i === index ? 'showing' : 'disabled';
        });
      }
    },
    getSourceUrl() {
      return sourceUrl;
    }
  };
}

contextBridge.exposeInMainWorld('__IPTV_PLATFORM__', 'windows');
contextBridge.exposeInMainWorld('webapis', { avplay: createAvPlayShim() });

window.addEventListener('DOMContentLoaded', () => {
  const layer = document.getElementById('video-layer');
  if (!layer || document.getElementById('desktop-video')) return;
  const video = document.createElement('video');
  video.id = 'desktop-video';
  video.autoplay = false;
  video.controls = false;
  video.playsInline = true;
  video.preload = 'auto';
  video.crossOrigin = 'anonymous';
  video.disablePictureInPicture = true;
  video.style.width = '100%';
  video.style.height = '100%';
  video.style.display = 'block';
  video.style.objectFit = 'contain';
  layer.replaceChildren(video);
});

bindDesktopBackGestures();
exposeDisplayMetrics();
