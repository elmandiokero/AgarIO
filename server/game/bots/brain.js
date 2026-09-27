// Inteligencia de los bots: HUIR → ZONA (BR) → CAZAR → COMER.
import { ET } from '../../../shared/constants.js';
import { viewSize, zoomFor, splitDistance, massToRadius } from '../../../shared/formulas.js';

export class BotBrain {
  constructor(player, profile, rng) {
    this.p = player;
    this.prof = profile;
    this.rng = rng;
    this.nextPlanAt = 0;
    this.tx = 0;
    this.ty = 0;
    this.state = 'farm';
    this.food = null;
    this.foodUntil = 0;
    this.wander = null;
    this.outsideSince = null;
    this.prevSeen = new Map(); // id → {x, y} para anticipar presas
  }

  reset() {
    this.nextPlanAt = 0;
    this.food = null;
    this.wander = null;
    this.outsideSince = null;
    this.prevSeen.clear();
  }

  /** Llamar una vez por tick antes de world.step. zone: estado de la zona BR o null. */
  update(world, zone) {
    const p = this.p;
    if (!p.alive || p.cells.length === 0 || p.frozen) return;
    const cen = world.centroid(p);
    if (world.time >= this.nextPlanAt) {
      this.plan(world, zone, cen);
      this.nextPlanAt = world.time + this.prof.reactionMs * this.rng.range(0.7, 1.3);
    }
    const dx = this.tx - cen.x;
    const dy = this.ty - cen.y;
    p.input.dx += (dx - p.input.dx) * 0.25;
    p.input.dy += (dy - p.input.dy) * 0.25;
  }

  plan(world, zone, cen) {
    const p = this.p;
    const g = world.g;
    const prof = this.prof;
    let main = p.cells[0];
    let sumR = 0;
    for (const c of p.cells) {
      sumR += c.r;
      if (c.m > main.m) main = c;
    }
    const view = viewSize(zoomFor(sumR), 16 / 9);
    const hw = (view.w / 2) * prof.viewMul;
    const hh = (view.h / 2) * prof.viewMul;

    const threats = [];
    const prey = [];
    const viruses = [];
    let nearestFood = null;
    let nearestFoodD = Infinity;
    world.grid.query(cen.x - hw, cen.y - hh, cen.x + hw, cen.y + hh, (e) => {
      if (e.removed) return;
      if (e.type === ET.FOOD || e.type === ET.EJECT) {
        const d = Math.hypot(e.x - cen.x, e.y - cen.y);
        if (d < nearestFoodD && (e.type === ET.FOOD || main.m >= g.eatRatio * e.m)) {
          nearestFoodD = d;
          nearestFood = e;
        }
      } else if (e.type === ET.VIRUS) {
        viruses.push(e);
      } else if (e.type === ET.CELL && e.owner !== p) {
        if ((e.owner.protectedUntil || 0) > world.time) return; // recién aparecido: ignorar
        if (e.m >= g.eatRatio * main.m) threats.push(e);
        else if (main.m >= g.eatRatio * e.m * 1.05) prey.push(e);
        else if (e.m / 2 >= g.eatRatio * main.m) threats.push(e);
      }
    });

    // ---- 1) Huir
    let fx = 0, fy = 0, danger = false;
    if (!(prof.ignoreThreat > 0 && this.rng.chance(prof.ignoreThreat))) {
      for (const t of threats) {
        const d = Math.max(1, Math.hypot(t.x - cen.x, t.y - cen.y));
        const edge = d - t.r - main.r;
        const canSplitKill = t.m / 2 >= g.eatRatio * main.m;
        const range = canSplitKill ? 800 : 350;
        if (edge < range) {
          const w = t.m / (d * d);
          fx += ((cen.x - t.x) / d) * w;
          fy += ((cen.y - t.y) / d) * w;
          danger = true;
        }
      }
    }

    // ---- 2) Zona (Batalla real)
    let zoneTarget = null;
    if (zone) {
      const dCur = Math.hypot(cen.x - zone.x, cen.y - zone.y);
      const dNext = Math.hypot(cen.x - zone.nx, cen.y - zone.ny);
      const outside = dCur > zone.r - main.r * 0.5;
      const outsideNext = dNext > Math.max(0, zone.nr - main.r);
      if (outside) this.outsideSince ??= world.time;
      else this.outsideSince = null;
      const early = prof.zoneEarly || zone.stage === 'shrink';
      if (outside || (outsideNext && early)) zoneTarget = { x: zone.nx, y: zone.ny };
    }

    const outsideLong = this.outsideSince !== null && world.time - this.outsideSince > 3000;
    if (danger && !(zoneTarget && outsideLong)) {
      // repulsión de las paredes
      const wallPad = 300;
      if (cen.x < wallPad) fx += 0.002 * (wallPad - cen.x);
      if (cen.x > world.w - wallPad) fx -= 0.002 * (cen.x - (world.w - wallPad));
      if (cen.y < wallPad) fy += 0.002 * (wallPad - cen.y);
      if (cen.y > world.h - wallPad) fy -= 0.002 * (cen.y - (world.h - wallPad));
      const len = Math.hypot(fx, fy) || 1;
      this.setTarget(cen.x + (fx / len) * 700, cen.y + (fy / len) * 700, world, main, viruses);
      this.state = 'flee';
      return;
    }
    if (zoneTarget) {
      this.setTarget(zoneTarget.x, zoneTarget.y, world, main, viruses);
      this.state = 'zone';
      return;
    }

    // ---- 3) Cazar
    if (prey.length && this.rng.chance(prof.huntBias)) {
      let best = null, bestScore = 0;
      for (const c of prey) {
        const d = Math.max(1, Math.hypot(c.x - cen.x, c.y - cen.y));
        const score = c.m / d;
        if (score > bestScore) { bestScore = score; best = c; }
      }
      if (best) {
        let ax = best.x, ay = best.y;
        const prev = this.prevSeen.get(best.id);
        if (prev && prof.id === 'capo') {
          ax += (best.x - prev.x) * 1.5;
          ay += (best.y - prev.y) * 1.5;
        }
        this.prevSeen.clear();
        this.prevSeen.set(best.id, { x: best.x, y: best.y });
        const d = Math.hypot(best.x - main.x, best.y - main.y);
        const halfMass = main.m / 2;
        if (
          prof.aggression > 0 &&
          halfMass >= g.eatRatio * best.m &&
          halfMass >= g.minSplitMass / 2 &&
          p.cells.length <= 2 &&
          d < splitDistance(massToRadius(halfMass)) + main.r * 0.6 &&
          this.rng.chance(prof.aggression)
        ) {
          p.input.dx = ax - cen.x;
          p.input.dy = ay - cen.y;
          p.splitRequests++;
        }
        this.setTarget(ax, ay, world, main, viruses);
        this.state = 'hunt';
        return;
      }
    }

    // ---- 4) Comer
    if (this.food && (this.food.removed || world.time > this.foodUntil)) this.food = null;
    if (!this.food && nearestFood) {
      this.food = nearestFood;
      this.foodUntil = world.time + 2000;
    }
    if (this.food) {
      this.setTarget(this.food.x, this.food.y, world, main, viruses);
      this.state = 'farm';
      return;
    }
    // Pasear
    if (!this.wander || Math.hypot(this.wander.x - cen.x, this.wander.y - cen.y) < 200 || this.rng.chance(0.02)) {
      this.wander = zone ? { x: zone.nx + this.rng.range(-zone.nr, zone.nr) * 0.5, y: zone.ny + this.rng.range(-zone.nr, zone.nr) * 0.5 } : world.randomPoint(200);
    }
    this.setTarget(this.wander.x, this.wander.y, world, main, viruses);
    this.state = 'wander';
  }

  /** Fija el objetivo esquivando cactus si somos lo bastante grandes para explotar. */
  setTarget(x, y, world, main, viruses) {
    const g = world.g;
    if (main.m >= g.virusPopRatio * g.virusMass && viruses.length) {
      let dx = x - main.x, dy = y - main.y;
      const len = Math.hypot(dx, dy) || 1;
      let ux = dx / len, uy = dy / len;
      let rx = 0, ry = 0;
      for (const v of viruses) {
        const vx = v.x - main.x, vy = v.y - main.y;
        const d = Math.hypot(vx, vy) || 1;
        const clearance = main.r + v.r + 120;
        let hit = d < clearance;
        if (!hit && this.prof.virusLookahead) {
          // distancia del cactus al rayo de movimiento
          const proj = vx * ux + vy * uy;
          if (proj > 0 && proj < len) {
            const perp = Math.abs(vx * uy - vy * ux);
            hit = perp < main.r + v.r + 40;
          }
        }
        if (hit) {
          rx -= (vx / d) * (clearance / d);
          ry -= (vy / d) * (clearance / d);
        }
      }
      if (rx || ry) {
        ux += rx; uy += ry;
        const l2 = Math.hypot(ux, uy) || 1;
        x = main.x + (ux / l2) * Math.max(300, len);
        y = main.y + (uy / l2) * Math.max(300, len);
      }
    }
    this.tx = Math.min(world.w, Math.max(0, x));
    this.ty = Math.min(world.h, Math.max(0, y));
  }
}
