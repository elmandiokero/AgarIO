// Textos y frases (español con toques de jopara).
export const PHRASES = {
  welcome: ["¡Mba'éichapa!", '¡Jaha!', '¡Bienvenido/a!', 'Tereré ha chipa 🧉'],
  death: ['¡Te comieron!', '¡Upéi!', '¡Ñembotavy!', '¡Ay, che!', '¡Chake!'],
  deathZone: ['¡Te quedaste afuera!', '¡La zona te agarró!'],
  win: ['¡Ganaste! ¡Iporã!', '¡Sos el Karai Guasu!', '¡Mbarete!'],
  ach: ['¡Iporã!', '¡Logro desbloqueado!', '¡Tuicha!'],
  levelup: ['¡Subiste de nivel!', '¡Mbarete!'],
};

export function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export const REASONS = {
  eaten: 'Te comió',
  zone: 'La zona te eliminó',
  left: 'Saliste de la partida',
  disconnect: 'Se cortó la conexión',
  win: '¡Ganaste la ronda!',
  survived: 'Sobreviviste hasta el final',
  shutdown: 'El servidor se apagó',
};

export const TIPS = [
  'Dividite (Espacio) para atrapar a los más chicos… ¡pero cuidado, quedás vulnerable!',
  'Los cactus 🌵 explotan a las células grandes. Los chicos se pueden esconder debajo.',
  'Tirale masa (W) a un cactus 7 veces y dispara uno nuevo.',
  'Mientras más grande, más lento. Usá eso a tu favor.',
  'En Batalla real, mirá el círculo blanco: es la próxima zona segura.',
  'Juntá guaraníes ₲ jugando y comprá skins en la tienda.',
  'Con cuenta se guardan tus estadísticas, logros y skins.',
  'Algunas skins de mitología guaraní sólo se consiguen subiendo de nivel.',
];
