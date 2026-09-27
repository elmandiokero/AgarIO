// Jugador (humano o bot). Objeto plano que comparten la sala y el mundo.
import { newLifeStats } from './world.js';

export function createPlayer({ pid, name, skin, hue, isBot = false, userId = null, level = 1, conn = null, isAdmin = false }) {
  return {
    pid,
    name,
    skin,
    hue,
    isBot,
    userId,
    isAdmin,
    level,
    conn,
    cells: [],
    input: { dx: 0, dy: 0 },
    splitRequests: 0,
    ejectHeld: false,
    lastEjectAt: -Infinity,
    alive: false,
    frozen: false,
    protectedUntil: 0,
    speedMult: 1,
    life: newLifeStats(0),
    lifeStartedWall: 0,
    lifeEnded: true,
    nemesisPid: 0,
    lastHitBy: null,
    infoVersion: 0,
    disconnectedAt: null,
    resumeKey: null,
    brain: null,
    respawnAt: null,
    // Batalla real
    brPlace: 0,
    brState: null, // 'queued' | 'playing' | 'eliminated' | null
  };
}
