export const COUNTRY_INFO = Object.freeze({
  ALL:   { emoji: '\u{1F30E}', name: 'Todos' },
  ES:    { emoji: '\u{1F1EA}\u{1F1F8}', name: 'Espa\u00f1a' },
  US:    { emoji: '\u{1F1FA}\u{1F1F8}', name: 'USA' },
  UK:    { emoji: '\u{1F1EC}\u{1F1E7}', name: 'UK' },
  FR:    { emoji: '\u{1F1EB}\u{1F1F7}', name: 'Francia' },
  DE:    { emoji: '\u{1F1E9}\u{1F1EA}', name: 'Alemania' },
  IT:    { emoji: '\u{1F1EE}\u{1F1F9}', name: 'Italia' },
  PT:    { emoji: '\u{1F1F5}\u{1F1F9}', name: 'Portugal' },
  AR:    { emoji: '\u{1F1F8}\u{1F1E6}', name: '\u00c1rabe' },
  MX:    { emoji: '\u{1F1F2}\u{1F1FD}', name: 'M\u00e9xico' },
  CO:    { emoji: '\u{1F1E8}\u{1F1F4}', name: 'Colombia' },
  CL:    { emoji: '\u{1F1E8}\u{1F1F1}', name: 'Chile' },
  PE:    { emoji: '\u{1F1F5}\u{1F1EA}', name: 'Per\u00fa' },
  VE:    { emoji: '\u{1F1FB}\u{1F1EA}', name: 'Venezuela' },
  BR:    { emoji: '\u{1F1E7}\u{1F1F7}', name: 'Brasil' },
  LAT:   { emoji: '\u{1F30E}', name: 'Latino' },
  TR:    { emoji: '\u{1F1F9}\u{1F1F7}', name: 'Turqu\u00eda' },
  PL:    { emoji: '\u{1F1F5}\u{1F1F1}', name: 'Polonia' },
  RO:    { emoji: '\u{1F1F7}\u{1F1F4}', name: 'Rumania' },
  NL:    { emoji: '\u{1F1F3}\u{1F1F1}', name: 'Holanda' },
  BE:    { emoji: '\u{1F1E7}\u{1F1EA}', name: 'B\u00e9lgica' },
  CH:    { emoji: '\u{1F1E8}\u{1F1ED}', name: 'Suiza' },
  OTROS: { emoji: '\u{1F310}', name: 'Otros' }
});

const COUNTRY_ALIASES = Object.freeze({
  USA: 'US',
  GB: 'UK',
  GER: 'DE'
});

export function normalizeCountryCode(code) {
  const upper = String(code || '').toUpperCase();
  const normalized = COUNTRY_ALIASES[upper] || upper;
  return COUNTRY_INFO[normalized] ? normalized : null;
}

export function getCountryInfo(code) {
  return COUNTRY_INFO[code] || { emoji: '\u{1F3F3}\uFE0F', name: code || 'Otros' };
}

export function getCountryName(code) {
  return getCountryInfo(code).name;
}

export function sortCountryCodes(codes) {
  const sorted = Array.from(codes).sort((a, b) => getCountryName(a).localeCompare(getCountryName(b)));
  const otherIdx = sorted.indexOf('OTROS');
  if (otherIdx >= 0) {
    sorted.splice(otherIdx, 1);
    sorted.push('OTROS');
  }
  return sorted;
}
