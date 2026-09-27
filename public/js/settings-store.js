// Ajustes: se guardan en el navegador (invitados) y en el servidor (con cuenta).
import { DEFAULT_SETTINGS, validateSettings } from '/shared/settings-schema.js';

const KEY = 'jaha.settings';

export function storageGet(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

export function storageSet(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* modo privado */
  }
}

export function loadLocalSettings() {
  try {
    return validateSettings(JSON.parse(storageGet(KEY, '{}')));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveLocalSettings(s) {
  storageSet(KEY, JSON.stringify(s));
}

/** Aplica los ajustes que afectan al DOM (tema, lado del joystick, etc.). */
export function applySettingsToDom(s) {
  const b = document.body;
  b.classList.remove('theme-dark', 'theme-light', 'theme-tierra');
  b.classList.add(`theme-${s.theme}`);
  b.classList.toggle('joy-right', s.joystickSide === 'right');
  document.documentElement.style.setProperty('--btn-scale', { s: 0.85, m: 1, l: 1.2 }[s.buttonSize] || 1);
  const mm = document.getElementById('minimap');
  if (mm) mm.hidden = !s.showMinimap;
  const chat = document.getElementById('chat');
  if (chat) chat.style.display = s.showChat ? '' : 'none';
  const fps = document.getElementById('fps');
  if (fps) fps.hidden = !s.showFps;
  const joy = document.getElementById('joystick');
  if (joy) joy.classList.toggle('fixed', s.joystickMode === 'fixed');
}
