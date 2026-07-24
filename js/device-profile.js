/**
 * device-profile.js — Centralized TV tuning for the target Samsung model
 */
import { Platform } from './platform.js';

const OVERRIDE = (typeof window !== 'undefined' && window.__IPTV_DEVICE_PROFILE__) || {};

const BASE = {
  name: Platform.isWindows ? 'Windows Desktop' : 'Samsung 83" SF93',
  model: Platform.isWindows ? 'electron-portable' : 'TQ83S91FAEXXC',
  family: Platform.isWindows ? 'desktop' : 'S91F',
  platformYear: 2025,
  layoutResolution: { width: 1920, height: 1080 },
  panelResolution: { width: 3840, height: 2160 },
  safeArea: { x: 0, y: 0, width: 1920, height: 1080 },
  pip: { x: 1400, y: 770, width: 480, height: 270 },
  panelScale: { x: 2, y: 2 },
  key: {
    navThrottleMs: 90,
    longOkMs: 600
  },
  player: {
    liveMaxBitrate: {
      raw: 25000000,
      hd: 50000000,
      uhd: 100000000,
      uhd8k: 150000000
    },
    pipAdaptiveInfo: 'STARTBITRATE=LOWEST|MAXBITRATE=3000000',
    defaultAdaptiveInfo: 'STARTBITRATE=HIGHEST',
    lowBufferSeconds: 5,
    highBufferSeconds: 10,
    bufferingTimeoutMs: 5000,
    heavyBufferingTimeoutMs: 10000,
    resolutionMarker: '4k',
    pipPreviewDelayMs: 900
  },
  prefetch: {
    delayMs: 12000,
    idleGraceMs: 2500,
    betweenTabsDelayMs: 3000
  },
  virtualList: {
    imageConcurrency: 3,
    logoPauseAfterNavMs: 180
  }
};

function merge(base, override) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value) && base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) {
      out[key] = merge(base[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export const DeviceProfile = Object.freeze(merge(BASE, OVERRIDE));

export function getDisplayRect(mode = 'FULLSCREEN') {
  if (mode === 'PIP') return { ...DeviceProfile.pip };
  return { ...DeviceProfile.safeArea };
}

export function getAdaptiveLimits(kind = 'default') {
  return {
    defaultAdaptiveInfo: DeviceProfile.player.defaultAdaptiveInfo,
    pipAdaptiveInfo: DeviceProfile.player.pipAdaptiveInfo,
    maxBitrate: DeviceProfile.player.liveMaxBitrate[kind] || DeviceProfile.player.liveMaxBitrate.raw
  };
}
