// Metadatos de logros (las reglas viven en server/progress/achievements.js).

export const ACHIEVEMENTS = Object.freeze([
  { id: 'primer_bocado', name: 'Primer bocado', desc: 'Comete la célula de otro jugador.', icon: '🍽️', coins: 1000 },
  { id: 'mbarete', name: 'Mbarete', desc: 'Llegá a 1.000 de masa.', icon: '💪', coins: 2000 },
  { id: 'tuicha', name: 'Tuicha', desc: 'Llegá a 5.000 de masa.', icon: '🐘', coins: 5000 },
  { id: 'karai_guasu', name: 'Karai Guasu', desc: 'Llegá a 10.000 de masa.', icon: '👑', coins: 10000 },
  { id: 'cazador', name: 'Cazador', desc: 'Comete 10 jugadores en una sola vida.', icon: '🏹', coins: 5000 },
  { id: 'dividir_conquistar', name: 'Dividir y conquistar', desc: 'Comete a alguien menos de 1 segundo después de dividirte.', icon: '⚡', coins: 2000 },
  { id: 'sobreviviente', name: 'Sobreviviente', desc: 'Sobreviví 10 minutos seguidos.', icon: '⏳', coins: 3000 },
  { id: 'numero_uno', name: 'Número uno', desc: 'Llegá al puesto #1 del ranking en Clásico.', icon: '⭐', coins: 5000, skin: 'estrella' },
  { id: 'venganza', name: 'Venganza', desc: 'Comete al que te comió la última vez.', icon: '😤', coins: 2000 },
  { id: 'campeon_br', name: 'Campeón', desc: 'Ganá una Batalla real con 4 o más participantes.', icon: '🏆', coins: 15000, skin: 'corona' },
  { id: 'podio', name: 'Podio', desc: 'Quedá entre los 3 primeros en Batalla real.', icon: '🥉', coins: 3000 },
  { id: 'chipero', name: 'Chipero', desc: 'Comé 1.000 chipitas en total.', icon: '🥯', coins: 2000 },
  { id: 'chipero_guasu', name: 'Chipero guasu', desc: 'Comé 10.000 chipitas en total.', icon: '🥐', coins: 10000, skin: 'chipa_dorada' },
  { id: 'tuna_poty', name: 'Tuna poty', desc: 'Explotá 25 cactus en total.', icon: '🌵', coins: 5000, skin: 'tuna' },
  { id: 'jaguarete', name: 'Jaguareté', desc: 'Comete 100 jugadores en total.', icon: '🐆', coins: 15000 },
  { id: 'terere_rupa', name: 'Tereré rupa', desc: 'Jugá 10 partidas.', icon: '🧉', coins: 2000 },
  { id: 'vicio', name: 'Vicio', desc: 'Jugá 100 partidas.', icon: '🎮', coins: 10000, skin: 'guarania' },
  { id: 'ahorrista', name: 'Ahorrista', desc: 'Juntá ₲ 100.000.', icon: '💰', coins: 5000 },
  { id: 'coleccionista', name: 'Coleccionista', desc: 'Tené 10 skins.', icon: '🎨', coins: 5000 },
  { id: 'noctambulo', name: 'Noctámbulo', desc: 'Jugá entre las 00:00 y las 05:00.', icon: '🌙', coins: 2000 },
]);

export const ACHIEVEMENT_MAP = Object.freeze(Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a])));
