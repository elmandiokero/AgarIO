// Codificación binaria (little-endian) de snapshots e inputs.
import { OP, ET, SF, LIMITS } from './constants.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

export class ByteWriter {
  constructor(size = 4096) {
    this.buf = new ArrayBuffer(size);
    this.view = new DataView(this.buf);
    this.u8a = new Uint8Array(this.buf);
    this.pos = 0;
  }
  reset() {
    this.pos = 0;
    return this;
  }
  ensure(n) {
    if (this.pos + n <= this.buf.byteLength) return;
    let size = this.buf.byteLength * 2;
    while (size < this.pos + n) size *= 2;
    const nb = new ArrayBuffer(size);
    new Uint8Array(nb).set(this.u8a.subarray(0, this.pos));
    this.buf = nb;
    this.view = new DataView(nb);
    this.u8a = new Uint8Array(nb);
  }
  u8(v) { this.ensure(1); this.view.setUint8(this.pos, v); this.pos += 1; }
  u16(v) { this.ensure(2); this.view.setUint16(this.pos, v, true); this.pos += 2; }
  u32(v) { this.ensure(4); this.view.setUint32(this.pos, v >>> 0, true); this.pos += 4; }
  f32(v) { this.ensure(4); this.view.setFloat32(this.pos, v, true); this.pos += 4; }
  /** u16 que se completa después (para contadores). Devuelve la posición. */
  placeholderU16() { const p = this.pos; this.u16(0); return p; }
  patchU16(pos, v) { this.view.setUint16(pos, v, true); }
  str8(s) {
    let bytes = enc.encode(s || '');
    if (bytes.length > LIMITS.STR8_BYTES) {
      // Cortar sin romper UTF-8
      let cut = LIMITS.STR8_BYTES;
      while (cut > 0 && (bytes[cut] & 0xc0) === 0x80) cut--;
      bytes = bytes.subarray(0, cut);
    }
    this.u8(bytes.length);
    this.ensure(bytes.length);
    this.u8a.set(bytes, this.pos);
    this.pos += bytes.length;
  }
  /** Copia de los bytes escritos (seguro para enviar). */
  toBytes() {
    return this.u8a.slice(0, this.pos);
  }
}

export class ByteReader {
  constructor(data) {
    if (data instanceof ArrayBuffer) {
      this.view = new DataView(data);
    } else {
      this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    }
    this.pos = 0;
  }
  get remaining() { return this.view.byteLength - this.pos; }
  u8() { const v = this.view.getUint8(this.pos); this.pos += 1; return v; }
  u16() { const v = this.view.getUint16(this.pos, true); this.pos += 2; return v; }
  u32() { const v = this.view.getUint32(this.pos, true); this.pos += 4; return v; }
  f32() { const v = this.view.getFloat32(this.pos, true); this.pos += 4; return v; }
  str8() {
    const len = this.u8();
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.pos, len);
    this.pos += len;
    return dec.decode(bytes);
  }
}

// ---------------- Input (cliente → servidor) ----------------

export function encodeMove(dx, dy) {
  const b = new ArrayBuffer(9);
  const v = new DataView(b);
  v.setUint8(0, OP.MOVE);
  v.setFloat32(1, dx, true);
  v.setFloat32(5, dy, true);
  return b;
}

export function encodeOp(op) {
  return new Uint8Array([op]).buffer;
}

/** Devuelve {op, dx?, dy?} o null si el mensaje es inválido. */
export function decodeInput(data) {
  const len = data.byteLength;
  if (len !== 1 && len !== 9) return null;
  const r = new ByteReader(data);
  const op = r.u8();
  if (op === OP.MOVE) {
    if (len !== 9) return null;
    const dx = r.f32();
    const dy = r.f32();
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
    return { op, dx, dy };
  }
  if (len !== 1) return null;
  if (op === OP.SPLIT || op === OP.EJECT_ON || op === OP.EJECT_OFF) return { op };
  return null;
}

// ---------------- Snapshot (servidor → cliente) ----------------
/*
 u8  op=0x10 | u32 tick | u32 serverTimeMs
 u8  flags (SF)
 f32 camX, camY, camZoom
 [ZONE] f32 zx, zy, zr, nx, ny, nr
 u16 nPlayers { u16 pid, u8 flags, u8 hue, u8 level, str8 name, str8 skin }
 u16 nRemoved { u32 id, u32 eaterId }
 u16 nAdded   { u32 id, u8 type, f32 x, f32 y, u16 r4, CELL: u16 pid | FOOD: u8 color | EJECT: u8 hue | VIRUS: - }
 u16 nUpdated { u32 id, f32 x, f32 y, u16 r4 }
*/

export function writeSnapshotHeader(w, { tick, time, flags, camX, camY, zoom, zone }) {
  w.u8(OP.SNAPSHOT);
  w.u32(tick);
  w.u32(time);
  w.u8(flags | (zone ? SF.ZONE : 0));
  w.f32(camX);
  w.f32(camY);
  w.f32(zoom);
  if (zone) {
    w.f32(zone.x); w.f32(zone.y); w.f32(zone.r);
    w.f32(zone.nx); w.f32(zone.ny); w.f32(zone.nr);
  }
}

export function writePlayerInfo(w, p, flags) {
  w.u16(p.pid);
  w.u8(flags);
  w.u8(p.hue & 255);
  w.u8(Math.min(255, p.level | 0));
  w.str8(p.name);
  w.str8(p.skin || '');
}

export function r4(r) {
  return Math.min(65535, Math.round(r * 4));
}

export function writeAdded(w, e) {
  w.u32(e.id);
  w.u8(e.type);
  w.f32(e.x);
  w.f32(e.y);
  w.u16(r4(e.r));
  switch (e.type) {
    case ET.CELL: w.u16(e.owner.pid); break;
    case ET.FOOD: w.u8(e.color); break;
    case ET.EJECT: w.u8(e.hue & 255); break;
    default: break;
  }
}

export function writeUpdated(w, e) {
  w.u32(e.id);
  w.f32(e.x);
  w.f32(e.y);
  w.u16(r4(e.r));
}

/** Decodifica un snapshot completo (lo usa el cliente y los tests). */
export function decodeSnapshot(data) {
  const r = new ByteReader(data);
  const op = r.u8();
  if (op !== OP.SNAPSHOT) throw new Error('No es un snapshot');
  const snap = {
    tick: r.u32(),
    time: r.u32(),
    flags: r.u8(),
    camX: r.f32(),
    camY: r.f32(),
    zoom: r.f32(),
    zone: null,
    players: [],
    removed: [],
    added: [],
    updated: [],
  };
  if (snap.flags & SF.ZONE) {
    snap.zone = { x: r.f32(), y: r.f32(), r: r.f32(), nx: r.f32(), ny: r.f32(), nr: r.f32() };
  }
  let n = r.u16();
  for (let i = 0; i < n; i++) {
    snap.players.push({ pid: r.u16(), flags: r.u8(), hue: r.u8(), level: r.u8(), name: r.str8(), skin: r.str8() });
  }
  n = r.u16();
  for (let i = 0; i < n; i++) snap.removed.push({ id: r.u32(), eater: r.u32() });
  n = r.u16();
  for (let i = 0; i < n; i++) {
    const e = { id: r.u32(), type: r.u8(), x: r.f32(), y: r.f32(), r: r.u16() / 4 };
    if (e.type === ET.CELL) e.pid = r.u16();
    else if (e.type === ET.FOOD) e.color = r.u8();
    else if (e.type === ET.EJECT) e.hue = r.u8();
    snap.added.push(e);
  }
  n = r.u16();
  for (let i = 0; i < n; i++) snap.updated.push({ id: r.u32(), x: r.f32(), y: r.f32(), r: r.u16() / 4 });
  return snap;
}
