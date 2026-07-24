self.onmessage = function(e) {
  const { content, jobId } = e.data;
  if (!content) {
    self.postMessage({ error: 'No content to parse', jobId });
    return;
  }

  try {
    const channels = parseM3U(content, jobId);
    // Zero-Copy Transfer: Use ArrayBuffer to avoid deep cloning large arrays in memory
    const str = JSON.stringify(channels);
    const buffer = new TextEncoder().encode(str).buffer;
    self.postMessage({ channelsBuffer: buffer, jobId }, [buffer]);
  } catch (error) {
    self.postMessage({ error: error.message, jobId });
  }
};

function normalizeStr(str) {
  return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function detectStreamMeta(...values) {
  const raw = values.filter(Boolean).join(' ').toUpperCase();
  const heightMatch = raw.match(/\b(4320|2160|1440|1080|720|576|480)P?\b/);
  const height = heightMatch ? parseInt(heightMatch[1], 10) : 0;
  const is8K = /\b(8K|4320P?)\b/.test(raw) || height >= 4320;
  const is4K = /\b(4K|UHD|ULTRA\s*HD|2160P?|3840P?)\b/.test(raw) || height >= 2160;
  const isFhd = /\b(FHD|FULL\s*HD|1080P?)\b/.test(raw) || height >= 1080;
  const isHd = isFhd || /\b(HD|720P?)\b/.test(raw) || height >= 720;
  const isHevc = /\b(HEVC|H\.?265|X265|H265)\b/.test(raw);
  const isRaw = /\b(RAW|DIRECT|REMUX|BLURAY|BDREMUX|LOSSLESS)\b/.test(raw);
  return {
    quality: is8K ? '8k' : is4K ? 'uhd' : isFhd ? 'fhd' : isHd ? 'hd' : 'sd',
    codec: isHevc ? 'hevc' : /\b(AVC|H\.?264|X264|H264)\b/.test(raw) ? 'h264' : '',
    isRaw,
    height
  };
}

function cleanTvCategoryName(rawName) {
  if (!rawName) return 'Sin categoría';
  let n = rawName;
  n = n.replace(/^(\[.*?\]|\{.*?\}|\|.*?\||[A-Z0-9]{2,6}\s*[-|:]\s*)\s*/i, '');
  n = n.replace(/^(ESPA[ÑN]A|FRANCE|ITALY|GERMANY|NORDIC|LATINO|DEPORTES|SPORTS|VIP)\s*[-|:]\s*/i, '');
  return n.trim() || rawName;
}

const COUNTRY_MAP = {
  'ES': 'España', 'US': 'USA', 'USA': 'USA', 'UK': 'UK', 'GB': 'UK',
  'FR': 'Francia', 'DE': 'Alemania', 'GER': 'Alemania', 'IT': 'Italia',
  'PT': 'Portugal', 'AR': 'Árabe', 'MX': 'México', 'CO': 'Colombia',
  'CL': 'Chile', 'PE': 'Perú', 'VE': 'Venezuela', 'BR': 'Brasil',
  'LAT': 'Latino', 'TR': 'Turquía', 'PL': 'Polonia', 'RO': 'Rumania',
  'NL': 'Holanda', 'BE': 'Bélgica', 'CH': 'Suiza'
};

// Memoize by group name: most M3U channels share groups, saves 90%+ regex calls
const _countryCache = new Map();

function detectCountry(name, group) {
  const cat = group || '';
  if (_countryCache.has(cat)) return _countryCache.get(cat);

  const chName = name || '';
  const prefixRegex = /^\[?([A-Z]{2,3})\]?[\s*|:.-]/i;
  
  let match = cat.match(prefixRegex) || chName.match(prefixRegex);
  if (match) {
    const code = match[1].toUpperCase();
    if (COUNTRY_MAP[code]) { _countryCache.set(cat, code); return code; }
  }
  
  const catLower = cat.toLowerCase();
  let result = 'OTROS';
  if (catLower.includes('spain') || catLower.includes('españa') || catLower.includes('spanish')) result = 'ES';
  else if (catLower.includes('usa') || catLower.includes('united states') || catLower.includes('english')) result = 'US';
  else if (catLower.includes('france') || catLower.includes('french') || catLower.includes('francia')) result = 'FR';
  else if (catLower.includes('arab') || catLower.includes('arabic')) result = 'AR';
  else if (catLower.includes('germany') || catLower.includes('deutsch') || catLower.includes('germania')) result = 'DE';
  else if (catLower.includes('italy') || catLower.includes('italia') || catLower.includes('italian')) result = 'IT';
  else if (catLower.includes('portugal') || catLower.includes('portuguese')) result = 'PT';
  else if (catLower.includes('latino') || catLower.includes('latin') || catLower.includes('latam')) result = 'LAT';
  
  _countryCache.set(cat, result);
  return result;
}

function parseM3U(m3uText, jobId) {
  const lines = m3uText.split(/\r?\n/);
  const channels = [];
  let currentChannel = null;
  let idCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      currentChannel = { id: 'm3u_' + (idCounter++) };
      
      const logoMatch = line.match(/tvg-logo="([^"]+)"/i);
      if (logoMatch) currentChannel.logo = logoMatch[1];
      
      const groupMatch = line.match(/group-title="([^"]+)"/i);
      let groupName = groupMatch ? groupMatch[1] : 'Sin categoría';
      currentChannel.group = cleanTvCategoryName(groupName);

      const splitComma = line.split(',');
      const rawName = splitComma.length > 1 ? splitComma.slice(1).join(',').trim() : 'Unknown';
      currentChannel.name = rawName;
      currentChannel._search = normalizeStr(rawName);
      currentChannel.countryCode = detectCountry(rawName, groupName);
      currentChannel.type = 'm3u';
      currentChannel.streamMeta = detectStreamMeta(line, rawName, groupName);
      currentChannel._streamMetaText = line;
      
    } else if (line.startsWith('http')) {
      if (currentChannel) {
        currentChannel.url = line;
        currentChannel.streamMeta = detectStreamMeta(currentChannel._streamMetaText, currentChannel.name, currentChannel.group, line);
        delete currentChannel._streamMetaText;
        channels.push(currentChannel);
        currentChannel = null;
      }
    }
    
    // Optional: Send progress every 10,000 lines
    if (i % 10000 === 0 && i > 0) {
      self.postMessage({ progress: Math.round((i / lines.length) * 100), jobId });
    }
  }

  return channels;
}
