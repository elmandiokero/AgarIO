// Configuración: valores por defecto + config.json + argumentos de línea de comandos.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_CONFIG = {
  title: 'Jaha.io',
  port: 3000,
  host: '0.0.0.0',
  dataDir: 'data',
  admins: [],
  tunnel: {
    enabled: false,
    mode: 'quick', // quick (link al azar) | named (dominio propio) | token (panel de Cloudflare)
    protocol: 'auto', // auto | http2 | quic
    cloudflaredPath: '',
    hostname: '', // ej. agario.alexlamasg.lat (modos named/token)
    name: 'jaha-io', // nombre del túnel en Cloudflare (modo named)
    id: '', // UUID del túnel (modo named; lo completa 4-CONFIGURAR-DOMINIO.bat)
    credentialsFile: '', // credencial del túnel (modo named)
    token: '', // token del panel de Cloudflare (modo token)
  },
  limits: {
    maxConnections: 150,
    maxPerIp: 6,
  },
  chat: {
    enabled: true,
    cooldownMs: 1200,
    badWords: [],
  },
  progression: {
    minLifeSeconds: 15,
    maxXpPerLife: 1500,
    coinsPerXp: 10,
    levelUpCoinsPerLevel: 2000,
    startingCoins: 5000,
  },
  sim: {
    tickRate: 40,
    snapshotEvery: 2,
    idlePauseSeconds: 60,
  },
  // Reglas comunes a todas las salas (cada sala puede sobrescribirlas en su sección "game")
  game: {
    baseSpeed: 600,
    speedExponent: 0.22,
    eatRatio: 1.25,
    eatOverlap: 0.4,
    minSplitMass: 36,
    minEjectMass: 35,
    ejectLoss: 16,
    ejectMass: 13,
    ejectDistance: 780,
    ejectIntervalMs: 100,
    virusMass: 100,
    virusPopRatio: 1.33,
    virusFeedsToShoot: 7,
    virusShootDistance: 800,
    decayRate: 0.002,
    decayMinMass: 100,
    maxCellMass: 22500,
    minCellMass: 10,
    foodMass: 1,
    foodPerTick: 20,
    disconnectGraceSeconds: 20,
    spawnProtectionMs: 3000,
  },
  bots: {
    showTag: true,
    difficulty: 'normal', // facil | normal | dificil
    softCapMass: 3000,
    mix: { tranqui: 0.35, normal: 0.35, cazador: 0.15, capo: 0.15 },
    respawnMinSeconds: 2,
    respawnMaxSeconds: 5,
  },
  ffa: {
    enabled: true,
    name: 'Clásico',
    world: 6000,
    bots: 12,
    food: 1000,
    viruses: 20,
    startMass: 20,
    maxPlayers: 60,
    game: {},
  },
  br: {
    enabled: true,
    name: 'Batalla real',
    world: 4500,
    bots: 12,
    food: 700,
    viruses: 12,
    startMass: 30,
    minHumans: 1,
    maxPlayers: 40,
    lobbySeconds: 20,
    countdownSeconds: 5,
    endedSeconds: 12,
    maxRoundSeconds: 420,
    noHumansEndSeconds: 10,
    championMinParticipants: 4,
    // Cada fase: espera (hold) → achique (shrink) hasta radio "radius" (fracción del mapa); daño por segundo fuera de la zona
    phases: [
      { hold: 40, shrink: 30, radius: 0.444, dmgPct: 0.01, dmgFlat: 1 },
      { hold: 30, shrink: 25, radius: 0.267, dmgPct: 0.02, dmgFlat: 2 },
      { hold: 25, shrink: 20, radius: 0.144, dmgPct: 0.035, dmgFlat: 3 },
      { hold: 20, shrink: 20, radius: 0.067, dmgPct: 0.06, dmgFlat: 4 },
      { hold: 15, shrink: 25, radius: 0, dmgPct: 0.1, dmgFlat: 6 },
    ],
    game: {},
  },
};

function isObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

export function deepMerge(base, over) {
  if (!isObj(over)) return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (k.startsWith('//') || k.startsWith('_comment')) continue;
    if (isObj(v) && isObj(base?.[k])) out[k] = deepMerge(base[k], v);
    else out[k] = v;
  }
  return out;
}

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tunnel') args.tunnel = true;
    else if (a === '--no-tunnel') args.tunnel = false;
    else if (a === '--port') args.port = Number(argv[++i]);
    else if (a.startsWith('--port=')) args.port = Number(a.slice(7));
    else if (a === '--config') args.config = argv[++i];
    else if (a.startsWith('--config=')) args.config = a.slice(9);
    else if (a === '--data') args.data = argv[++i];
    else if (a.startsWith('--data=')) args.data = a.slice(7);
  }
  return args;
}

function num(v, lo, hi, def) {
  return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : def;
}

/** Corrige valores fuera de rango para que un error en config.json no rompa el juego. */
export function sanitizeConfig(c) {
  const d = DEFAULT_CONFIG;
  c.port = num(c.port, 0, 65535, d.port);
  c.sim.tickRate = num(c.sim.tickRate, 10, 60, d.sim.tickRate);
  c.sim.snapshotEvery = Math.round(num(c.sim.snapshotEvery, 1, 6, d.sim.snapshotEvery));
  for (const mode of ['ffa', 'br']) {
    const m = c[mode];
    m.world = num(m.world, 1000, 20000, d[mode].world);
    m.bots = Math.round(num(m.bots, 0, 100, d[mode].bots));
    m.food = Math.round(num(m.food, 0, 10000, d[mode].food));
    m.viruses = Math.round(num(m.viruses, 0, 200, d[mode].viruses));
    m.startMass = num(m.startMass, 10, 1000, d[mode].startMass);
    m.maxPlayers = Math.round(num(m.maxPlayers, 1, 200, d[mode].maxPlayers));
  }
  if (!Array.isArray(c.br.phases) || c.br.phases.length === 0) c.br.phases = d.br.phases;
  if (!['quick', 'named', 'token'].includes(c.tunnel.mode)) c.tunnel.mode = 'quick';
  if (!['facil', 'normal', 'dificil'].includes(c.bots.difficulty)) c.bots.difficulty = 'normal';
  if (!c.bots.mix || typeof c.bots.mix !== 'object') c.bots.mix = d.bots.mix;
  for (const k of ['hostname', 'name', 'id', 'credentialsFile', 'token', 'cloudflaredPath', 'protocol']) {
    if (typeof c.tunnel[k] !== 'string') c.tunnel[k] = d.tunnel[k];
  }
  c.tunnel.hostname = c.tunnel.hostname.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!Array.isArray(c.admins)) c.admins = [];
  c.admins = c.admins.filter((a) => typeof a === 'string').map((a) => a.toLowerCase());
  if (!Array.isArray(c.chat.badWords)) c.chat.badWords = [];
  return c;
}

/**
 * Carga la configuración. Si no existe config.json lo crea a partir de config.example.json.
 * @param {{argv?: string[], overrides?: object, root?: string, createFile?: boolean}} opts
 */
export function loadConfig({ argv = [], overrides = null, root = ROOT, createFile = true } = {}) {
  const args = parseArgs(argv);
  let fileCfg = {};
  let configPath = args.config ? path.resolve(args.config) : path.join(root, 'config.json');
  let fileError = null;
  if (!overrides) {
    if (!fs.existsSync(configPath) && !args.config && createFile) {
      const example = path.join(root, 'config.example.json');
      if (fs.existsSync(example)) {
        try {
          fs.copyFileSync(example, configPath);
        } catch {
          /* sin permiso: seguimos con valores por defecto */
        }
      }
    }
    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, 'utf8').replace(/^﻿/, '');
        fileCfg = JSON.parse(raw);
      } catch (err) {
        fileError = `No se pudo leer ${configPath}: ${err.message}`;
      }
    }
  }
  let cfg = deepMerge(structuredClone(DEFAULT_CONFIG), overrides || fileCfg);
  if (args.port !== undefined && Number.isFinite(args.port)) cfg.port = args.port;
  if (args.tunnel !== undefined) cfg.tunnel.enabled = args.tunnel;
  if (args.data) cfg.dataDir = args.data;
  if (process.env.PORT && !args.port && !overrides) cfg.port = Number(process.env.PORT);
  cfg = sanitizeConfig(cfg);
  cfg.dataDir = path.resolve(root, cfg.dataDir);
  return { config: cfg, configPath, fileError };
}

/** Parámetros de juego efectivos de una sala. */
export function roomGameConfig(cfg, mode) {
  return { ...cfg.game, ...(cfg[mode].game || {}) };
}
