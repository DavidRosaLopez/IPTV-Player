/**
 * epg.js — TV Guide (EPG) Simulator & Utility
 * Generates realistic program guide data for live channels
 */
const EPG = (() => {
  const SPORTS_PROGS = [
    { title: "LaLiga Show — Especial Jornada", duration: 60 },
    { title: "En Directo: DAZN LaLiga — Partido destacado", duration: 120 },
    { title: "El Post de DAZN — Resumen y Análisis", duration: 90 },
    { title: "LaLiga Chronicles — Reportaje especial", duration: 30 },
    { title: "Highlights LaLiga — Los mejores goles", duration: 60 },
    { title: "Planeta Fútbol — Debate internacional", duration: 90 },
    { title: "Entrevista exclusiva con leyendas del fútbol", duration: 45 }
  ];

  const GENERAL_PROGS = [
    { title: "Noticias 24h: Edición Central", duration: 30 },
    { title: "Cine de Estreno: Acción y Suspenso", duration: 120 },
    { title: "Documentales: Expedición en la Sabana", duration: 60 },
    { title: "El Club de la Comedia — Especial", duration: 90 },
    { title: "Show Late Night con estrellas de música", duration: 75 },
    { title: "Magazine Matinal: Actualidad y Entrevistas", duration: 180 },
    { title: "Serie Drama: Secretos del Pasado", duration: 60 }
  ];

  function getPrograms(ch) {
    if (!ch) return null;
    const name = (ch.name || '').toUpperCase();
    
    // Generación determinista basada en el ID del canal, día y hora actual
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDate();
    const seed = (ch.id || 0) + currentHour + currentDay;

    let list = GENERAL_PROGS;
    const isSports = name.includes('DAZN') || 
                     name.includes('LIGA') || 
                     name.includes('FUTBOL') || 
                     name.includes('SPORT') || 
                     name.includes('DEPORTES') || 
                     name.includes('MOVISTAR PLUS+');
                     
    if (isSports) {
      list = SPORTS_PROGS;
    }

    if (name.includes('SIN GUIA') || name.includes('NO EPG') || (ch.id && ch.id % 8 === 0)) {
      return null;
    }

    const idxCurrent = seed % list.length;
    const idxNext = (seed + 1) % list.length;

    const progCurrentTemplate = list[idxCurrent];
    const progNextTemplate = list[idxNext];

    // Computar tiempos de inicio y fin alineados
    const currentStart = new Date(now);
    currentStart.setMinutes(0);
    currentStart.setSeconds(0);
    currentStart.setMilliseconds(0);
    
    // Restar desfase determinista de minutos
    const offsetMin = (seed % 4) * 15; // 0, 15, 30, o 45 minutos
    currentStart.setMinutes(currentStart.getMinutes() - offsetMin);

    const currentEnd = new Date(currentStart);
    currentEnd.setMinutes(currentStart.getMinutes() + progCurrentTemplate.duration);

    // Si por algún desfase el programa ya terminó, forzar a que empiece ahora
    if (currentEnd <= now) {
      currentStart.setTime(now.getTime() - 10 * 60 * 1000); // Empezó hace 10 min
      currentEnd.setTime(currentStart.getTime() + progCurrentTemplate.duration * 60 * 1000);
    }

    const nextStart = new Date(currentEnd);
    const nextEnd = new Date(nextStart);
    nextEnd.setMinutes(nextStart.getMinutes() + progNextTemplate.duration);

    // Calcular el porcentaje de progreso
    const totalMs = currentEnd.getTime() - currentStart.getTime();
    const elapsedMs = now.getTime() - currentStart.getTime();
    const progress = Math.min(100, Math.max(0, Math.round((elapsedMs / totalMs) * 100)));

    let titleCurrent = progCurrentTemplate.title;
    let titleNext = progNextTemplate.title;

    // Caso de prueba específico: DAZN LaLiga
    if (name.includes('DAZN LA LIGA') || name.includes('DAZN LALIGA') || name.includes('LALIGA 1') || name.includes('LA LIGA 1')) {
      if (idxCurrent % 2 === 0) {
        titleCurrent = "En Directo: DAZN LaLiga 1 — Real Madrid vs FC Barcelona";
        titleNext = "El Post de DAZN: Especial El Clásico";
      } else {
        titleCurrent = "LaLiga Show — Especial Derbi Madrileño";
        titleNext = "En Directo: DAZN LaLiga 1 — Atlético de Madrid vs Athletic Club";
      }
    }

    return {
      current: {
        title: titleCurrent,
        start: currentStart,
        end: currentEnd,
        progress: progress
      },
      next: {
        title: titleNext,
        start: nextStart,
        end: nextEnd
      }
    };
  }

  async function fetchRealEpg(ch) {
    if (!ch || !ch.streamId) return null;
    if (typeof Store === 'undefined') return null;
    const list = Store.get('currentList');
    if (!list || list.type !== 'xtream') return null;
    
    try {
      const url = `${list.server}/player_api.php?username=${encodeURIComponent(list.user)}&password=${encodeURIComponent(list.pass)}&action=get_short_epg&stream_id=${ch.streamId}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !data.epg_listings || data.epg_listings.length === 0) return null;
      
      return data.epg_listings;
    } catch (e) {
      console.error('Error fetching real EPG', e);
      return null;
    }
  }

  function parseRealEpg(listings) {
    if (!listings || listings.length === 0) return null;
    const now = new Date();
    
    // Ordenar listings por timestamp de inicio por seguridad
    listings.sort((a, b) => parseInt(a.start_timestamp) - parseInt(b.start_timestamp));
    
    let currentIdx = -1;
    for (let i = 0; i < listings.length; i++) {
      const start = new Date(parseInt(listings[i].start_timestamp) * 1000);
      const end = new Date(parseInt(listings[i].end_timestamp) * 1000);
      if (start <= now && now < end) {
        currentIdx = i;
        break;
      }
    }
    
    if (currentIdx === -1) {
      // Si ninguno coincide con la hora actual, busca el primero en el futuro
      const firstFutureIdx = listings.findIndex(l => new Date(parseInt(l.start_timestamp) * 1000) > now);
      if (firstFutureIdx >= 0) {
        const item = listings[firstFutureIdx];
        const start = new Date(parseInt(item.start_timestamp) * 1000);
        const end = new Date(parseInt(item.end_timestamp) * 1000);
        return {
          current: {
            title: decodeTitle(item.title),
            start,
            end,
            progress: 0
          },
          next: listings[firstFutureIdx + 1] ? {
            title: decodeTitle(listings[firstFutureIdx + 1].title),
            start: new Date(parseInt(listings[firstFutureIdx + 1].start_timestamp) * 1000),
            end: new Date(parseInt(listings[firstFutureIdx + 1].end_timestamp) * 1000)
          } : null
        };
      }
      return null;
    }
    
    const curItem = listings[currentIdx];
    const curStart = new Date(parseInt(curItem.start_timestamp) * 1000);
    const curEnd = new Date(parseInt(curItem.end_timestamp) * 1000);
    const totalMs = curEnd.getTime() - curStart.getTime();
    const elapsedMs = now.getTime() - curStart.getTime();
    const progress = Math.min(100, Math.max(0, Math.round((elapsedMs / totalMs) * 100)));
    
    const nextItem = listings[currentIdx + 1];
    let next = null;
    if (nextItem) {
      next = {
        title: decodeTitle(nextItem.title),
        start: new Date(parseInt(nextItem.start_timestamp) * 1000),
        end: new Date(parseInt(nextItem.end_timestamp) * 1000)
      };
    }
    
    return {
      current: {
        title: decodeTitle(curItem.title),
        start: curStart,
        end: curEnd,
        progress
      },
      next
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

  return { getPrograms, fetchRealEpg, parseRealEpg };
})();
