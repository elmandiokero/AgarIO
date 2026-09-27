// Estado del juego en el cliente + interpolación entre snapshots.
import { ET, SF } from '/shared/constants.js';

function lerp(a, b, k) {
  return a + (b - a) * k;
}

function pushSample(e, t, x, y, r) {
  const s = e.s;
  const last = s[s.length - 1];
  if (last) {
    if (t <= last.t) {
      last.x = x; last.y = y; last.r = r;
      return;
    }
    // Estaba quieta: mantener la posición hasta justo antes de la muestra nueva
    if (t - last.t > 120) s.push({ t: t - 50, x: last.x, y: last.y, r: last.r });
  }
  s.push({ t, x, y, r });
  // Guardar ~700 ms de historia (alcanza aunque el retraso de interpolación suba a 250 ms)
  while (s.length > 2 && s[1].t < t - 700) s.shift();
  if (s.length > 32) s.splice(0, s.length - 32);
}

function sampleAt(e, rt) {
  const s = e.s;
  const n = s.length;
  if (n === 0) return;
  if (n === 1 || rt <= s[0].t) {
    e.x = s[0].x; e.y = s[0].y; e.r = s[0].r;
    return;
  }
  const last = s[n - 1];
  if (rt >= last.t) {
    e.x = last.x; e.y = last.y; e.r = last.r;
    return;
  }
  for (let i = n - 2; i >= 0; i--) {
    const a = s[i];
    if (a.t <= rt) {
      const b = s[i + 1];
      const k = (rt - a.t) / (b.t - a.t);
      e.x = lerp(a.x, b.x, k);
      e.y = lerp(a.y, b.y, k);
      e.r = lerp(a.r, b.r, k);
      return;
    }
  }
}

export class GameState {
  constructor() {
    this.reset();
  }

  reset(world = { w: 6000, h: 6000 }, myPid = 0) {
    this.entities = new Map();
    this.players = new Map();
    this.dying = [];
    this.world = world;
    this.myPid = myPid;
    this.cam = { x: world.w / 2, y: world.h / 2, r: 0.4, s: [] };
    this.zone = null; // {x,y,r,nx,ny,nr} interpolado
    this.zoneS = { s: [], x: 0, y: 0, r: 0 };
    this.nextZone = null;
    this.flags = 0;
    this.offsets = [];
    this.offset = null;
    this.delay = 100;
    this.active = false;
    this.snapCount = 0;
    this.events = []; // para sonidos: {type:'eat'|'kill'|'hurt'}
  }

  get alive() {
    return (this.flags & SF.ALIVE) !== 0;
  }

  get frozen() {
    return (this.flags & SF.FROZEN) !== 0;
  }

  applySnapshot(snap) {
    const recv = snap.recv;
    this.active = true;
    this.snapCount++;
    // Reloj: offset mínimo de las últimas ~2 s y retraso según el jitter
    const off = recv - snap.time;
    const offs = this.offsets;
    offs.push(off);
    if (offs.length > 40) offs.shift();
    let min = Infinity;
    for (const o of offs) if (o < min) min = o;
    const devs = offs.map((o) => o - min).sort((a, b) => a - b);
    const jitter = devs[Math.floor(devs.length * 0.9)] || 0;
    const target = Math.min(250, Math.max(80, jitter + 60));
    this.delay += (target - this.delay) * 0.1;
    this.offset = min;
    this.flags = snap.flags;

    for (const p of snap.players) this.players.set(p.pid, p);

    for (const { id, eater } of snap.removed) {
      const e = this.entities.get(id);
      if (!e) continue;
      this.entities.delete(id);
      if (eater) {
        this.dying.push({ e, eaterId: eater, t0: recv, x: e.x, y: e.y, r: e.r });
        const ea = this.entities.get(eater);
        if (ea && ea.type === ET.CELL && ea.pid === this.myPid) {
          if (e.type === ET.CELL && e.pid !== this.myPid) this.events.push('kill');
          else if (e.type === ET.FOOD || e.type === ET.EJECT) this.events.push('eat');
        } else if (e.type === ET.CELL && e.pid === this.myPid && ea && ea.pid !== this.myPid) {
          this.events.push('hurt');
        }
      }
    }
    for (const a of snap.added) {
      const e = { id: a.id, type: a.type, pid: a.pid || 0, color: a.color || 0, hue: a.hue || 0, s: [], x: a.x, y: a.y, r: a.r, born: recv };
      pushSample(e, snap.time, a.x, a.y, a.r);
      this.entities.set(a.id, e);
    }
    for (const u of snap.updated) {
      const e = this.entities.get(u.id);
      if (e) pushSample(e, snap.time, u.x, u.y, u.r);
    }
    pushSample(this.cam, snap.time, snap.camX, snap.camY, snap.zoom);
    if (snap.zone) {
      pushSample(this.zoneS, snap.time, snap.zone.x, snap.zone.y, snap.zone.r);
      this.nextZone = { x: snap.zone.nx, y: snap.zone.ny, r: snap.zone.nr };
    } else {
      this.zoneS.s.length = 0;
      this.zone = null;
      this.nextZone = null;
    }
  }

  renderTime(now) {
    return now - (this.offset ?? now) - this.delay;
  }

  interpolate(now) {
    if (!this.active) return;
    const rt = this.renderTime(now);
    for (const e of this.entities.values()) {
      if (e.type === ET.FOOD) continue; // la comida no se mueve
      sampleAt(e, rt);
    }
    sampleAt(this.cam, rt);
    if (this.zoneS.s.length) {
      sampleAt(this.zoneS, rt);
      this.zone = { x: this.zoneS.x, y: this.zoneS.y, r: this.zoneS.r };
    }
    // animaciones de "comido"
    const keep = [];
    for (const d of this.dying) {
      const k = Math.max(0, (now - d.t0) / 140);
      if (k >= 1) continue;
      const ea = this.entities.get(d.eaterId);
      if (ea) {
        d.x += (ea.x - d.x) * Math.min(1, k * 1.5);
        d.y += (ea.y - d.y) * Math.min(1, k * 1.5);
      }
      d.k = k;
      keep.push(d);
    }
    this.dying = keep;
  }

  myCells() {
    const out = [];
    for (const e of this.entities.values()) if (e.type === ET.CELL && e.pid === this.myPid) out.push(e);
    return out;
  }

  myMass() {
    let m = 0;
    for (const e of this.entities.values()) {
      if (e.type === ET.CELL && e.pid === this.myPid) m += (e.r / 10) * (e.r / 10);
    }
    return m;
  }
}
