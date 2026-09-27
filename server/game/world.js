// Simulación del mundo: comida (chipitas), células, expulsiones y cactus.
// Todo es determinista con el RNG inyectado; el tiempo es simulado (ms).
import { ET, MAX_CELLS, FOOD_PALETTE } from '../../shared/constants.js';
import { massToRadius, cellSpeed, mergeSeconds, splitDistance, clamp } from '../../shared/formulas.js';
import { SpatialGrid } from './grid.js';

export const BOOST_DECAY = 6; // por segundo: velocidad *= e^(-6·dt). Distancia total = v0 / 6
const MAX_EJECTS = 600;

export function newLifeStats(now) {
  return {
    startedAt: now,
    foodEaten: 0,
    cellsEaten: 0,
    ejectsEaten: 0,
    humanKills: 0,
    botKills: 0,
    virusesPopped: 0,
    splits: 0,
    ejects: 0,
    massGained: 0,
    maxMass: 0,
    bestRank: 0,
    reachedTop1: false,
    lastSplitAt: -Infinity,
    splitKill: false,
    revenge: false,
  };
}

export class World {
  /**
   * @param {object} o
   * @param {number} o.width
   * @param {number} o.height
   * @param {object} o.game  parámetros (ver DEFAULT_CONFIG.game)
   * @param {number} o.food  cantidad objetivo de comida
   * @param {number} o.viruses cantidad objetivo de cactus
   * @param {object} o.rng
   * @param {object} [o.bots] config de bots (softCapMass)
   */
  constructor({ width, height, game, food, viruses, rng, bots = {} }) {
    this.w = width;
    this.h = height;
    this.g = game;
    this.targetFood = food;
    this.targetViruses = viruses;
    this.rng = rng;
    this.botSoftCap = bots.softCapMass ?? 3000;
    this.grid = new SpatialGrid(width, height, 256);
    this.nextId = 1;
    this.tick = 0;
    this.time = 0; // ms simulados
    this.cells = [];
    this.ejects = [];
    this.viruses = [];
    this.foodCount = 0;
    this.entities = new Map();
    this.players = new Set();
    this.events = [];
    this.recentEaten = new Map(); // id → id del que lo comió (hasta el próximo snapshot)
    this.spawnProtectionMs = game.spawnProtectionMs ?? 3000;
    this.zoneDamage = null; // (x, y) => daño por segundo en masa, o null (BR)
    this.spawnArea = null; // () => {x, y, r} área donde aparecer (BR)
    this._cand = [];
  }

  // ------------------------------------------------------------------ entidades

  _id() {
    const id = this.nextId++;
    if (this.nextId > 0xfffffff0) this.nextId = 1;
    return id;
  }

  _setMass(e, m) {
    e.m = m;
    e.r = massToRadius(m);
    e.dt = this.tick;
  }

  randomPoint(margin = 0) {
    if (this.spawnArea) {
      const a = this.spawnArea();
      if (a) {
        const ang = this.rng.angle();
        const rad = Math.sqrt(this.rng.next()) * Math.max(0, a.r - margin);
        return {
          x: clamp(a.x + Math.cos(ang) * rad, margin, this.w - margin),
          y: clamp(a.y + Math.sin(ang) * rad, margin, this.h - margin),
        };
      }
    }
    return { x: this.rng.range(margin, this.w - margin), y: this.rng.range(margin, this.h - margin) };
  }

  addFood(x, y) {
    const f = { id: this._id(), type: ET.FOOD, x, y, m: this.g.foodMass, r: 0, color: this.rng.int(0, FOOD_PALETTE.length - 1), dt: this.tick };
    f.r = massToRadius(f.m);
    this.entities.set(f.id, f);
    this.grid.addStatic(f);
    this.foodCount++;
    return f;
  }

  addVirus(x, y, vx = 0, vy = 0) {
    const v = { id: this._id(), type: ET.VIRUS, x, y, m: 0, r: 0, vx, vy, feedDirX: 1, feedDirY: 0, dt: this.tick };
    this._setMass(v, this.g.virusMass);
    this.entities.set(v.id, v);
    this.viruses.push(v);
    return v;
  }

  addCell(player, x, y, mass) {
    const c = {
      id: this._id(), type: ET.CELL, owner: player, x: clamp(x, 0, this.w), y: clamp(y, 0, this.h),
      m: 0, r: 0, bvx: 0, bvy: 0, mergeAt: 0, dt: this.tick, removed: false,
    };
    this._setMass(c, mass);
    this.entities.set(c.id, c);
    this.cells.push(c);
    player.cells.push(c);
    this.players.add(player);
    return c;
  }

  _removeEntity(e, eater) {
    if (e.removed) return;
    e.removed = true;
    this.entities.delete(e.id);
    this.recentEaten.set(e.id, eater ? eater.id : 0);
    if (e.type === ET.FOOD) {
      this.grid.removeStatic(e);
      this.foodCount--;
    }
  }

  /** Quita una célula. reason: 'eaten' | 'zone' | 'merge' | 'left' */
  removeCell(c, eater, reason) {
    if (c.removed) return;
    this._removeEntity(c, eater);
    const p = c.owner;
    const i = p.cells.indexOf(c);
    if (i >= 0) p.cells.splice(i, 1);
    if (p.cells.length === 0 && p.alive && reason !== 'left') {
      p.alive = false;
      this._onDeath(p, eater ? eater.owner : null, reason);
    }
  }

  /** Quita todas las células de un jugador sin contar como muerte. */
  removePlayer(p) {
    for (const c of [...p.cells]) this.removeCell(c, null, 'left');
    p.cells.length = 0;
    this.players.delete(p);
  }

  /** Busca un lugar lejos de células grandes. */
  findSpawn(mass) {
    const threatMass = mass * this.g.eatRatio;
    let best = null;
    let bestClear = -Infinity;
    for (let i = 0; i < 24; i++) {
      const pt = this.randomPoint(100);
      let clear = Infinity;
      for (const c of this.cells) {
        if (c.m <= threatMass) continue;
        const d = Math.hypot(c.x - pt.x, c.y - pt.y) - c.r;
        if (d < clear) clear = d;
      }
      for (const v of this.viruses) {
        const d = Math.hypot(v.x - pt.x, v.y - pt.y) - v.r - massToRadius(mass);
        if (d < 0) clear = Math.min(clear, d);
      }
      if (clear > 700) return pt;
      if (clear > bestClear) {
        bestClear = clear;
        best = pt;
      }
    }
    return best;
  }

  spawnPlayer(p, mass, at = null) {
    const pt = at || this.findSpawn(mass);
    this.addCell(p, pt.x, pt.y, mass);
    p.alive = true;
    // Protección al aparecer: nadie te puede comer (ni vos a otros jugadores) por unos segundos
    p.protectedUntil = this.time + this.spawnProtectionMs;
    return pt;
  }

  isProtected(p) {
    return (p.protectedUntil || 0) > this.time;
  }

  // ------------------------------------------------------------------ helpers

  centroid(p) {
    let sx = 0, sy = 0, sm = 0;
    for (const c of p.cells) {
      sx += c.x * c.m;
      sy += c.y * c.m;
      sm += c.m;
    }
    if (sm === 0) return null;
    return { x: sx / sm, y: sy / sm, m: sm };
  }

  totalMass(p) {
    let m = 0;
    for (const c of p.cells) m += c.m;
    return m;
  }

  // ------------------------------------------------------------------ acciones

  split(p) {
    if (p.cells.length >= MAX_CELLS || p.frozen) return 0;
    const cen = this.centroid(p);
    if (!cen) return 0;
    const tx = cen.x + p.input.dx;
    const ty = cen.y + p.input.dy;
    const sorted = [...p.cells].sort((a, b) => b.m - a.m);
    let n = 0;
    for (const c of sorted) {
      if (p.cells.length >= MAX_CELLS) break;
      if (c.m < this.g.minSplitMass) continue;
      let dx = tx - c.x, dy = ty - c.y;
      let d = Math.hypot(dx, dy);
      if (d < 1) {
        const a = this.rng.angle();
        dx = Math.cos(a); dy = Math.sin(a); d = 1;
      }
      dx /= d; dy /= d;
      const half = c.m / 2;
      this._setMass(c, half);
      const nc = this.addCell(p, c.x + dx * c.r * 0.5, c.y + dy * c.r * 0.5, half);
      const dist = splitDistance(nc.r);
      nc.bvx = dx * dist * BOOST_DECAY;
      nc.bvy = dy * dist * BOOST_DECAY;
      const mergeAt = this.time + mergeSeconds(half * 2) * 1000;
      c.mergeAt = mergeAt;
      nc.mergeAt = mergeAt;
      n++;
    }
    if (n > 0) {
      p.life.splits++;
      p.life.lastSplitAt = this.time;
    }
    return n;
  }

  eject(p) {
    if (p.frozen) return 0;
    const cen = this.centroid(p);
    if (!cen) return 0;
    const tx = cen.x + p.input.dx;
    const ty = cen.y + p.input.dy;
    let n = 0;
    for (const c of p.cells) {
      if (c.m < this.g.minEjectMass) continue;
      let dx = tx - c.x, dy = ty - c.y;
      let d = Math.hypot(dx, dy);
      if (d < 1) { dx = 1; dy = 0; d = 1; }
      let ang = Math.atan2(dy, dx) + this.rng.range(-0.1, 0.1);
      dx = Math.cos(ang); dy = Math.sin(ang);
      this._setMass(c, c.m - this.g.ejectLoss);
      const e = {
        id: this._id(), type: ET.EJECT, x: clamp(c.x + dx * c.r, 0, this.w), y: clamp(c.y + dy * c.r, 0, this.h),
        m: 0, r: 0, vx: dx * this.g.ejectDistance * BOOST_DECAY, vy: dy * this.g.ejectDistance * BOOST_DECAY,
        hue: p.hue, src: c.id, immuneUntil: this.time + 300, dt: this.tick, removed: false,
      };
      this._setMass(e, this.g.ejectMass);
      this.entities.set(e.id, e);
      this.ejects.push(e);
      n++;
    }
    if (n > 0) p.life.ejects += n;
    if (this.ejects.length > MAX_EJECTS) {
      const extra = this.ejects.splice(0, this.ejects.length - MAX_EJECTS);
      for (const e of extra) this._removeEntity(e, null);
    }
    return n;
  }

  _popCell(c, virus) {
    const p = c.owner;
    this._setMass(c, c.m + virus.m);
    p.life.massGained += virus.m;
    p.life.virusesPopped++;
    this._removeEntity(virus, c);
    const free = MAX_CELLS - p.cells.length;
    if (free <= 0) return;
    const n = Math.min(free, 15, Math.floor(c.m / 2 / 12));
    if (n < 1) return;
    const piece = c.m / 2 / n;
    this._setMass(c, c.m - piece * n);
    const mergeAt = this.time + mergeSeconds(c.m + piece * n) * 1000;
    c.mergeAt = mergeAt;
    const base = this.rng.angle();
    for (let i = 0; i < n; i++) {
      const a = base + (i * Math.PI * 2) / n + this.rng.range(-0.15, 0.15);
      const dx = Math.cos(a), dy = Math.sin(a);
      const nc = this.addCell(p, c.x + dx * c.r * 0.3, c.y + dy * c.r * 0.3, piece);
      nc.bvx = dx * 400 * BOOST_DECAY;
      nc.bvy = dy * 400 * BOOST_DECAY;
      nc.mergeAt = mergeAt;
    }
  }

  _onDeath(victim, killer, reason) {
    if (killer && killer !== victim) {
      if (victim.isBot) killer.life.botKills++;
      else killer.life.humanKills++;
      if (this.time - killer.life.lastSplitAt <= 1000) killer.life.splitKill = true;
      if (killer.nemesisPid && killer.nemesisPid === victim.pid) killer.life.revenge = true;
      victim.nemesisPid = killer.pid;
    }
    this.events.push({ type: 'death', player: victim, killer: killer && killer !== victim ? killer : null, reason });
  }

  // ------------------------------------------------------------------ paso de simulación

  step(dtMs) {
    const dt = dtMs / 1000;
    this.tick++;
    this.time += dtMs;
    const g = this.g;
    const decay = Math.exp(-BOOST_DECAY * dt);

    // 1) Acciones de los jugadores: dividir / expulsar
    for (const p of this.players) {
      if (p.cells.length === 0) continue;
      while (p.splitRequests > 0) {
        p.splitRequests--;
        this.split(p);
      }
      if (p.ejectHeld && this.time - (p.lastEjectAt || -Infinity) >= g.ejectIntervalMs) {
        p.lastEjectAt = this.time;
        this.eject(p);
      }
    }

    // 2) Movimiento de células
    for (const p of this.players) {
      if (p.cells.length === 0) continue;
      const cen = this.centroid(p);
      const tx = cen.x + (p.frozen ? 0 : p.input.dx);
      const ty = cen.y + (p.frozen ? 0 : p.input.dy);
      const mult = p.speedMult || 1;
      for (const c of p.cells) {
        if (!p.frozen) {
          const dx = tx - c.x, dy = ty - c.y;
          const d = Math.hypot(dx, dy);
          if (d > 0.5) {
            const sp = cellSpeed(c.m, g.baseSpeed, g.speedExponent) * mult * Math.min(1, d / (c.r * 0.8 + 30));
            const step = Math.min(d, sp * dt);
            c.x += (dx / d) * step;
            c.y += (dy / d) * step;
          }
        }
        if (c.bvx !== 0 || c.bvy !== 0) {
          c.x += c.bvx * dt;
          c.y += c.bvy * dt;
          c.bvx *= decay;
          c.bvy *= decay;
          if (Math.abs(c.bvx) + Math.abs(c.bvy) < 5) { c.bvx = 0; c.bvy = 0; }
        }
        c.x = clamp(c.x, 0, this.w);
        c.y = clamp(c.y, 0, this.h);
        c.dt = this.tick;
      }
    }

    // 3) Expulsiones y cactus en movimiento
    for (const list of [this.ejects, this.viruses]) {
      for (const e of list) {
        if (e.vx === 0 && e.vy === 0) continue;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.vx *= decay;
        e.vy *= decay;
        if (Math.abs(e.vx) + Math.abs(e.vy) < 5) { e.vx = 0; e.vy = 0; }
        if (e.x < 0 || e.x > this.w) { e.x = clamp(e.x, 0, this.w); e.vx = -e.vx * 0.5; }
        if (e.y < 0 || e.y > this.h) { e.y = clamp(e.y, 0, this.h); e.vy = -e.vy * 0.5; }
        e.dt = this.tick;
      }
    }

    // 4) Células propias: empujarse o fusionarse
    for (const p of this.players) {
      const cs = p.cells;
      if (cs.length < 2) continue;
      for (let i = 0; i < cs.length; i++) {
        const a = cs[i];
        if (a.removed) continue;
        for (let j = i + 1; j < cs.length; j++) {
          if (a.removed) break;
          const b = cs[j];
          if (b.removed) continue;
          let dx = b.x - a.x, dy = b.y - a.y;
          let d = Math.hypot(dx, dy);
          const rs = a.r + b.r;
          if (d >= rs) continue;
          const canMerge = this.time >= a.mergeAt && this.time >= b.mergeAt;
          if (canMerge) {
            const big = a.m >= b.m ? a : b;
            const small = big === a ? b : a;
            if (d <= big.r - small.r * 0.2) {
              this._setMass(big, big.m + small.m);
              // No usar removeCell acá: estamos recorriendo p.cells
              this._removeEntity(small, big);
            }
            continue;
          }
          // Recién divididas: dejar que se separen
          const boostA = Math.abs(a.bvx) + Math.abs(a.bvy);
          const boostB = Math.abs(b.bvx) + Math.abs(b.bvy);
          if (boostA > 2 * cellSpeed(a.m, g.baseSpeed, g.speedExponent) || boostB > 2 * cellSpeed(b.m, g.baseSpeed, g.speedExponent)) continue;
          if (d < 0.01) {
            const ang = this.rng.angle();
            dx = Math.cos(ang); dy = Math.sin(ang); d = 1;
          }
          const overlap = rs - d;
          const nx = dx / d, ny = dy / d;
          const tot = a.m + b.m;
          const pushA = overlap * (b.m / tot) * 0.5;
          const pushB = overlap * (a.m / tot) * 0.5;
          a.x = clamp(a.x - nx * pushA, 0, this.w);
          a.y = clamp(a.y - ny * pushA, 0, this.h);
          b.x = clamp(b.x + nx * pushB, 0, this.w);
          b.y = clamp(b.y + ny * pushB, 0, this.h);
        }
      }
      // limpiar células fusionadas
      if (cs.some((c) => c.removed)) p.cells = cs.filter((c) => !c.removed);
    }
    if (this.cells.some((c) => c.removed)) this.cells = this.cells.filter((c) => !c.removed);

    // 5) Reconstruir la grilla dinámica
    this.grid.clearDynamic();
    for (const c of this.cells) this.grid.addDynamic(c);
    for (const e of this.ejects) this.grid.addDynamic(e);
    for (const v of this.viruses) this.grid.addDynamic(v);

    // 6) Comer (de la célula más grande a la más chica)
    const order = this.cells.slice().sort((a, b) => b.m - a.m);
    const cand = this._cand;
    for (const a of order) {
      if (a.removed) continue;
      const p = a.owner;
      if (p.frozen) continue;
      cand.length = 0;
      const reach = a.r + 12;
      this.grid.query(a.x - reach, a.y - reach, a.x + reach, a.y + reach, (e) => cand.push(e));
      for (const b of cand) {
        if (b === a || b.removed) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (b.type === ET.FOOD) {
          if (d2 < a.r * a.r) {
            this._setMass(a, a.m + b.m);
            p.life.foodEaten++;
            p.life.massGained += b.m;
            this._removeEntity(b, a);
          }
          continue;
        }
        if (d2 > a.r * a.r) continue;
        const d = Math.sqrt(d2);
        if (b.type === ET.EJECT) {
          if (b.src === a.id && this.time < b.immuneUntil) continue;
          if (a.m >= g.eatRatio * b.m && d <= a.r - g.eatOverlap * b.r) {
            this._setMass(a, a.m + b.m);
            p.life.ejectsEaten++;
            p.life.massGained += b.m;
            this._removeEntity(b, a);
          }
        } else if (b.type === ET.VIRUS) {
          if (a.m >= g.virusPopRatio * b.m && d <= a.r - g.eatOverlap * b.r) {
            this._popCell(a, b);
          }
        } else if (b.type === ET.CELL) {
          if (b.owner === p || b.owner.frozen) continue;
          if (this.isProtected(b.owner) || this.isProtected(p)) continue;
          if (a.m >= g.eatRatio * b.m && d <= a.r - g.eatOverlap * b.r) {
            this._setMass(a, a.m + b.m);
            p.life.cellsEaten++;
            p.life.massGained += b.m;
            b.owner.lastHitBy = p;
            this.removeCell(b, a, 'eaten');
          }
        }
      }
    }
    if (this.ejects.some((e) => e.removed)) this.ejects = this.ejects.filter((e) => !e.removed);
    if (this.viruses.some((v) => v.removed)) this.viruses = this.viruses.filter((v) => !v.removed);

    // 7) Expulsiones que alimentan cactus
    if (this.ejects.length && this.viruses.length) {
      for (const e of this.ejects) {
        if (e.removed) continue;
        for (const v of this.viruses) {
          if (v.removed) continue;
          const dx = v.x - e.x, dy = v.y - e.y;
          if (dx * dx + dy * dy > v.r * v.r) continue;
          const sp = Math.hypot(e.vx, e.vy);
          if (sp > 1) { v.feedDirX = e.vx / sp; v.feedDirY = e.vy / sp; }
          else { const d = Math.hypot(dx, dy) || 1; v.feedDirX = dx / d; v.feedDirY = dy / d; }
          this._setMass(v, v.m + e.m);
          this._removeEntity(e, v);
          if (v.m >= g.virusMass + g.ejectMass * g.virusFeedsToShoot - 0.001) {
            this._setMass(v, g.virusMass);
            if (this.viruses.length < Math.max(2, this.targetViruses * 1.5)) {
              const sp2 = g.virusShootDistance * BOOST_DECAY;
              this.addVirus(v.x, v.y, v.feedDirX * sp2, v.feedDirY * sp2);
            }
          }
          break;
        }
      }
      if (this.ejects.some((e) => e.removed)) this.ejects = this.ejects.filter((e) => !e.removed);
    }

    // 8) Decaimiento, daño de zona, auto-división
    for (const p of this.players) {
      if (p.cells.length === 0) continue;
      const total = this.totalMass(p);
      const rateMult = p.isBot && total > this.botSoftCap ? 4 : 1;
      for (const c of [...p.cells]) {
        if (c.m > g.decayMinMass) {
          this._setMass(c, Math.max(g.decayMinMass, c.m - c.m * g.decayRate * rateMult * dt));
        }
        if (this.zoneDamage) {
          const dmg = this.zoneDamage(c.x, c.y, c.m);
          if (dmg > 0) {
            const nm = c.m - dmg * dt;
            if (nm < g.minCellMass) {
              this.removeCell(c, null, 'zone');
              continue;
            }
            this._setMass(c, nm);
          }
        }
        if (c.m > g.maxCellMass) {
          if (p.cells.length < MAX_CELLS) {
            const half = c.m / 2;
            this._setMass(c, half);
            const a = this.rng.angle();
            const nc = this.addCell(p, c.x, c.y, half);
            const dist = splitDistance(nc.r);
            nc.bvx = Math.cos(a) * dist * BOOST_DECAY;
            nc.bvy = Math.sin(a) * dist * BOOST_DECAY;
            nc.mergeAt = c.mergeAt = this.time + mergeSeconds(half * 2) * 1000;
          } else {
            this._setMass(c, g.maxCellMass);
          }
        }
      }
      const m = this.totalMass(p);
      if (m > p.life.maxMass) p.life.maxMass = m;
    }
    if (this.cells.some((c) => c.removed)) this.cells = this.cells.filter((c) => !c.removed);

    // 9) Reponer comida y cactus
    let spawned = 0;
    while (this.foodCount < this.targetFood && spawned < g.foodPerTick) {
      const pt = this.randomPoint(10);
      this.addFood(pt.x, pt.y);
      spawned++;
    }
    if (this.viruses.length < this.targetViruses && this.tick % 10 === 0) {
      const pt = this.findVirusSpot();
      if (pt) this.addVirus(pt.x, pt.y);
    }
  }

  findVirusSpot() {
    for (let i = 0; i < 10; i++) {
      const pt = this.randomPoint(150);
      let ok = true;
      for (const c of this.cells) {
        if (Math.hypot(c.x - pt.x, c.y - pt.y) < c.r + 150) { ok = false; break; }
      }
      if (ok) for (const v of this.viruses) {
        if (Math.hypot(v.x - pt.x, v.y - pt.y) < 300) { ok = false; break; }
      }
      if (ok) return pt;
    }
    return null;
  }

  /** Llena comida y cactus de golpe (al crear la sala / reiniciar ronda). */
  populate() {
    while (this.foodCount < this.targetFood) {
      const pt = this.randomPoint(10);
      this.addFood(pt.x, pt.y);
    }
    let tries = 0;
    while (this.viruses.length < this.targetViruses && tries++ < this.targetViruses * 5) {
      const pt = this.findVirusSpot();
      if (pt) this.addVirus(pt.x, pt.y);
    }
  }

  /** Borra todo (para reiniciar una ronda de Batalla real). */
  reset() {
    for (const p of [...this.players]) this.removePlayer(p);
    this.grid = new SpatialGrid(this.w, this.h, 256);
    this.cells = [];
    this.ejects = [];
    this.viruses = [];
    this.foodCount = 0;
    this.entities.clear();
    this.recentEaten.clear();
    this.events.length = 0;
  }

  drainEvents() {
    const ev = this.events;
    this.events = [];
    return ev;
  }
}
