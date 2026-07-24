const detectPlatform = () => {
  const explicit = globalThis.__IPTV_PLATFORM__;
  if (explicit) return String(explicit).toLowerCase();
  if (typeof navigator !== 'undefined' && /tizen/i.test(navigator.userAgent || '')) return 'tizen';
  if (typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent || '')) return 'windows';
  return 'web';
};

const name = detectPlatform();

export const Platform = Object.freeze({
  name,
  isWindows: name === 'windows',
  isTizen: name === 'tizen',
  isWeb: name === 'web',
  isDesktop: name === 'windows' || name === 'web'
});
