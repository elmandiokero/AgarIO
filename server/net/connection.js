// Una conexión WebSocket de un navegador.
import { createNetState } from '../game/netsync.js';
import { TokenBucket } from '../util/rate-limit.js';

let nextConnId = 1;

export class Connection {
  constructor(ws, ip) {
    this.id = nextConnId++;
    this.ws = ws;
    this.ip = ip;
    this.user = null;
    this.room = null;
    this.player = null;
    this.aspect = 16 / 9;
    this.net = createNetState();
    this.spectating = null;
    this.lastCam = null;
    this.helloed = false;
    this.alive = true;
    this.mutedUntil = 0;
    this.bucket = new TokenBucket(60, 120);
    this.overflowSince = null;
    this.chatBucket = null;
  }

  isOpen() {
    return this.ws.readyState === 1;
  }

  bufferedAmount() {
    return this.ws.bufferedAmount;
  }

  sendRaw(str) {
    if (this.ws.readyState !== 1) return false;
    this.ws.send(str);
    return true;
  }

  sendJson(obj) {
    return this.sendRaw(JSON.stringify(obj));
  }

  sendBinary(bytes) {
    if (this.ws.readyState !== 1) return false;
    this.ws.send(bytes, { binary: true });
    return true;
  }

  close(code = 1000, reason = '') {
    try {
      this.ws.close(code, reason);
    } catch {
      /* ignorar */
    }
  }
}
