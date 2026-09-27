// Sala base: bucle de simulación de paso fijo, jugadores, bots, snapshots, ranking y chat.
import crypto from 'node:crypto';
import { World, newLifeStats } from './world.js';
import { createPlayer } from './player.js';
import { BotBrain } from './bots/brain.js';
import { pickProfile } from './bots/profiles.js';
import { BOT_NAMES } from './bots/names.js';
import { buildSnapshot, commitSnapshot, resetNetState } from './netsync.js';
import { ChatService, BOT_PHRASES } from './chat.js';
import { computeRewards } from '../progress/rewards.js';
import { roomGameConfig } from '../config.js';
import { zoomFor } from '../../shared/formulas.js';
import { SKINS } from '../../shared/catalog/skins.js';

const MAX_BUFFERED = 128 * 1024;

export class Room {
  /**
   * @param {object} o
   * @param {'ffa'|'br'} o.mode
   * @param {object} o.config configuración completa
   * @param {object} o.rng
   * @param {object} o.clock
   * @param {object} [o.progression]
   * @param {object} [o.log]
   */
  constructor({ mode, config, rng, clock, progression = null, log = null }) {
    this.mode = mode;
    this.config = config;
    this.mcfg = config[mode];
    this.g = roomGameConfig(config, mode);
    this.rng = rng;
    this.clock = clock;
    this.progression = progression;
    this.log = log;
    this.world = new World({
      width: this.mcfg.world,
      height: this.mcfg.world,
      game: this.g,
      food: this.mcfg.food,
      viruses: this.mcfg.viruses,
      rng,
      bots: config.bots,
    });
    this.players = new Map(); // pid → player (humanos y bots)
    this.conns = new Set();
    this.bots = [];
    this.nextPid = 1;
    this.infoCounter = 1;
    this.tickMs = 1000 / config.sim.tickRate;
    this.acc = 0;
    this.lastPerf = null;
    this.emptySince = clock.now();
    this.paused = false;
    this.chat = new ChatService(config);
    this.lbTop = [];
    this.perf = { steps: 0, stepMs: 0, maxStepMs: 0, bytes: 0, since: clock.now() };
    this.onAdminCommand = null; // lo asigna el RoomManager
  }

  // ------------------------------------------------------------------ utilidades

  allocPid() {
    for (let i = 0; i < 65535; i++) {
      const pid = this.nextPid;
      this.nextPid = this.nextPid >= 65535 ? 1 : this.nextPid + 1;
      if (!this.players.has(pid)) return pid;
    }
    throw new Error('Sin pids libres');
  }

  humans() {
    const out = [];
    for (const p of this.players.values()) if (!p.isBot) out.push(p);
    return out;
  }

  humanCount() {
    let n = 0;
    for (const p of this.players.values()) if (!p.isBot) n++;
    return n;
  }

  broadcastJson(obj, except = null) {
    const s = JSON.stringify(obj);
    for (const c of this.conns) if (c !== except) c.sendRaw(s);
  }

  systemMessage(text, conn = null) {
    const msg = { t: 'chat', sys: true, text };
    if (conn) conn.sendJson(msg);
    else this.broadcastJson(msg);
  }

  // ------------------------------------------------------------------ bots

  createBot() {
    const used = new Set(this.bots.map((b) => b.name));
    const free = BOT_NAMES.filter((n) => !used.has(n));
    const name = free.length ? this.rng.pick(free) : `Bot ${this.bots.length + 1}`;
    const p = createPlayer({
      pid: this.allocPid(),
      name,
      skin: this.randomBotSkin(),
      hue: this.rng.int(0, 255),
      isBot: true,
      level: this.rng.int(1, 30),
    });
    p.brain = new BotBrain(p, pickProfile(this.rng, this.config.bots.mix), this.rng);
    this.players.set(p.pid, p);
    this.bots.push(p);
    return p;
  }

  randomBotSkin() {
    if (this.rng.chance(0.15)) return '';
    return this.rng.pick(SKINS).id;
  }

  removeBot(p) {
    this.world.removePlayer(p);
    this.players.delete(p.pid);
    const i = this.bots.indexOf(p);
    if (i >= 0) this.bots.splice(i, 1);
  }

  startLife(p) {
    p.life = newLifeStats(this.world.time);
    p.lifeStartedWall = this.clock.now();
    p.lifeEnded = false;
    p.infoVersion = ++this.infoCounter;
    p.lastHitBy = null;
    p.input.dx = 0;
    p.input.dy = 0;
    p.splitRequests = 0;
    p.ejectHeld = false;
    p.respawnAt = null;
    if (p.brain) p.brain.reset();
  }

  spawnBot(p, at = null) {
    if (this.rng.chance(0.3)) p.skin = this.randomBotSkin();
    this.startLife(p);
    this.world.spawnPlayer(p, this.mcfg.startMass, at);
  }

  // ------------------------------------------------------------------ bucle

  shouldPause(now) {
    if (this.conns.size > 0) {
      this.emptySince = null;
      return false;
    }
    if (this.emptySince === null) this.emptySince = now;
    return now - this.emptySince > this.config.sim.idlePauseSeconds * 1000;
  }

  /** Llamado seguido por el RoomManager; ejecuta los ticks que correspondan. */
  update(perfNow) {
    if (this.lastPerf === null) this.lastPerf = perfNow;
    const elapsed = perfNow - this.lastPerf;
    this.lastPerf = perfNow;
    this.paused = this.shouldPause(this.clock.now());
    if (this.paused) {
      this.acc = 0;
      return;
    }
    this.acc += elapsed;
    let steps = 0;
    while (this.acc >= this.tickMs && steps < 5) {
      this.step();
      this.acc -= this.tickMs;
      steps++;
    }
    if (this.acc > this.tickMs * 5) this.acc = 0; // el servidor se atrasó: descartamos
  }

  step() {
    const t0 = performance.now();
    const zone = this.zoneForBots ? this.zoneForBots() : null;
    for (const b of this.bots) b.brain.update(this.world, zone);
    this.world.step(this.tickMs);
    for (const ev of this.world.drainEvents()) {
      if (ev.type === 'death') this.handleDeath(ev);
    }
    this.afterStep();
    const tick = this.world.tick;
    if (tick % this.config.sim.snapshotEvery === 0) this.broadcastSnapshots();
    const perSec = Math.round(1000 / this.tickMs);
    if (tick % Math.round(perSec / 2) === 0) this.broadcastLeaderboard();
    if (tick % perSec === 0) this.everySecond();
    const ms = performance.now() - t0;
    this.perf.steps++;
    this.perf.stepMs += ms;
    if (ms > this.perf.maxStepMs) this.perf.maxStepMs = ms;
  }

  /** Para las subclases. */
  afterStep() {}

  everySecond() {
    const now = this.world.time;
    const graceMs = this.g.disconnectGraceSeconds * 1000;
    for (const p of this.humans()) {
      if (p.disconnectedAt !== null && now - p.disconnectedAt > graceMs) {
        this.finalizeDisconnected(p);
        continue;
      }
      // Logros en vivo
      if (p.userId && p.alive && this.progression && p.unlocked) {
        try {
          const news = this.progression.checkLive(p.userId, this.lifeView(p), p.unlocked);
          if (news.length && p.conn) for (const a of news) p.conn.sendJson({ t: 'ach', ...a });
        } catch (err) {
          this.log?.error('Error en logros en vivo:', err.message);
        }
      }
    }
  }

  // ------------------------------------------------------------------ red

  cameraFor(conn) {
    const world = this.world;
    let target = null;
    const p = conn.player;
    if (p && p.cells.length) target = p;
    else if (conn.spectating) target = this.spectateTarget(conn);
    if (target && target.cells.length) {
      let sx = 0, sy = 0, sm = 0, sr = 0;
      for (const c of target.cells) {
        sx += c.x * c.m;
        sy += c.y * c.m;
        sm += c.m;
        sr += c.r;
      }
      const cam = conn.lastCam || (conn.lastCam = { x: 0, y: 0, zoom: 1 });
      cam.x = sx / sm;
      cam.y = sy / sm;
      cam.zoom = zoomFor(sr);
      return cam;
    }
    if (conn.lastCam) return conn.lastCam;
    return { x: world.w / 2, y: world.h / 2, zoom: 0.3 };
  }

  spectateTarget(conn) {
    if (typeof conn.spectating === 'number') {
      const t = this.players.get(conn.spectating);
      if (t && t.cells.length) return t;
    }
    // automático: el líder
    let best = null, bestM = 0;
    for (const p of this.players.values()) {
      if (!p.cells.length) continue;
      const m = this.world.totalMass(p);
      if (m > bestM) { bestM = m; best = p; }
    }
    return best;
  }

  broadcastSnapshots() {
    const tick = this.world.tick;
    for (const conn of this.conns) {
      if (!conn.isOpen()) continue;
      if (conn.bufferedAmount() > MAX_BUFFERED) continue;
      const bytes = buildSnapshot(this, conn);
      if (conn.sendBinary(bytes)) {
        commitSnapshot(conn, tick);
        this.perf.bytes += bytes.length;
      }
    }
    this.world.recentEaten.clear();
  }

  computeRanking() {
    const alive = [];
    for (const p of this.players.values()) {
      if (!p.cells.length) continue;
      alive.push({ p, m: this.world.totalMass(p) });
    }
    alive.sort((a, b) => b.m - a.m);
    return alive;
  }

  broadcastLeaderboard() {
    const ranking = this.computeRanking();
    const top = ranking.slice(0, 10).map(({ p, m }) => {
      const c = this.world.centroid(p);
      return { pid: p.pid, n: p.name, m: Math.round(m), x: Math.round(c.x), y: Math.round(c.y), b: p.isBot ? 1 : 0 };
    });
    this.lbTop = top;
    const ranks = new Map();
    ranking.forEach(({ p }, i) => {
      ranks.set(p.pid, i + 1);
      if (!p.isBot) {
        if (!p.life.bestRank || i + 1 < p.life.bestRank) p.life.bestRank = i + 1;
        if (i === 0 && this.mode === 'ffa' && ranking.length >= 5) p.life.reachedTop1 = true;
      }
    });
    const topJson = JSON.stringify(top);
    const total = ranking.length;
    for (const conn of this.conns) {
      const rank = conn.player ? ranks.get(conn.player.pid) || 0 : 0;
      conn.sendRaw(`{"t":"lb","top":${topJson},"rank":${rank},"total":${total}}`);
    }
  }

  // ------------------------------------------------------------------ vidas

  lifeView(p) {
    const l = p.life;
    return {
      mode: this.mode,
      durationMs: this.world.time - l.startedAt,
      maxMass: l.maxMass,
      cellsEaten: l.cellsEaten,
      humanKills: l.humanKills,
      botKills: l.botKills,
      splitKill: l.splitKill,
      revenge: l.revenge,
      reachedTop1: l.reachedTop1,
      hourLocal: new Date(this.clock.now()).getHours(),
      brPlace: 0,
      brParticipants: 0,
    };
  }

  /**
   * Termina la vida de un jugador humano: guarda estadísticas y premios.
   * @returns {{summary: object, result: object}|null}
   */
  endLife(p, reason, extra = {}) {
    if (p.lifeEnded) return null;
    p.lifeEnded = true;
    if (p.isBot) return null;
    const l = p.life;
    const killer = extra.killer || null;
    const summary = {
      mode: this.mode,
      reason,
      killerName: killer ? killer.name : null,
      killerIsBot: killer ? !!killer.isBot : false,
      startedAt: p.lifeStartedWall,
      endedAt: this.clock.now(),
      durationMs: Math.max(0, this.world.time - l.startedAt),
      maxMass: Math.round(l.maxMass),
      finalMass: Math.round(this.world.totalMass(p)),
      foodEaten: l.foodEaten,
      cellsEaten: l.cellsEaten,
      humanKills: l.humanKills,
      botKills: l.botKills,
      virusesPopped: l.virusesPopped,
      splits: l.splits,
      ejects: l.ejects,
      massGained: Math.round(l.massGained),
      bestRank: l.bestRank,
      reachedTop1: l.reachedTop1,
      splitKill: l.splitKill,
      revenge: l.revenge,
      brPlace: extra.place || 0,
      brParticipants: extra.of || 0,
      hourLocal: new Date(p.lifeStartedWall || this.clock.now()).getHours(),
    };
    let result = null;
    if (p.userId && this.progression) {
      try {
        result = this.progression.applyLifeResult(p.userId, summary);
        if (result && p.conn?.user) {
          p.conn.user.xp = result.xp;
          p.conn.user.coins = result.coins;
          p.level = result.levelAfter;
        }
        if (result && p.unlocked) for (const a of result.newAchievements) p.unlocked.add(a.id);
      } catch (err) {
        this.log?.error('No se pudo guardar el resultado:', err.message);
      }
    }
    if (!result) result = { guest: !p.userId, rewards: computeRewards(summary, this.config.progression) };
    return { summary, result };
  }

  handleDeath(ev) {
    const { player: p, killer, reason } = ev;
    if ((killer && !killer.isBot) || !p.isBot || p.life.maxMass >= 400) {
      this.broadcastJson({ t: 'feed', k: killer ? killer.name : null, v: p.name, r: reason });
    }
    if (killer && killer.isBot && !p.isBot && this.rng.chance(0.25)) {
      const text = this.rng.pick(BOT_PHRASES);
      setTimeout(() => this.broadcastJson({ t: 'chat', pid: killer.pid, from: killer.name, text, bot: true }), 600 + this.rng.int(0, 900));
    }
    this.onPlayerDeath(p, killer, reason);
  }

  /** Subclases: qué pasa cuando muere alguien. */
  onPlayerDeath() {}

  sendDead(p, out, extra = {}) {
    if (!p.conn || !out) return;
    p.conn.sendJson({ t: 'dead', mode: this.mode, reason: out.summary.reason, killer: out.summary.killerName, summary: out.summary, result: out.result, ...extra });
  }

  finalizeDisconnected(p) {
    if (p.alive && !p.lifeEnded) this.endLife(p, 'disconnect');
    this.removeHuman(p);
  }

  removeHuman(p) {
    this.world.removePlayer(p);
    this.players.delete(p.pid);
    if (p.conn) {
      p.conn.player = null;
      p.conn = null;
    }
  }

  // ------------------------------------------------------------------ conexiones

  attachConn(conn) {
    this.conns.add(conn);
    conn.room = this;
    resetNetState(conn);
  }

  newHumanPlayer(conn, { name, skin }) {
    const u = conn.user;
    const p = createPlayer({
      pid: this.allocPid(),
      name,
      skin,
      hue: this.rng.int(0, 255),
      isBot: false,
      userId: u ? u.id : null,
      level: u ? u.level : 1,
      conn,
      isAdmin: !!u?.is_admin,
    });
    p.resumeKey = crypto.randomBytes(12).toString('base64url');
    if (u && this.progression) p.unlocked = this.progression.getUnlocked(u.id);
    this.players.set(p.pid, p);
    conn.player = p;
    return p;
  }

  joinedMessage(conn, extra = {}) {
    const p = conn.player;
    return {
      t: 'joined',
      mode: this.mode,
      pid: p ? p.pid : 0,
      world: { w: this.world.w, h: this.world.h },
      tickRate: this.config.sim.tickRate,
      snapRate: this.config.sim.tickRate / this.config.sim.snapshotEvery,
      resumeKey: p ? p.resumeKey : null,
      showBotTag: this.config.bots.showTag,
      ...extra,
    };
  }

  /** El jugador se fue al menú o cambió de sala. */
  leave(conn) {
    const p = conn.player;
    if (p) {
      if (p.alive && !p.lifeEnded) {
        const out = this.endLife(p, 'left', this.leaveExtra ? this.leaveExtra(p) : {});
        if (out) conn.sendJson({ t: 'saved', summary: out.summary, result: out.result });
      }
      this.removeHuman(p);
    }
    this.conns.delete(conn);
    conn.room = null;
    conn.player = null;
    conn.spectating = null;
    conn.lastCam = null;
  }

  /** Se cortó la conexión: las células quedan un rato por si vuelve. */
  disconnect(conn) {
    const p = conn.player;
    this.conns.delete(conn);
    conn.room = null;
    if (!p) return;
    p.conn = null;
    conn.player = null;
    if (p.alive && p.cells.length) {
      p.disconnectedAt = this.world.time;
      p.input.dx = 0;
      p.input.dy = 0;
      p.ejectHeld = false;
      p.splitRequests = 0;
    } else {
      this.removeHuman(p);
    }
  }

  /** Reconectar a un jugador que se cortó. */
  tryResume(conn, key) {
    if (typeof key !== 'string') return false;
    for (const p of this.players.values()) {
      if (p.isBot || p.resumeKey !== key || p.disconnectedAt === null) continue;
      const uid = conn.user ? conn.user.id : null;
      if (p.userId !== uid) return false;
      p.disconnectedAt = null;
      p.conn = conn;
      conn.player = p;
      this.attachConn(conn);
      conn.sendJson(this.joinedMessage(conn, { resumed: true, ...this.joinExtra(conn) }));
      return true;
    }
    return false;
  }

  joinExtra() {
    return {};
  }

  onInput(conn, input) {
    const p = conn.player;
    if (!p || p.disconnectedAt !== null) return;
    switch (input.op) {
      case 1: {
        const lim = 4000;
        p.input.dx = Math.max(-lim, Math.min(lim, input.dx));
        p.input.dy = Math.max(-lim, Math.min(lim, input.dy));
        break;
      }
      case 2:
        if (p.splitRequests < 4) p.splitRequests++;
        break;
      case 3:
        p.ejectHeld = true;
        break;
      case 4:
        p.ejectHeld = false;
        break;
      default:
        break;
    }
  }

  spectate(conn, pid) {
    if (conn.player && conn.player.alive) return;
    conn.spectating = typeof pid === 'number' && this.players.has(pid) ? pid : 'auto';
  }

  spectateNext(conn) {
    if (conn.player && conn.player.alive) return;
    const ranking = this.computeRanking();
    if (!ranking.length) return;
    const cur = typeof conn.spectating === 'number' ? ranking.findIndex((r) => r.p.pid === conn.spectating) : -1;
    const next = ranking[(cur + 1) % ranking.length].p;
    conn.spectating = next.pid;
    conn.sendJson({ t: 'spectating', pid: next.pid, name: next.name });
  }

  handleChat(conn, raw) {
    const r = this.chat.parse(conn, raw, this.clock.now());
    if (!r) return;
    if (r.kind === 'error') return this.systemMessage(r.text, conn);
    if (r.kind === 'command') return this.handleCommand(conn, r.cmd, r.args);
    const p = conn.player;
    const name = p ? p.name : conn.user?.display_name || 'Espectador';
    this.broadcastJson({ t: 'chat', pid: p ? p.pid : 0, from: name, text: r.text, admin: !!conn.user?.is_admin });
  }

  handleCommand(conn, cmd, args) {
    const isAdmin = !!conn.user?.is_admin;
    if (cmd === 'ayuda' || cmd === 'help') {
      this.systemMessage(
        isAdmin
          ? 'Comandos: /bots N, /br start, /kick nombre, /mute nombre minutos, /anuncio texto, /perf'
          : 'Escribí y apretá Enter para chatear. ¡Jaha!',
        conn
      );
      return;
    }
    if (!isAdmin) return this.systemMessage('Ese comando es sólo para admins.', conn);
    if (this.onAdminCommand) this.onAdminCommand(this, conn, cmd, args);
  }

  // ------------------------------------------------------------------ info

  summary() {
    return { humans: this.humanCount(), bots: this.bots.length, max: this.mcfg.maxPlayers };
  }

  perfReport() {
    const secs = Math.max(1, (this.clock.now() - this.perf.since) / 1000);
    const r = {
      avgStepMs: this.perf.steps ? +(this.perf.stepMs / this.perf.steps).toFixed(2) : 0,
      maxStepMs: +this.perf.maxStepMs.toFixed(2),
      kbPerSec: +(this.perf.bytes / 1024 / secs).toFixed(1),
      conns: this.conns.size,
      cells: this.world.cells.length,
      food: this.world.foodCount,
    };
    this.perf = { steps: 0, stepMs: 0, maxStepMs: 0, bytes: 0, since: this.clock.now() };
    return r;
  }

  /** Al apagar el servidor: guardar las vidas en curso. */
  shutdown() {
    for (const p of this.humans()) {
      if (p.alive && !p.lifeEnded) this.endLife(p, 'shutdown', this.leaveExtra ? this.leaveExtra(p) : {});
    }
  }
}
