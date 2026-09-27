// Fórmulas del juego (servidor y cliente usan exactamente las mismas).

export const BASE_VIEW_W = 1600;
export const BASE_VIEW_H = 900;
export const MAX_LEVEL = 50;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function massToRadius(m) {
  return 10 * Math.sqrt(m);
}

export function radiusToMass(r) {
  return (r / 10) * (r / 10);
}

/** Velocidad máxima en px/s de una célula de masa m. */
export function cellSpeed(m, base = 600, exp = 0.22) {
  return base * Math.pow(Math.max(m, 1), -exp);
}

/** Zoom de la cámara según la suma de radios de tus células. */
export function zoomFor(sumRadius, minZoom = 0.28) {
  return clamp(Math.pow(64 / Math.max(sumRadius, 1), 0.35), minZoom, 1);
}

/**
 * Rectángulo visible. El área es igual para todos (justo para celular y PC);
 * sólo cambia la proporción de la pantalla.
 */
export function viewSize(zoom, aspect) {
  const a = clamp(aspect || 16 / 9, 0.45, 2.4);
  const area = (BASE_VIEW_W * BASE_VIEW_H) / (zoom * zoom);
  const h = Math.sqrt(area / a);
  return { w: a * h, h };
}

/** Segundos hasta que células divididas puedan volver a juntarse. */
export function mergeSeconds(m) {
  return Math.min(45, 15 + 0.012 * m);
}

/** Distancia que recorre la mitad lanzada al dividir. */
export function splitDistance(rNew) {
  return clamp(3.5 * rNew, 250, 1200);
}

// ---- Niveles ----
export function totalXpForLevel(level) {
  return 50 * level * (level - 1);
}

export function levelFromXp(xp) {
  let l = Math.floor((1 + Math.sqrt(1 + (4 * Math.max(0, xp)) / 50)) / 2);
  // Corrección por errores de coma flotante
  while (l > 1 && totalXpForLevel(l) > xp) l--;
  while (totalXpForLevel(l + 1) <= xp) l++;
  return Math.min(Math.max(l, 1), MAX_LEVEL);
}

export function levelProgress(xp) {
  const level = levelFromXp(xp);
  if (level >= MAX_LEVEL) return { level, into: 0, need: 0, pct: 1 };
  const base = totalXpForLevel(level);
  const next = totalXpForLevel(level + 1);
  return { level, into: xp - base, need: next - base, pct: (xp - base) / (next - base) };
}

// ---- Formato ----
export function formatThousands(n) {
  const s = String(Math.floor(Math.abs(n)));
  const withDots = s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '-' : '') + withDots;
}

/** "₲ 15.000" */
export function formatGs(n) {
  return '₲ ' + formatThousands(n);
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Color HSL del jugador a partir de un tono 0..255 */
export function hueColor(hue, s = 72, l = 52) {
  return `hsl(${Math.round((hue / 256) * 360)}, ${s}%, ${l}%)`;
}
