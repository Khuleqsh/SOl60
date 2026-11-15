import { DEFAULT_KEYS, DEFAULT_SETTINGS, DEFAULT_CUSTOM } from '../data/nasaData.js';
import { sanitizeLoadout } from '../data/scienceData.js';
import { prefersReducedMotion, prefersTouch } from '../logic/webgl.js';

// ---------------------------------------------------------------- preferences
const PREF_KEY = 'sol60-red-horizon-v2';
export function loadPrefs() {
  const out = { settings: { ...DEFAULT_SETTINGS }, keys: { ...DEFAULT_KEYS }, custom: { ...DEFAULT_CUSTOM } };
  try {
    out.settings.reducedMotion = prefersReducedMotion();
    out.settings.touchControls = prefersTouch();
    const raw = window.localStorage.getItem(PREF_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      Object.assign(out.settings, p.settings || {});
      Object.assign(out.keys, p.keys || {});
      Object.assign(out.custom, p.custom || {});
      if (!Array.isArray(out.custom.flagColors) || out.custom.flagColors.length !== 3) out.custom.flagColors = [...DEFAULT_CUSTOM.flagColors];
      out.custom.loadout = sanitizeLoadout(out.custom.loadout);
      if (out.keys.crouch === out.keys.mastcam) out.keys.crouch = DEFAULT_KEYS.crouch; // older saves had crouch on C
    }
  } catch {
    /* storage unavailable: defaults */
  }
  return out;
}
export function savePrefs(p) {
  try {
    window.localStorage.setItem(PREF_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

