// Crea las salas, corre el bucle y atiende comandos de admin.
import { FfaRoom } from './ffa-room.js';
import { BrRoom } from './br-room.js';
import { createRng } from '../util/rng.js';

export class RoomManager {
  constructor({ config, clock, progression = null, log = null, seed = null, getConnections = () => [] }) {
    this.config = config;
    this.clock = clock;
    this.log = log;
    this.rooms = {};
    this.timer = null;
    this.getConnections = getConnections;
    this.announce = null; // lo asigna el servidor WebSocket (chat global)
    const baseSeed = seed ?? (Date.now() & 0x7fffffff);
    if (config.ffa.enabled) this.rooms.ffa = new FfaRoom({ config, rng: createRng(baseSeed), clock, progression, log });
    if (config.br.enabled) this.rooms.br = new BrRoom({ config, rng: createRng(baseSeed + 1), clock, progression, log });
    for (const r of Object.values(this.rooms)) r.onAdminCommand = (room, conn, cmd, args) => this.adminCommand(room, conn, cmd, args);
  }

  get(mode) {
    return this.rooms[mode] || null;
  }

  start(intervalMs = 5) {
    if (this.timer) return;
    this.timer = setInterval(() => this.update(), intervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  update() {
    const now = performance.now();
    for (const r of Object.values(this.rooms)) {
      try {
        r.update(now);
      } catch (err) {
        this.log?.error(`Error en la sala ${r.mode}:`, err.stack || err.message);
      }
    }
  }

  summary() {
    const out = {};
    for (const [k, r] of Object.entries(this.rooms)) out[k] = { name: r.mcfg.name, ...r.summary() };
    return out;
  }

  shutdown() {
    this.stop();
    for (const r of Object.values(this.rooms)) {
      try {
        r.shutdown();
      } catch (err) {
        this.log?.error('Error guardando partidas al cerrar:', err.message);
      }
    }
  }

  findConnByName(name) {
    const n = String(name || '').toLowerCase();
    for (const c of this.getConnections()) {
      const pn = c.player?.name?.toLowerCase();
      const un = c.user?.username?.toLowerCase();
      if (pn === n || un === n) return c;
    }
    return null;
  }

  adminCommand(room, conn, cmd, args, reply = null) {
    const say = reply || ((t) => room.systemMessage(t, conn));
    switch (cmd) {
      case 'bots': {
        if (!room) return say('Usá /bots dentro de una sala.');
        const n = Number(args[0]);
        if (!Number.isInteger(n) || n < 0 || n > 100) return say('Uso: /bots 0-100');
        room.mcfg.bots = n;
        room.syncBots();
        return say(`Bots en ${room.mcfg.name}: ${n}${room.mode === 'br' ? ' (desde la próxima ronda)' : ''}`);
      }
      case 'br': {
        const br = this.rooms.br;
        if (!br) return say('La Batalla real está desactivada.');
        if (args[0] === 'start') { br.forceStart(); return say('Arrancando la Batalla real…'); }
        if (args[0] === 'stop') { br.forceStop(); return say('Ronda terminada.'); }
        return say('Uso: /br start | /br stop');
      }
      case 'kick': {
        const target = this.findConnByName(args.join(' '));
        if (!target) return say('No encontré a ese jugador.');
        target.sendJson({ t: 'err', code: 'kicked', msg: 'Te sacó un admin.' });
        target.close(4001, 'kick');
        return say('Listo, afuera.');
      }
      case 'mute': {
        const mins = Number(args[args.length - 1]);
        const name = Number.isFinite(mins) ? args.slice(0, -1).join(' ') : args.join(' ');
        const target = this.findConnByName(name);
        if (!target) return say('No encontré a ese jugador.');
        target.mutedUntil = this.clock.now() + (Number.isFinite(mins) ? mins : 10) * 60_000;
        return say(`Silenciado por ${Number.isFinite(mins) ? mins : 10} minutos.`);
      }
      case 'anuncio': {
        const text = args.join(' ').slice(0, 120);
        if (!text) return say('Uso: /anuncio texto');
        if (this.announce) this.announce(`📢 ${text}`);
        else for (const r of Object.values(this.rooms)) r.broadcastJson({ t: 'chat', sys: true, text: `📢 ${text}` });
        return undefined;
      }
      case 'perf': {
        const parts = Object.values(this.rooms).map((r) => {
          const p = r.perfReport();
          return `${r.mcfg.name}: tick ${p.avgStepMs}ms (máx ${p.maxStepMs}), ${p.kbPerSec} KB/s, ${p.conns} conexiones, ${p.cells} células`;
        });
        return say(parts.join(' | '));
      }
      default:
        return say('Comando desconocido. Probá /ayuda');
    }
  }
}
