// Chat de sala: saneamiento, filtro de palabras, límite de mensajes y comandos de admin.
import { cleanChat, createWordFilter } from '../../shared/sanitize.js';
import { TokenBucket } from '../util/rate-limit.js';

export const BOT_PHRASES = [
  '¡Jaha!', 'Aguyje por la chipa 😋', 'Tranquilo pio', 'Mbarete la cosa', 'Ndaje...', 'Jajaja', '¡Opa!',
  'Así nomás es', 'Ha upéicha', '¿Mba\'éichapa?', 'Nde, qué rico', 'Ahí te va', 'Chake!', 'Hetaiterei',
  'Vamos por más', 'Tereré ha chipa 🧉', 'Sapy\'ami', 'Ñembotavy nde', 'Un gusto 😎', 'Poriahu',
];

export class ChatService {
  constructor(config) {
    this.enabled = config.chat.enabled;
    this.cooldownMs = config.chat.cooldownMs;
    this.filter = createWordFilter(config.chat.badWords);
  }

  bucketFor(conn) {
    if (!conn.chatBucket) conn.chatBucket = new TokenBucket(1000 / this.cooldownMs, 3);
    return conn.chatBucket;
  }

  /**
   * Procesa un mensaje. Devuelve {kind:'message', text} | {kind:'command', cmd, args} | {kind:'error', text}
   */
  parse(conn, raw, now = Date.now()) {
    if (!this.enabled) return { kind: 'error', text: 'El chat está desactivado.' };
    if (typeof raw !== 'string') return null;
    const text = cleanChat(raw);
    if (!text) return null;
    if (text.startsWith('/')) {
      const [cmd, ...args] = text.slice(1).split(' ');
      return { kind: 'command', cmd: cmd.toLowerCase(), args };
    }
    if (conn.mutedUntil && conn.mutedUntil > now) {
      return { kind: 'error', text: 'Estás silenciado un ratito. Tomá un tereré 🧉' };
    }
    if (!this.bucketFor(conn).take(1, now)) {
      return { kind: 'error', text: 'Despacio, che. Esperá un poquito.' };
    }
    return { kind: 'message', text: this.filter.censor(text) };
  }
}
