// Chat global: todos los conectados (menú, Clásico y Batalla real) en un mismo canal, al instante.
import { cleanName, createWordFilter } from '../../shared/sanitize.js';
import { ChatService } from '../game/chat.js';

const HISTORY = 60;
const WHERE = { ffa: 'Clásico', br: 'Batalla real' };

export class GlobalChat {
  /**
   * @param {object} o
   * @param {object} o.config
   * @param {object} [o.repos]  para no permitir que un invitado use el nombre de una cuenta
   * @param {object} o.clock
   * @param {(json: string) => void} o.broadcast  envía a todos los conectados
   * @param {(conn, cmd, args, reply) => void} [o.onAdminCommand]
   */
  constructor({ config, repos = null, clock, broadcast, onAdminCommand = null }) {
    this.chat = new ChatService(config);
    this.nameFilter = createWordFilter(config.chat.badWords);
    this.repos = repos;
    this.clock = clock;
    this.broadcast = broadcast;
    this.onAdminCommand = onAdminCommand;
    this.history = [];
    this.nextId = 1;
  }

  nameFor(conn, rawName) {
    if (conn.user) return conn.user.display_name;
    if (conn.player?.name) return conn.player.name;
    const n = cleanName(rawName);
    if (!n || this.nameFilter.test(n)) return 'Invitado';
    if (this.repos && this.repos.isNameTaken(n)) return 'Invitado';
    return n;
  }

  historyMessage() {
    return { t: 'gchat_hist', msgs: this.history };
  }

  systemTo(conn, text) {
    conn.sendJson({ t: 'gchat', m: { id: 0, sys: true, text, ts: this.clock.now() } });
  }

  /** Mensaje de sistema para todos (ej. anuncios). */
  announce(text) {
    this.push({ sys: true, text });
  }

  push(fields) {
    const m = { id: this.nextId++, ts: this.clock.now(), ...fields };
    this.history.push(m);
    if (this.history.length > HISTORY) this.history.shift();
    this.broadcast(JSON.stringify({ t: 'gchat', m }));
    return m;
  }

  handle(conn, msg) {
    if (typeof msg.text !== 'string') return;
    const r = this.chat.parse(conn, msg.text, this.clock.now());
    if (!r) return;
    if (r.kind === 'error') return this.systemTo(conn, r.text);
    if (r.kind === 'command') {
      if (r.cmd === 'ayuda' || r.cmd === 'help') {
        return this.systemTo(conn, conn.user?.is_admin ? 'Admin: /anuncio texto, /kick nombre, /mute nombre minutos, /perf' : 'Escribí y apretá Enter: te leen todos los conectados. ¡Jaha!');
      }
      if (!conn.user?.is_admin) return this.systemTo(conn, 'Ese comando es sólo para admins.');
      return this.onAdminCommand?.(conn, r.cmd, r.args, (t) => this.systemTo(conn, t));
    }
    this.push({
      from: this.nameFor(conn, msg.name),
      text: r.text,
      admin: !!conn.user?.is_admin,
      reg: !!conn.user,
      where: conn.room ? WHERE[conn.room.mode] || '' : 'Menú',
    });
  }
}
