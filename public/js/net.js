// Conexión WebSocket con reconexión automática.
import { PROTOCOL_VERSION, OP } from '/shared/constants.js';
import { encodeMove, encodeOp, decodeSnapshot } from '/shared/codec.js';

export class Net {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.retry = 0;
    this.connected = false;
    this.stopped = false;
    this.helloExtra = () => ({});
    this.lastMove = { dx: 0, dy: 0, t: 0 };
    this.rtt = 0;
    this.pingTimer = null;
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
  }

  emit(type, msg) {
    const list = this.handlers.get(type);
    if (!list) return;
    for (const fn of list) {
      try {
        fn(msg);
      } catch (err) {
        console.error(`Error manejando "${type}":`, err);
      }
    }
  }

  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.connected = true;
      this.send({ t: 'hello', v: PROTOCOL_VERSION, ...this.helloExtra() });
      this.emit('open');
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.send({ t: 'ping', c: performance.now() }), 2000);
    };
    ws.onmessage = (ev) => {
      const now = performance.now();
      if (typeof ev.data === 'string') {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.t === 'pong') this.rtt = Math.round(now - msg.c);
        this.emit(msg.t, msg);
      } else {
        let snap;
        try {
          snap = decodeSnapshot(ev.data);
        } catch (err) {
          console.warn('Snapshot inválido', err);
          return;
        }
        snap.recv = now;
        this.emit('snapshot', snap);
      }
    };
    ws.onclose = (ev) => {
      const was = this.connected;
      this.connected = false;
      clearInterval(this.pingTimer);
      this.emit('close', { code: ev.code, was });
      if (this.stopped || ev.code === 4002 || ev.code === 4003 || ev.code === 4001) return;
      const wait = Math.min(10000, 500 * 2 ** this.retry++);
      setTimeout(() => this.connect(), wait);
    };
    ws.onerror = () => {};
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  sendMove(dx, dy, now) {
    if (!this.ws || this.ws.readyState !== 1) return;
    const lm = this.lastMove;
    const since = now - lm.t;
    if (since < 33) return;
    const changed = Math.abs(dx - lm.dx) > 1.5 || Math.abs(dy - lm.dy) > 1.5;
    if (!changed && since < 250) return;
    this.ws.send(encodeMove(dx, dy));
    lm.dx = dx;
    lm.dy = dy;
    lm.t = now;
  }

  split() {
    if (this.ws?.readyState === 1) this.ws.send(encodeOp(OP.SPLIT));
  }

  eject(on) {
    if (this.ws?.readyState === 1) this.ws.send(encodeOp(on ? OP.EJECT_ON : OP.EJECT_OFF));
  }
}
