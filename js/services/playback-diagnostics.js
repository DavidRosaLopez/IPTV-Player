const MAX_EVENTS = 80;
const events = [];

function add(type, channel, detail = '') {
  events.unshift({
    time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    type,
    channel: String(channel?.name || '—').slice(0, 70),
    detail: String(detail || '').replace(/https?:\/\/\S+/gi, '[URL oculta]').slice(0, 120)
  });
  if (events.length > MAX_EVENTS) events.pop();
}

function getAll() { return [...events]; }
function clear() { events.length = 0; }

export const PlaybackDiagnostics = { add, getAll, clear };
