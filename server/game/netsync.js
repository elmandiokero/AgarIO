// Snapshot por conexión: sólo lo que el jugador ve, como diferencias (agregados / movidos / quitados).
import { ET, PF, SF } from '../../shared/constants.js';
import { viewSize } from '../../shared/formulas.js';
import { ByteWriter, writeSnapshotHeader, writePlayerInfo, writeAdded, writeUpdated } from '../../shared/codec.js';

export function createNetState() {
  return {
    known: new Set(),
    next: new Set(),
    knownPlayers: new Map(), // pid → infoVersion
    lastSentTick: 0,
    pendingPlayers: null,
  };
}

const writer = new ByteWriter(16 * 1024);
const visList = [];
const addedList = [];
const updatedList = [];
const removedList = [];
const playersToSend = new Map();

/**
 * Arma el snapshot para una conexión. No modifica el estado de la conexión:
 * llamar a commitSnapshot() sólo si el frame se envió de verdad.
 * @returns {Uint8Array}
 */
export function buildSnapshot(room, conn) {
  const world = room.world;
  const ns = conn.net;
  const cam = room.cameraFor(conn);
  const { w: vw, h: vh } = viewSize(cam.zoom, conn.aspect);
  const hw = (vw / 2) * 1.1 + 20;
  const hh = (vh / 2) * 1.1 + 20;
  const x0 = cam.x - hw, x1 = cam.x + hw, y0 = cam.y - hh, y1 = cam.y + hh;

  const vis = ns.next;
  vis.clear();
  visList.length = 0;
  world.grid.query(x0, y0, x1, y1, (e) => {
    if (e.removed) return;
    if (e.x + e.r < x0 || e.x - e.r > x1 || e.y + e.r < y0 || e.y - e.r > y1) return;
    vis.add(e.id);
    visList.push(e);
  });
  // Las células propias siempre (aunque estén recién creadas y todavía no en la grilla)
  const me = conn.player;
  if (me) {
    for (const c of me.cells) {
      if (!vis.has(c.id) && !c.removed) {
        vis.add(c.id);
        visList.push(c);
      }
    }
  }

  addedList.length = 0;
  updatedList.length = 0;
  removedList.length = 0;
  playersToSend.clear();
  const known = ns.known;
  for (const e of visList) {
    if (!known.has(e.id)) addedList.push(e);
    else if (e.type !== ET.FOOD && e.dt > ns.lastSentTick) updatedList.push(e);
    if (e.type === ET.CELL) {
      const o = e.owner;
      if (ns.knownPlayers.get(o.pid) !== o.infoVersion) playersToSend.set(o.pid, o);
    }
  }
  for (const id of known) if (!vis.has(id)) removedList.push(id);

  let flags = 0;
  if (me && me.alive && me.cells.length) flags |= SF.ALIVE;
  if (me && me.frozen) flags |= SF.FROZEN;
  if (conn.spectating) flags |= SF.SPECTATING;

  const w = writer.reset();
  writeSnapshotHeader(w, {
    tick: world.tick,
    time: world.time >>> 0,
    flags,
    camX: cam.x,
    camY: cam.y,
    zoom: cam.zoom,
    zone: room.zoneForNet ? room.zoneForNet() : null,
  });
  w.u16(playersToSend.size);
  for (const p of playersToSend.values()) {
    let pf = 0;
    if (p.isBot) pf |= PF.BOT;
    if (p.userId) pf |= PF.REGISTERED;
    if (p === me) pf |= PF.YOU;
    if (p.isAdmin) pf |= PF.ADMIN;
    writePlayerInfo(w, p, pf);
  }
  w.u16(removedList.length);
  for (const id of removedList) {
    w.u32(id);
    w.u32(world.recentEaten.get(id) || 0);
  }
  w.u16(addedList.length);
  for (const e of addedList) writeAdded(w, e);
  w.u16(updatedList.length);
  for (const e of updatedList) writeUpdated(w, e);

  ns.pendingPlayers = playersToSend.size ? [...playersToSend.values()].map((p) => [p.pid, p.infoVersion]) : null;
  return w.toBytes();
}

/** Confirma que el último snapshot armado se envió. */
export function commitSnapshot(conn, tick) {
  const ns = conn.net;
  const old = ns.known;
  ns.known = ns.next;
  ns.next = old;
  ns.lastSentTick = tick;
  if (ns.pendingPlayers) {
    for (const [pid, v] of ns.pendingPlayers) ns.knownPlayers.set(pid, v);
    ns.pendingPlayers = null;
  }
  if (ns.knownPlayers.size > 512) ns.knownPlayers.clear();
}

/** Olvidar todo (al cambiar de sala / reiniciar ronda). */
export function resetNetState(conn) {
  conn.net.known.clear();
  conn.net.next.clear();
  conn.net.knownPlayers.clear();
  conn.net.lastSentTick = 0;
}
