// Modo Clásico: todos contra todos, continuo, con bots siempre presentes.
import { Room } from './room.js';

export class FfaRoom extends Room {
  constructor(opts) {
    super({ ...opts, mode: 'ffa' });
    this.world.populate();
    this.syncBots();
  }

  /** Ajusta la cantidad de bots a la configurada. */
  syncBots() {
    const want = this.mcfg.bots;
    while (this.bots.length < want) this.spawnBot(this.createBot());
    while (this.bots.length > want) {
      // sacar primero los que están muertos o los más chicos
      const sorted = [...this.bots].sort((a, b) => this.world.totalMass(a) - this.world.totalMass(b));
      this.removeBot(sorted[0]);
    }
  }

  afterStep() {
    const now = this.world.time;
    for (const b of this.bots) {
      if (!b.alive && b.respawnAt !== null && now >= b.respawnAt) this.spawnBot(b);
    }
  }

  onPlayerDeath(p, killer, reason) {
    if (p.isBot) {
      const bc = this.config.bots;
      p.respawnAt = this.world.time + this.rng.range(bc.respawnMinSeconds, bc.respawnMaxSeconds) * 1000;
      p.lifeEnded = true;
      return;
    }
    const out = this.endLife(p, reason, { killer });
    this.sendDead(p, out);
  }

  join(conn, { name, skin }) {
    if (this.humanCount() >= this.mcfg.maxPlayers) {
      conn.sendJson({ t: 'err', code: 'full', msg: 'La sala está llena. Probá en un ratito.' });
      return false;
    }
    const p = this.newHumanPlayer(conn, { name, skin });
    this.attachConn(conn);
    conn.spectating = null;
    this.startLife(p);
    this.world.spawnPlayer(p, this.mcfg.startMass);
    conn.sendJson(this.joinedMessage(conn));
    return true;
  }

  respawn(conn, { name, skin } = {}) {
    const p = conn.player;
    if (!p || p.alive) return;
    if (name && !conn.user) p.name = name;
    if (skin !== undefined) p.skin = skin;
    p.pendingDead = null;
    conn.spectating = null;
    this.startLife(p);
    this.world.spawnPlayer(p, this.mcfg.startMass);
    conn.sendJson({ t: 'respawned' });
  }
}
