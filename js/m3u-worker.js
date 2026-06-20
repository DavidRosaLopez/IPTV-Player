self.onmessage = function(e) {
  const { content } = e.data;
  if (!content) {
    self.postMessage({ error: 'No content to parse' });
    return;
  }

  try {
    const channels = parseM3U(content);
    self.postMessage({ channels });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};

function normalizeStr(str) {
  return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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

function detectCountry(name, group) {
  const cat = group || '';
  const chName = name || '';
  const prefixRegex = /^\[?([A-Z]{2,3})\]?[\s*|:.-]/i;
  
  let match = cat.match(prefixRegex) || chName.match(prefixRegex);
  if (match) {
    const code = match[1].toUpperCase();
    if (COUNTRY_MAP[code]) return code;
  }
  
  const catLower = cat.toLowerCase();
  if (catLower.includes('spain') || catLower.includes('españa') || catLower.includes('spanish')) return 'ES';
  if (catLower.includes('usa') || catLower.includes('united states') || catLower.includes('english')) return 'US';
  if (catLower.includes('france') || catLower.includes('french') || catLower.includes('francia')) return 'FR';
  if (catLower.includes('arab') || catLower.includes('arabic')) return 'AR';
  if (catLower.includes('germany') || catLower.includes('deutsch') || catLower.includes('germania')) return 'DE';
  if (catLower.includes('italy') || catLower.includes('italia') || catLower.includes('italian')) return 'IT';
  if (catLower.includes('portugal') || catLower.includes('portuguese')) return 'PT';
  if (catLower.includes('latino') || catLower.includes('latin') || catLower.includes('latam')) return 'LAT';
  
  return 'OTROS';
}

function parseM3U(m3uText) {
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
      
    } else if (line.startsWith('http')) {
      if (currentChannel) {
        currentChannel.url = line;
        channels.push(currentChannel);
        currentChannel = null;
      }
    }
    
    // Optional: Send progress every 10,000 lines
    if (i % 10000 === 0 && i > 0) {
      self.postMessage({ progress: Math.round((i / lines.length) * 100) });
    }
  }

  return channels;
}
