/**
 * epg.js — TV Guide (EPG) Utility
 * Fetches and parses real program guide data for live channels from Xtream Codes API
 * Performance: in-memory cache with 5-min TTL to avoid repeated HTTP requests per channel.
 */
import { Store } from './store.js';


export const EPG = (() => {
  const EPG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  const _epgCache = new Map(); // streamId → { data, ts }

  async function fetchRealEpg(ch) {
    if (!ch || !ch.streamId) return null;
    if (typeof Store === 'undefined') return null;
    const list = Store.get('currentList');
    if (!list || list.type !== 'xtream') return null;

    const cacheEntry = _epgCache.get(ch.streamId);
    if (cacheEntry && (Date.now() - cacheEntry.ts) < EPG_CACHE_TTL) {
      return cacheEntry.data;
    }
    
    try {
      const url = `${list.server}/player_api.php?username=${encodeURIComponent(list.user)}&password=${encodeURIComponent(list.pass)}&action=get_short_epg&stream_id=${ch.streamId}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !data.epg_listings || data.epg_listings.length === 0) return null;
      
      _epgCache.set(ch.streamId, { data: data.epg_listings, ts: Date.now() });
      return data.epg_listings;
    } catch (e) {
      console.error('Error fetching real EPG', e);
      return null;
    }
  }

  function parseEPGDate(timestamp, dateStr) {
    if (dateStr) {
      // Parsear formato YYYY-MM-DD HH:MM:SS directamente en zona horaria local
      const m = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
      if (m) {
        return new Date(
          parseInt(m[1], 10),
          parseInt(m[2], 10) - 1,
          parseInt(m[3], 10),
          parseInt(m[4], 10),
          parseInt(m[5], 10),
          parseInt(m[6], 10)
        );
      }
      
      const formatted = dateStr.trim().replace(' ', 'T');
      const parsed = new Date(formatted);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
      const parsedSlash = new Date(dateStr.replace(/-/g, '/'));
      if (!isNaN(parsedSlash.getTime())) {
        return parsedSlash;
      }
    }
    if (timestamp) {
      const ts = parseInt(timestamp);
      if (!isNaN(ts) && ts > 0) {
        return new Date(ts * 1000);
      }
    }
    return null;
  }

  function parseRealEpg(listings) {
    if (!listings || listings.length === 0) return null;
    const now = new Date();
    
    const sanitized = [];
    for (let i = 0; i < listings.length; i++) {
      const item = listings[i];
      const start = parseEPGDate(item.start_timestamp, item.start);
      if (!start) continue;
      
      let end = parseEPGDate(item.stop_timestamp || item.end_timestamp, item.end || item.stop);
      if (!end || isNaN(end.getTime())) {
        end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hora de fallback
      }
      
      sanitized.push({
        title: decodeTitle(item.title),
        start: start,
        end: end
      });
    }
    
    if (sanitized.length === 0) return null;
    
    // Ordenar por hora de inicio
    sanitized.sort((a, b) => a.start.getTime() - b.start.getTime());
    
    let currentIdx = -1;
    for (let i = 0; i < sanitized.length; i++) {
      if (sanitized[i].start <= now && now < sanitized[i].end) {
        currentIdx = i;
        break;
      }
    }
    
    if (currentIdx === -1) {
      const firstFutureIdx = sanitized.findIndex(l => l.start > now);
      if (firstFutureIdx >= 0) {
        return {
          current: {
            title: sanitized[firstFutureIdx].title,
            start: sanitized[firstFutureIdx].start,
            end: sanitized[firstFutureIdx].end,
            progress: 0
          },
          next: sanitized[firstFutureIdx + 1] ? {
            title: sanitized[firstFutureIdx + 1].title,
            start: sanitized[firstFutureIdx + 1].start,
            end: sanitized[firstFutureIdx + 1].end
          } : null
        };
      }
      return null;
    }
    
    const curProg = sanitized[currentIdx];
    const totalMs = curProg.end.getTime() - curProg.start.getTime();
    const elapsedMs = now.getTime() - curProg.start.getTime();
    const progress = Math.min(100, Math.max(0, Math.round((elapsedMs / totalMs) * 100)));
    
    return {
      current: {
        title: curProg.title,
        start: curProg.start,
        end: curProg.end,
        progress: progress
      },
      next: sanitized[currentIdx + 1] ? {
        title: sanitized[currentIdx + 1].title,
        start: sanitized[currentIdx + 1].start,
        end: sanitized[currentIdx + 1].end
      } : null
    };
  }
  
  function decodeTitle(title) {
    if (!title) return '';
    try {
      return decodeURIComponent(atob(title).split('').map(function(c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
    } catch (e) {
      return title;
    }
  }

  return { fetchRealEpg, parseRealEpg };
})();
