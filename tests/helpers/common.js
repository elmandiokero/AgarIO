// Utilidades para los tests.
import { loadConfig, deepMerge } from '../../server/config.js';
import { createNetState } from '../../server/game/netsync.js';

/** Configuración de prueba (sin leer config.json). */
export function testConfig(overrides = {}) {
  const { config } = loadConfig({ overrides: deepMerge({ chat: { cooldownMs: 1200 } }, overrides), createFile: false });
  return config;
}

/** Conexión falsa que guarda los mensajes. */
export function fakeConn({ user = null, aspect = 16 / 9 } = {}) {
  const conn = {
    user,
    aspect,
    net: createNetState(),
    msgs: [],
    binaries: [],
    spectating: null,
    lastCam: null,
    room: null,
    player: null,
    closed: null,
    sendJson(m) {
      this.msgs.push(m);
      return true;
    },
    sendRaw(s) {
      this.msgs.push(JSON.parse(s));
      return true;
    },
    sendBinary(b) {
      this.binaries.push(b);
      return true;
    },
    isOpen: () => true,
    bufferedAmount: () => 0,
    close(code) {
      this.closed = code;
    },
    last(t) {
      for (let i = this.msgs.length - 1; i >= 0; i--) if (this.msgs[i].t === t) return this.msgs[i];
      return null;
    },
    all(t) {
      return this.msgs.filter((m) => m.t === t);
    },
  };
  return conn;
}

export function stepN(room, n, clock, dtMs = 25) {
  for (let i = 0; i < n; i++) {
    room.step();
    clock?.advance(dtMs);
  }
}
