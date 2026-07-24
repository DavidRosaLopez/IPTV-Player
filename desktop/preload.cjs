const { contextBridge } = require('electron');
const Hls = require('hls.js');

const HlsCtor = Hls?.default || Hls;

function createAvPlayShim() {
  let video = null;
  let hls = null;
  let listener = {};
  let sourceUrl = '';
  let state = 'IDLE';
  let timeTimer = null;

  function ensureVideo() {
    if (video) return video;
    const layer = document.getElementById('video-layer');
    if (!layer) return null;
    const existing = document.getElementById('desktop-video');
    if (existing) {
      video = existing;
      return video;
    }
    const el = document.createElement('video');
    el.id = 'desktop-video';
    el.autoplay = false;
    el.controls = false;
    el.playsInline = true;
    el.preload = 'auto';
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.display = 'block';
    el.style.objectFit = 'contain';
    layer.innerHTML = '';
    layer.appendChild(el);
    video = el;
    wireEvents();
    return video;
  }

  function clearTimer() {
    if (timeTimer) {
      clearInterval(timeTimer);
      timeTimer = null;
    }
  }

  function setState(next) {
    state = next;
  }

  function wireEvents() {
    if (!video) return;
    video.addEventListener('playing', () => {
      setState('PLAYING');
      listener.onbufferingcomplete?.();
      if (!timeTimer) {
        timeTimer = setInterval(() => listener.oncurrentplaytime?.(), 1000);
      }
    });
    video.addEventListener('pause', () => {
      if (state !== 'IDLE') setState('PAUSED');
      clearTimer();
    });
    video.addEventListener('waiting', () => {
      listener.onbufferingstart?.();
      setState('BUFFERING');
    });
    video.addEventListener('ended', () => {
      clearTimer();
      listener.onevent?.('PLAYER_MSG_END_OF_STREAM');
      listener.onstreamcompleted?.();
    });
    video.addEventListener('error', () => {
      listener.onerror?.({ code: 0, message: 'desktop playback error' });
    });
  }

  function attachSource(url) {
    const el = ensureVideo();
    if (!el) return;
    if (hls) {
      hls.destroy();
      hls = null;
    }
    sourceUrl = url;
    if (/\.m3u8(\?|#|$)/i.test(url) && HlsCtor && HlsCtor.isSupported()) {
      hls = new HlsCtor();
      hls.attachMedia(el);
      hls.loadSource(url);
    } else {
      el.src = url;
    }
  }

  return {
    open(url) {
      attachSource(url);
      listener.onbufferingstart?.();
      setState('BUFFERING');
    },
    setListener(next) {
      listener = next || {};
    },
    prepareAsync(success, fail) {
      const el = ensureVideo();
      if (!el) return fail?.();
      const ready = () => success?.();
      if (el.readyState >= 1) {
        ready();
        return;
      }
      el.addEventListener('loadedmetadata', ready, { once: true });
      el.addEventListener('canplay', ready, { once: true });
      setTimeout(ready, 500);
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
    },
    stop() {
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      clearTimer();
      setState('IDLE');
    },
    close() {
      this.stop();
      if (hls) {
        hls.destroy();
        hls = null;
      }
      sourceUrl = '';
    },
    getState() {
      return state;
    },
    getCurrentTime() {
      return Math.floor((video?.currentTime || 0) * 1000);
    },
    getDuration() {
      const duration = video?.duration;
      return Number.isFinite(duration) ? Math.floor(duration * 1000) : 0;
    },
    seekTo(ms) {
      if (video && Number.isFinite(video.duration)) video.currentTime = Math.max(0, ms / 1000);
    },
    jumpForward(ms) {
      if (video) video.currentTime = Math.max(0, video.currentTime + ms / 1000);
    },
    jumpBackward(ms) {
      if (video) video.currentTime = Math.max(0, video.currentTime - ms / 1000);
    },
    setDisplayMethod() {},
    setDisplayRect() {},
    setStreamingProperty() {},
    setTimeoutForBuffering() {},
    setBufferingParam() {},
    getTotalTrackInfo() {
      return [];
    },
    getCurrentStreamInfo() {
      return [];
    },
    setSelectTrack() {},
    getSourceUrl() {
      return sourceUrl;
    }
  };
}

contextBridge.exposeInMainWorld('__IPTV_PLATFORM__', 'windows');
contextBridge.exposeInMainWorld('webapis', { avplay: createAvPlayShim() });

window.addEventListener('DOMContentLoaded', () => {
  const layer = document.getElementById('video-layer');
  if (layer && !document.getElementById('desktop-video')) {
    const video = document.createElement('video');
    video.id = 'desktop-video';
    video.autoplay = false;
    video.controls = false;
    video.playsInline = true;
    video.preload = 'auto';
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.display = 'block';
    video.style.objectFit = 'contain';
    layer.innerHTML = '';
    layer.appendChild(video);
  }
});
