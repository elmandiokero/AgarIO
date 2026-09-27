// Ajustes del jugador: valores por defecto + validación (lista blanca).

export const DEFAULT_SETTINGS = Object.freeze({
  showMass: true,
  showNames: true,
  showSkins: true,
  showGrid: true,
  showMinimap: true,
  showChat: true,
  showFps: false,
  showBotTag: true,
  theme: 'dark', // dark | light | tierra
  quality: 'auto', // auto | high | medium | low
  volume: 0.6,
  vibration: true,
  joystickSide: 'left', // left | right
  joystickMode: 'floating', // floating | fixed
  buttonSize: 'm', // s | m | l
});

const ENUMS = {
  theme: ['dark', 'light', 'tierra'],
  quality: ['auto', 'high', 'medium', 'low'],
  joystickSide: ['left', 'right'],
  joystickMode: ['floating', 'fixed'],
  buttonSize: ['s', 'm', 'l'],
};

/** Devuelve un objeto de ajustes válido; descarta claves desconocidas. */
export function validateSettings(input, base = DEFAULT_SETTINGS) {
  const out = { ...DEFAULT_SETTINGS, ...base };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const v = input[key];
    if (typeof def === 'boolean') {
      if (typeof v === 'boolean') out[key] = v;
    } else if (typeof def === 'number') {
      if (typeof v === 'number' && Number.isFinite(v)) out[key] = Math.min(1, Math.max(0, v));
    } else if (ENUMS[key]) {
      if (ENUMS[key].includes(v)) out[key] = v;
    }
  }
  return out;
}
