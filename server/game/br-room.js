// Modo Batalla real: rondas con zona que se achica. LOBBY → CUENTA ATRÁS → JUGANDO → FIN → LOBBY.
import { Room } from './room.js';
import { Zone } from './zone.js';
import { BR_STATE } from '../../shared/constants.js';

const { LOBBY, COUNTDOWN, PLAYING, ENDED } = BR_STATE;

export class BrRoom extends Room {
  constructor(opts) {
    super({ ...opts, mode: 'br' });
    this.state = LOBBY;
    this.stateEndsAt = null;
    this.participants = [];
    this.zone = null;
    this.roundStart = 0;
    this.round = 0;
    this.podium = null;
    this.fastForwardAt = null;
    this.world.populate();
    this.syncBots();
  }

  syncBots() {
    const want = this.mcfg.bots;
    while (this.bots.length < want) this.createBot();
    if (this.state === LOBBY) {
      while (this.bots.length > want) this.removeBot(this.bots[this.bots.length - 1]);
    }
  }

  // ------------------------------------------------------------------ estado

  queuedPlayers() {
    return this.humans().filter((p) => p.brState === 'queued' && p.conn);
  }

  aliveParticipants() {
    return this.participants.filter((p) => p.alive && p.cells.length > 0);
  }

  zoneForNet() {
    if (!this.zone || this.state === LOBBY) return null;
    const s = this.zone.state;
    return { x: s.x, y: s.y, r: s.r, nx: s.nx, ny: s.ny, nr: s.nr };
  }

  zoneForBots() {
    return this.state === PLAYING && this.zone ? this.zone.state : null;
  }

  afterStep() {
    const now = this.world.time;
    switch (this.state) {
      case LOBBY: {
        const q = this.queuedPlayers().length;
        if (q >= this.mcfg.minHumans) {
          if (this.stateEndsAt === null) {
            this.stateEndsAt = now + this.mcfg.lobbySeconds * 1000;
            this.broadcastStatus();
          }
          if (q >= this.mcfg.maxPlayers) this.stateEndsAt = now;
        } else if (this.stateEndsAt !== null) {
          this.stateEndsAt = null;
          this.broadcastStatus();
        }
        if (this.stateEndsAt !== null && now >= this.stateEndsAt) this.startCountdown();
        break;
      }
      case COUNTDOWN:
        if (now >= this.stateEndsAt) this.startPlaying();
        break;
      case PLAYING: {
        this.zone.update(now - this.roundStart);
        const alive = this.aliveParticipants();
        const humansAlive = alive.filter((p) => !p.isBot).length;
        if (alive.length <= 1) {
          this.endRound('last');
        } else if (now - this.roundStart >= this.mcfg.maxRoundSeconds * 1000) {
          this.endRound('timeout');
        } else if (humansAlive === 0) {
          if (this.fastForwardAt === null) this.fastForwardAt = now + this.mcfg.noHumansEndSeconds * 1000;
          else if (now >= this.fastForwardAt) this.endRound('nohumans');
        }
        break;
      }
      case ENDED:
        if (now >= this.stateEndsAt) this.backToLobby();
        break;
      default:
        break;
    }
  }

  /** Posiciones separadas entre sí (al menos minDist). */
  spawnPoints(n, minDist = 500) {
    const pts = [];
    const pad = 300;
    for (let i = 0; i < n; i++) {
      let best = null, bestD = -1;
      for (let t = 0; t < 30; t++) {
        const pt = { x: this.rng.range(pad, this.world.w - pad), y: this.rng.range(pad, this.world.h - pad) };
        let d = Infinity;
        for (const q of pts) d = Math.min(d, Math.hypot(q.x - pt.x, q.y - pt.y));
        if (d >= minDist) { best = pt; break; }
        if (d > bestD) { bestD = d; best = pt; }
      }
      pts.push(best);
    }
    return pts;
  }

  startCountdown() {
    const w = this.world;
    w.reset();
    w.zoneDamage = null;
    w.spawnArea = null;
    w.populate();
    this.zone = new Zone(w.w, this.mcfg.phases, this.rng);
    this.zone.update(0);
    this.syncBots();
    const humans = this.queuedPlayers();
    const all = [...humans, ...this.bots];
    const pts = this.spawnPoints(all.length);
    this.participants = [];
    all.forEach((p, i) => this.addParticipant(p, pts[i]));
    this.round++;
    this.podium = null;
    this.fastForwardAt = null;
    this.state = COUNTDOWN;
    this.stateEndsAt = w.time + this.mcfg.countdownSeconds * 1000;
    for (const c of this.conns) {
      c.spectating = null;
      c.lastCam = null;
    }
    this.broadcastStatus();
  }

  addParticipant(p, at = null) {
    this.startLife(p);
    this.world.spawnPlayer(p, this.mcfg.startMass, at);
    p.frozen = true;
    p.brState = 'playing';
    p.brPlace = 0;
    this.participants.push(p);
  }

  startPlaying() {
    for (const p of this.participants) p.frozen = false;
    this.state = PLAYING;
    this.roundStart = this.world.time;
    this.stateEndsAt = null;
    this.world.zoneDamage = (x, y, m) => this.zone.damage(x, y, m);
    this.world.spawnArea = () => this.zone.state;
    this.broadcastStatus();
  }

  endRound(why) {
    const alive = this.aliveParticipants().sort((a, b) => this.world.totalMass(b) - this.world.totalMass(a));
    const of = this.participants.length;
    alive.forEach((p, i) => {
      p.brPlace = i + 1;
      p.frozen = true;
      p.brState = 'eliminated';
      if (!p.isBot) {
        const out = this.endLife(p, i === 0 ? 'win' : 'survived', { place: i + 1, of });
        this.sendDead(p, out, { place: i + 1, of, win: i === 0 });
      } else {
        p.lifeEnded = true;
      }
    });
    this.podium = this.participants
      .filter((p) => p.brPlace > 0 && p.brPlace <= 3)
      .sort((a, b) => a.brPlace - b.brPlace)
      .map((p) => ({ place: p.brPlace, name: p.name, skin: p.skin, hue: p.hue, bot: p.isBot }));
    this.state = ENDED;
    this.stateEndsAt = this.world.time + this.mcfg.endedSeconds * 1000;
    this.world.zoneDamage = null;
    this.log?.info(`Batalla real #${this.round} terminada (${why}). Ganó: ${this.podium[0]?.name ?? 'nadie'}`);
    this.broadcastStatus();
  }

  backToLobby() {
    const w = this.world;
    w.reset();
    w.zoneDamage = null;
    w.spawnArea = null;
    w.populate();
    this.zone = null;
    for (const p of [...this.players.values()]) {
      p.alive = false;
      p.frozen = false;
      p.brPlace = 0;
      if (p.isBot) continue;
      if (!p.conn) this.removeHuman(p);
      else p.brState = 'queued';
    }
    this.participants = [];
    this.state = LOBBY;
    this.stateEndsAt = null;
    this.syncBots();
    for (const c of this.conns) {
      c.spectating = null;
      c.lastCam = null;
    }
    this.broadcastStatus();
  }

  // ------------------------------------------------------------------ muertes

  onPlayerDeath(p, killer, reason) {
    if (!this.participants.includes(p)) return;
    const place = this.aliveParticipants().length + 1;
    const of = this.participants.length;
    p.brPlace = place;
    p.brState = 'eliminated';
    if (p.isBot) {
      p.lifeEnded = true;
      return;
    }
    const out = this.endLife(p, reason, { killer, place, of });
    this.sendDead(p, out, { place, of });
    if (p.conn) p.conn.spectating = 'auto';
  }

  leaveExtra(p) {
    if (this.state === PLAYING && this.participants.includes(p)) {
      return { place: this.aliveParticipants().length, of: this.participants.length };
    }
    return {};
  }

  finalizeDisconnected(p) {
    if (p.alive && !p.lifeEnded) {
      const extra = this.leaveExtra(p);
      if (extra.place) p.brPlace = extra.place;
      this.endLife(p, 'disconnect', extra);
    }
    this.removeHuman(p);
  }

  removeHuman(p) {
    if (this.state === PLAYING && this.participants.includes(p) && p.alive && !p.brPlace) {
      p.brPlace = this.aliveParticipants().length;
    }
    p.alive = false;
    super.removeHuman(p);
  }

  // ------------------------------------------------------------------ conexiones

  join(conn, { name, skin }) {
    if (this.humanCount() >= this.mcfg.maxPlayers) {
      conn.sendJson({ t: 'err', code: 'full', msg: 'La Batalla real está llena. Probá en la próxima.' });
      return false;
    }
    const p = this.newHumanPlayer(conn, { name, skin });
    this.attachConn(conn);
    conn.spectating = null;
    if (this.state === LOBBY) {
      p.brState = 'queued';
    } else if (this.state === COUNTDOWN) {
      this.addParticipant(p);
    } else {
      p.brState = 'queued';
      conn.spectating = 'auto';
    }
    conn.sendJson(this.joinedMessage(conn, this.joinExtra(conn)));
    this.broadcastStatus();
    return true;
  }

  joinExtra(conn) {
    return { br: this.statusFor(conn) };
  }

  /** En BR "reaparecer" significa anotarse para la próxima ronda. */
  respawn(conn, { name, skin } = {}) {
    const p = conn.player;
    if (!p || p.alive) return;
    if (name) p.name = name;
    if (skin !== undefined) p.skin = skin;
    p.brState = 'queued';
    if (this.state === COUNTDOWN) this.addParticipant(p);
    else if (this.state !== LOBBY) conn.spectating = 'auto';
    this.broadcastStatus();
  }

  spectate(conn, pid) {
    if (conn.player && conn.player.alive && conn.player.cells.length) return;
    conn.spectating = typeof pid === 'number' && this.players.has(pid) ? pid : 'auto';
  }

  everySecond() {
    super.everySecond();
    this.broadcastStatus();
  }

  statusFor(conn) {
    const now = this.world.time;
    const p = conn.player;
    let phase = null;
    if (this.zone && (this.state === PLAYING || this.state === COUNTDOWN)) {
      const z = this.zone.state;
      phase = {
        i: z.phase + 1,
        n: this.mcfg.phases.length,
        stage: this.state === COUNTDOWN ? 'hold' : z.stage,
        endsIn: this.state === PLAYING ? Math.max(0, this.roundStart + z.stageEndsAt - now) : null,
      };
    }
    return {
      state: this.state,
      round: this.round,
      endsIn: this.stateEndsAt !== null ? Math.max(0, this.stateEndsAt - now) : null,
      alive: this.aliveParticipants().length,
      participants: this.participants.length,
      queued: this.queuedPlayers().length,
      minHumans: this.mcfg.minHumans,
      phase,
      podium: this.podium,
      you: p ? { state: p.brState, place: p.brPlace } : null,
    };
  }

  broadcastStatus() {
    for (const c of this.conns) c.sendJson({ t: 'br', ...this.statusFor(c) });
  }

  summary() {
    const now = this.world.time;
    return {
      humans: this.humanCount(),
      bots: this.bots.length,
      max: this.mcfg.maxPlayers,
      state: this.state,
      queued: this.queuedPlayers().length,
      alive: this.aliveParticipants().length,
      startsIn: this.state === LOBBY && this.stateEndsAt !== null ? Math.max(0, this.stateEndsAt - now) : null,
    };
  }

  /** Admin: arrancar ya. */
  forceStart() {
    if (this.state === LOBBY && this.queuedPlayers().length > 0) this.stateEndsAt = this.world.time;
  }

  forceStop() {
    if (this.state === PLAYING || this.state === COUNTDOWN) this.endRound('admin');
  }
}
