// Catálogo de skins. Todas son dibujos SVG originales en /skins/<id>.svg
//
// Formas de obtenerlas:
//  - free: disponible para todos (incluso invitados)
//  - price: se compra en la tienda con ₲ (opcional minLevel)
//  - level: se desbloquea automáticamente al llegar a ese nivel
//  - achievement: se desbloquea con un logro

export const RARITY = Object.freeze({
  comun: { name: 'Común', color: '#9aa4b2' },
  rara: { name: 'Rara', color: '#3b82f6' },
  epica: { name: 'Épica', color: '#a855f7' },
  legendaria: { name: 'Legendaria', color: '#f59e0b' },
  mitica: { name: 'Mítica', color: '#ef4444' },
});

export const SKINS = Object.freeze([
  // Gratis
  { id: 'bandera', name: 'Bandera', desc: 'Rojo, blanco y azul. ¡Mba\'éichapa!', rarity: 'comun', free: true },
  { id: 'pelota', name: 'Pelota', desc: 'Para los que viven el fútbol.', rarity: 'comun', free: true },
  { id: 'chipa', name: 'Chipa', desc: 'Calentita, de Itá.', rarity: 'comun', free: true },

  // Tienda
  { id: 'mandioca', name: 'Mandi\'o', desc: 'La mandioca de cada día.', rarity: 'comun', price: 10000 },
  { id: 'sopa', name: 'Sopa paraguaya', desc: 'La única sopa que se come con tenedor.', rarity: 'comun', price: 15000 },
  { id: 'mate', name: 'Mate', desc: 'Para las mañanas frescas.', rarity: 'comun', price: 20000 },
  { id: 'terere', name: 'Tereré', desc: 'Con yuyos y bien helado.', rarity: 'rara', price: 25000 },
  { id: 'mburucuya', name: 'Mburucuyá', desc: 'La flor nacional.', rarity: 'rara', price: 30000 },
  { id: 'lapacho', name: 'Lapacho', desc: 'Rosado en pleno invierno.', rarity: 'rara', price: 30000 },
  { id: 'piri', name: 'Sombrero pirí', desc: 'Contra el sol del Chaco.', rarity: 'rara', price: 35000 },
  { id: 'tatu', name: 'Tatú', desc: 'Blindado como tatu bolita.', rarity: 'rara', price: 40000 },
  { id: 'carpincho', name: 'Carpincho', desc: 'Tranqui, como siempre.', rarity: 'epica', price: 45000 },
  { id: 'yacare', name: 'Yacaré', desc: 'Del estero, con hambre.', rarity: 'epica', price: 55000 },

  // Tienda con nivel mínimo
  { id: 'nanduti', name: 'Ñandutí', desc: 'Encaje de Itauguá, hilo por hilo.', rarity: 'epica', price: 60000, minLevel: 5 },
  { id: 'arpa', name: 'Arpa paraguaya', desc: 'Suena a Pájaro Campana.', rarity: 'epica', price: 75000, minLevel: 8 },
  { id: 'campana', name: 'Pájaro campana', desc: 'El ave nacional: ¡tan-tan!', rarity: 'legendaria', price: 90000, minLevel: 10 },
  { id: 'jaguarete', name: 'Jaguareté', desc: 'El rey del monte.', rarity: 'legendaria', price: 120000, minLevel: 12 },
  { id: 'itaipu', name: 'Itaipú', desc: 'Pura energía.', rarity: 'legendaria', price: 150000, minLevel: 15 },

  // Por nivel (mitología guaraní)
  { id: 'pombero', name: 'Pombero', desc: 'Dejale tabaco y miel…', rarity: 'epica', level: 5 },
  { id: 'jasy_jatere', name: 'Jasy Jateré', desc: 'El de la siesta.', rarity: 'epica', level: 8 },
  { id: 'kurupi', name: 'Kurupí', desc: 'Travieso del monte.', rarity: 'legendaria', level: 12 },
  { id: 'luison', name: 'Luisõ', desc: 'Sale los viernes de luna llena.', rarity: 'legendaria', level: 16 },
  { id: 'ao_ao', name: 'Ao Ao', desc: 'Ao ao ao…', rarity: 'legendaria', level: 20 },
  { id: 'monai', name: 'Moñái', desc: 'Señor de los campos.', rarity: 'mitica', level: 25 },
  { id: 'mboi_tui', name: 'Mbói Tu\'i', desc: 'Serpiente con cabeza de loro.', rarity: 'mitica', level: 30 },
  { id: 'teju_jagua', name: 'Teju Jagua', desc: 'Guardián de las cuevas.', rarity: 'mitica', level: 40 },

  // Por logros
  { id: 'chipa_dorada', name: 'Chipa dorada', desc: 'Logro: Chipero guasu.', rarity: 'legendaria', achievement: 'chipero_guasu' },
  { id: 'tuna', name: 'Tuna en flor', desc: 'Logro: Tuna poty.', rarity: 'epica', achievement: 'tuna_poty' },
  { id: 'corona', name: 'Corona karai', desc: 'Logro: Campeón de Batalla real.', rarity: 'legendaria', achievement: 'campeon_br' },
  { id: 'estrella', name: 'Estrella', desc: 'Logro: Número uno.', rarity: 'epica', achievement: 'numero_uno' },
  { id: 'guarania', name: 'Guarania', desc: 'Logro: Vicio (100 partidas).', rarity: 'legendaria', achievement: 'vicio' },
]);

export const SKIN_MAP = Object.freeze(Object.fromEntries(SKINS.map((s) => [s.id, s])));

export const FREE_SKINS = Object.freeze(SKINS.filter((s) => s.free).map((s) => s.id));

export const DEFAULT_SKIN = 'bandera';

/** Skins que se desbloquean exactamente al pasar de nivel `from` a `to` (inclusive). */
export function skinsForLevelRange(from, to) {
  return SKINS.filter((s) => s.level && s.level > from && s.level <= to).map((s) => s.id);
}

export function skinsForAchievement(achId) {
  return SKINS.filter((s) => s.achievement === achId).map((s) => s.id);
}

export function skinUrl(id) {
  return `/skins/${id}.svg`;
}
