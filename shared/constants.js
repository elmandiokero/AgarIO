// Constantes compartidas entre el servidor y el navegador.

export const PROTOCOL_VERSION = 1;

// Tipos de entidad
export const ET = Object.freeze({ CELL: 1, FOOD: 2, EJECT: 3, VIRUS: 4 });

// Opcodes binarios
export const OP = Object.freeze({
  MOVE: 0x01, // cliente → servidor: f32 dx, f32 dy (relativo al centro de masa)
  SPLIT: 0x02,
  EJECT_ON: 0x03,
  EJECT_OFF: 0x04,
  SNAPSHOT: 0x10, // servidor → cliente
});

// Flags de jugador en el snapshot
export const PF = Object.freeze({ BOT: 1, REGISTERED: 2, YOU: 4, ADMIN: 8 });

// Flags de snapshot
export const SF = Object.freeze({ ALIVE: 1, SPECTATING: 2, ZONE: 4, FROZEN: 8 });

export const MODES = Object.freeze(['ffa', 'br']);

export const MAX_CELLS = 16;

export const LIMITS = Object.freeze({
  NAME_MAX: 16, // grafemas
  CHAT_MAX: 120,
  USERNAME_MIN: 3,
  USERNAME_MAX: 16,
  PASSWORD_MIN: 6,
  PASSWORD_MAX: 128,
  STR8_BYTES: 48,
  MOVE_CLAMP: 4000,
});

// Comida: "chipitas" con los colores de la bandera, dorado chipa y verdes del monte.
export const FOOD_PALETTE = Object.freeze([
  '#d52b1e', // rojo bandera
  '#f5f5f5', // blanco
  '#0038a8', // azul bandera
  '#e8b04a', // chipa dorada
  '#c98a2b', // chipa tostada
  '#3aa655', // yerba
  '#7bd389', // tereré
  '#ff7eb6', // lapacho
  '#9b5de5', // mburucuyá
  '#00bbf9', // río Paraguay
  '#fee440', // sol
  '#f15bb5', // flor
]);

// Estados del modo Batalla real
export const BR_STATE = Object.freeze({
  LOBBY: 'lobby',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  ENDED: 'ended',
});

// Mensajes JSON cliente → servidor permitidos
export const CLIENT_MSGS = Object.freeze([
  'hello', 'auth', 'join', 'respawn', 'leave', 'spectate', 'spectate_next', 'view', 'chat', 'gchat', 'ping', 'rooms',
]);
