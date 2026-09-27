// Inteligencia de los bots.
//
// En vez de una máquina de estados simple, cada bot "piensa" varias veces por segundo:
//   1. Percibe lo que tiene alrededor (una sola consulta a la grilla) y estima velocidades.
//   2. Clasifica: comida, presas (con chance real de alcanzarlas), amenazas (con alcance de
//      división y posición anticipada), cactus (peligro, refugio o comida) y la zona (BR).
//   3. Prueba ~20 direcciones posibles y a cada una le pone un puntaje:
//        + comida y presas cercanas al punto de llegada
//        − amenazas (ahora y un poco más adelante, para no meterse en callejones sin salida)
//        − paredes / esquinas, cactus que lo harían explotar, quedar afuera de la zona
//        + refugio bajo un cactus si es chico y lo persigue uno grande
//   4. Acciones especiales: dividirse para atacar (sólo si es seguro), doble división,
//      dispararle un cactus a un jugador grande, y reflejos inmediatos ante un peligro.
// Cada personalidad (tranqui, normal, cazador, capo) cambia reacción, visión, agresividad,
// cautela y puntería. La dificultad global (config bots.difficulty) escala todo.
import { ET, MAX_CELLS } from '../../../shared/constants.js';
import { viewSize, zoomFor, splitDistance, massToRadius, cellSpeed } from '../../../shared/formulas.js';

const TAU = Math.PI * 2;
const N_DIRS = 20;
const MAX_FOODS = 160;
const SAFE_GAP = 280;

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/** Distancia de un punto (px,py) al segmento a→b. */
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/** Penalización por peligro según la distancia libre ("gap") a una amenaza. */
function dangerOf(gap) {
  if (gap <= 0) return 12 + Math.min(20, -gap / 40);
  if (gap >= SAFE_GAP) return 0;
  const k = 1 - gap / SAFE_GAP;
  return 6 * k * k;
}

export class BotBrain {
  constructor(player, profile, rng) {
    this.p = player;
    this.prof = profile;
    this.rng = rng;
    this.reset();
  }

  reset() {
    this.nextPlanAt = 0;
    this.lastPlanAt = -Infinity;
    this.tx = 0;
    this.ty = 0;
    this.dirX = 1;
    this.dirY = 0;
    this.state = 'farm';
    this.seen = new Map(); // id de célula → última posición vista (para estimar velocidad)
    this.threatCells = [];
    this.shot = null;
    this.shotCooldownUntil = 0;
    this.lastDanger = 0;
    if (this.p) this.p.ejectHeld = false;
  }

  /** Se llama una vez por tick antes de world.step. zone: estado de la zona BR (con timeLeft) o null. */
  update(world, zone) {
    const p = this.p;
    if (!p.alive || p.cells.length === 0 || p.frozen) {
      if (p.ejectHeld) p.ejectHeld = false;
      return;
    }
    const cen = world.centroid(p);

    // Reflejo: si una amenaza se acercó de golpe, pensar ya mismo
    let replan = world.time >= this.nextPlanAt;
    if (!replan && world.time - this.lastPlanAt > 60 && this.reflexCheck(world)) {
      replan = true;
      if (this.shot) this.endShot();
    }

    if (this.shot && !replan) {
      if (this.continueShot(world, cen)) return;
    }

    if (replan) {
      this.plan(world, zone, cen);
      this.lastPlanAt = world.time;
      this.nextPlanAt = world.time + this.prof.reactionMs * this.rng.range(0.75, 1.25);
      if (this.shot) {
        this.continueShot(world, cen);
        return;
      }
    }

    const dx = this.tx - cen.x;
    const dy = this.ty - cen.y;
    const k = this.state === 'flee' ? 0.65 : this.state === 'split-kill' ? 1 : 0.3;
    p.input.dx += (dx - p.input.dx) * k;
    p.input.dy += (dy - p.input.dy) * k;
  }

  reflexCheck(world) {
    const p = this.p;
    const g = world.g;
    for (const t of this.threatCells) {
      if (t.removed) continue;
      for (const c of p.cells) {
        if (t.m < g.eatRatio * c.m) continue;
        const gap = dist(t.x, t.y, c.x, c.y) - (t.r - 0.4 * c.r);
        if (gap < this.prof.reflex) return true;
      }
    }
    return false;
  }

  // ------------------------------------------------------------------ disparo de cactus

  continueShot(world, cen) {
    const s = this.shot;
    const v = s.virus;
    if (v.removed || world.time > s.until || v.m < s.lastM - 0.001) {
      this.endShot(world.time);
      return false;
    }
    s.lastM = v.m;
    const p = this.p;
    p.input.dx = v.x - cen.x;
    p.input.dy = v.y - cen.y;
    p.ejectHeld = true;
    this.state = 'shoot';
    return true;
  }

  endShot(now = null) {
    this.shot = null;
    this.p.ejectHeld = false;
    if (now !== null) this.shotCooldownUntil = now + 8000; // no gastar toda la masa en disparos
  }

  // ------------------------------------------------------------------ plan

  plan(world, zone, cen) {
    const p = this.p;
    const g = world.g;
    const prof = this.prof;
    const now = world.time;

    // ---- Yo
    let main = p.cells[0];
    let sumR = 0;
    let minM = Infinity;
    let minR = 0;
    let spread = 0;
    for (const c of p.cells) {
      sumR += c.r;
      if (c.m > main.m) main = c;
      if (c.m < minM) {
        minM = c.m;
        minR = c.r;
      }
    }
    for (const c of p.cells) spread = Math.max(spread, dist(c.x, c.y, cen.x, cen.y));
    const myM = world.totalMass(p);
    const nCells = p.cells.length;
    const mySpeed = cellSpeed(main.m, g.baseSpeed, g.speedExponent);
    const H = 0.55; // horizonte de predicción (s)
    const step = Math.max(90, mySpeed * H);

    // ---- Percepción
    const view = viewSize(zoomFor(sumR), 16 / 9);
    const hw = (view.w / 2) * prof.viewMul + 180;
    const hh = (view.h / 2) * prof.viewMul + 180;
    let foods = [];
    const viruses = [];
    const others = [];
    world.grid.query(cen.x - hw, cen.y - hh, cen.x + hw, cen.y + hh, (e) => {
      if (e.removed) return;
      if (e.type === ET.FOOD) foods.push(e);
      else if (e.type === ET.EJECT) {
        if (main.m >= g.eatRatio * e.m) foods.push(e);
      } else if (e.type === ET.VIRUS) viruses.push(e);
      else if (e.type === ET.CELL && e.owner !== p) others.push(e);
    });
    if (foods.length > MAX_FOODS) {
      for (const f of foods) f._bd = (f.x - cen.x) ** 2 + (f.y - cen.y) ** 2;
      foods.sort((a, b) => a._bd - b._bd);
      foods = foods.slice(0, MAX_FOODS);
    }

    // ---- Velocidades estimadas
    const vel = new Map();
    for (const e of others) {
      let vx = 0, vy = 0;
      const prev = this.seen.get(e.id);
      if (prof.predict && prev && now - prev.t > 0 && now - prev.t < 1500) {
        const dt = (now - prev.t) / 1000;
        vx = (e.x - prev.x) / dt;
        vy = (e.y - prev.y) / dt;
        // limitar a una velocidad posible (el impulso de división se suma aparte)
        const vmax = cellSpeed(e.m, g.baseSpeed, g.speedExponent) * 1.2;
        const vm = Math.hypot(vx, vy);
        if (vm > vmax) {
          vx *= vmax / vm;
          vy *= vmax / vm;
        }
      }
      // células recién divididas: sumar el impulso que les queda
      const boostK = (1 - Math.exp(-6 * H)) / 6;
      vel.set(e.id, { px: e.x + vx * H + e.bvx * boostK, py: e.y + vy * H + e.bvy * boostK, vx, vy });
      this.seen.set(e.id, { x: e.x, y: e.y, t: now });
    }
    if (this.seen.size > 400) {
      for (const [id, s] of this.seen) if (now - s.t > 3000) this.seen.delete(id);
    }

    // ---- Clasificación
    const threats = [];
    const prey = [];
    for (const e of others) {
      if ((e.owner.protectedUntil || 0) > now) continue; // recién aparecido: ni amenaza ni presa
      const pv = vel.get(e.id);
      if (e.m >= g.eatRatio * minM) {
        const victimR = e.m >= g.eatRatio * main.m ? main.r : minR;
        const canSplitOnMe = e.m / 2 >= g.eatRatio * minM && e.m >= g.minSplitMass && e.owner.cells.length < MAX_CELLS;
        const splitReach = canSplitOnMe ? splitDistance(massToRadius(e.m / 2)) * 0.85 + 30 : 0;
        const reach = e.r - 0.4 * victimR + splitReach + spread * 0.8;
        const weight = (1 + Math.log2(Math.max(1, e.m / Math.max(1, minM)))) * prof.caution;
        threats.push({ e, px: pv.px, py: pv.py, reach, weight });
      }
      if (main.m >= g.eatRatio * e.m * 1.02) {
        const preySpeed = cellSpeed(e.m, g.baseSpeed, g.speedExponent);
        prey.push({ e, px: pv.px, py: pv.py, vx: pv.vx, vy: pv.vy, speed: preySpeed });
      }
    }
    threats.sort((a, b) => dist(a.e.x, a.e.y, cen.x, cen.y) - dist(b.e.x, b.e.y, cen.x, cen.y));
    this.threatCells = threats.slice(0, 8).map((t) => t.e);

    // Peligro actual (sin moverse)
    let dangerNow = 0;
    for (const t of threats) dangerNow += dangerOf(dist(cen.x, cen.y, t.px, t.py) - t.reach) * t.weight;
    this.lastDanger = dangerNow;

    // ---- Zona (Batalla real)
    let zoneUrgency = 0;
    if (zone) {
      const dNext = Math.max(0, dist(cen.x, cen.y, zone.nx, zone.ny) - Math.max(0, zone.nr - main.r));
      const needSec = dNext / Math.max(30, mySpeed);
      const leftSec = Math.max(0.1, (zone.timeLeft ?? 30000) / 1000);
      zoneUrgency = zone.stage === 'shrink' || zone.stage === 'final' ? 1.5 : Math.min(2, needSec / leftSec);
      if (prof.id === 'capo' || prof.id === 'cazador') zoneUrgency = Math.max(zoneUrgency, needSec > leftSec * 0.6 ? 1 : zoneUrgency);
    }

    // ---- Pesos
    const foodW = Math.min(1, Math.sqrt(500 / Math.max(50, myM))); // a los grandes les importa menos la comida
    const huntW = prof.huntBias * (dangerNow > 8 ? 0.2 : 1);
    const popCells = nCells >= MAX_CELLS;
    const wallMargin = main.r + 180;

    // ---- Direcciones candidatas
    const dirs = [];
    const off = this.rng.next() * (TAU / N_DIRS);
    for (let i = 0; i < N_DIRS; i++) {
      const a = off + (i * TAU) / N_DIRS;
      dirs.push([Math.cos(a), Math.sin(a)]);
    }
    dirs.push([this.dirX, this.dirY]);
    let bestPrey = null;
    let bestPreyScore = 0;
    for (const pr of prey) {
      const d = Math.max(1, dist(cen.x, cen.y, pr.px, pr.py));
      let s = pr.e.m / (1 + d / 250);
      if (pr.speed > mySpeed * 1.05 && d > 350) s *= 0.25; // es más rápida: difícil de alcanzar
      if (s > bestPreyScore) {
        bestPreyScore = s;
        bestPrey = pr;
      }
    }
    if (bestPrey) {
      const d = Math.max(1, dist(cen.x, cen.y, bestPrey.px, bestPrey.py));
      dirs.push([(bestPrey.px - cen.x) / d, (bestPrey.py - cen.y) / d]);
    }
    if (zone) {
      const d = Math.max(1, dist(cen.x, cen.y, zone.nx, zone.ny));
      dirs.push([(zone.nx - cen.x) / d, (zone.ny - cen.y) / d]);
    }
    // Cactus que sirven de refugio (soy más chico que el cactus y me persigue alguien que explotaría)
    const covers = [];
    if (dangerNow > 1) {
      for (const v of viruses) {
        if (main.m >= g.virusPopRatio * v.m || main.r > v.r * 1.05) continue;
        const d = dist(cen.x, cen.y, v.x, v.y);
        if (d > step * 4 + v.r) continue;
        covers.push(v);
        dirs.push([(v.x - cen.x) / Math.max(1, d), (v.y - cen.y) / Math.max(1, d)]);
      }
    }
    /** ¿El camino cen→(x,y) me deja bajo un cactus que me protege de t? */
    const coveredFrom = (t, x, y) => {
      for (const v of covers) {
        if (t.e.m < g.virusPopRatio * v.m) continue;
        if (segDist(v.x, v.y, cen.x, cen.y, x, y) < v.r * 0.6) return true;
      }
      return false;
    };
    const escapeHorizon = Math.max(600, step * 5);

    // ---- Puntaje de cada dirección
    let best = null;
    let bestScore = -Infinity;
    let bestParts = null;
    for (const [ux, uy] of dirs) {
      const x1 = Math.min(world.w, Math.max(0, cen.x + ux * step));
      const y1 = Math.min(world.h, Math.max(0, cen.y + uy * step));
      const x2 = Math.min(world.w, Math.max(0, cen.x + ux * step * 2.2));
      const y2 = Math.min(world.h, Math.max(0, cen.y + uy * step * 2.2));

      // comida
      let food = 0;
      for (const f of foods) food += f.m / (1 + dist(x1, y1, f.x, f.y) / 90);
      food *= foodW;

      // presas
      let hunt = 0;
      for (const pr of prey) {
        let v = pr.e.m / (1 + dist(x1, y1, pr.px, pr.py) / 220);
        if (pr.speed > mySpeed * 1.05 && dist(cen.x, cen.y, pr.px, pr.py) > 350) v *= 0.25;
        hunt += v;
      }
      hunt *= huntW;

      // amenazas (ahora y un poco más adelante; un cactus en el camino puede protegerme)
      let danger = 0;
      for (const t of threats) {
        const cover = covers.length && coveredFrom(t, x2, y2) ? 0.12 : 1;
        danger += dangerOf(dist(x1, y1, t.px, t.py) - t.reach) * t.weight * (cover < 1 ? 0.6 : 1);
        danger += dangerOf(dist(x2, y2, t.px, t.py) - t.reach) * t.weight * 0.45 * cover;
      }

      // cactus
      let virus = 0;
      let shelter = 0;
      for (const v of viruses) {
        const canPop = main.m >= g.virusPopRatio * v.m;
        if (canPop && !popCells) {
          const dPath = segDist(v.x, v.y, cen.x, cen.y, x1, y1);
          if (dPath < main.r + v.r * 0.2 + 25) virus += 45 * (1 + myM / 2000);
        } else if (canPop && popCells) {
          virus -= (v.m * 0.4) / (1 + dist(x1, y1, v.x, v.y) / 150); // con 16 células el cactus es comida
        } else if (covers.includes(v)) {
          // refugio: acercarse al cactus que me cubre
          shelter += Math.min(dangerNow, 30) / (1 + dist(x1, y1, v.x, v.y) / 80);
        }
      }

      // paredes y esquinas
      let wall = 0;
      const wd = [x1, world.w - x1, y1, world.h - y1];
      for (const d of wd) if (d < wallMargin) wall += ((wallMargin - d) / wallMargin) ** 2 * (dangerNow > 1 ? 30 : 6);
      if (dangerNow > 1) {
        // huir hacia una pared es meterse en un callejón: cuánto puedo avanzar antes de chocar
        const hx = ux > 1e-6 ? (world.w - main.r - cen.x) / ux : ux < -1e-6 ? (main.r - cen.x) / ux : Infinity;
        const hy = uy > 1e-6 ? (world.h - main.r - cen.y) / uy : uy < -1e-6 ? (main.r - cen.y) / uy : Infinity;
        const hit = Math.max(0, Math.min(hx, hy));
        if (hit < escapeHorizon) wall += 8 * Math.min(dangerNow, 40) * (1 - hit / escapeHorizon) ** 2;
      }

      // zona
      let zonePen = 0;
      if (zone) {
        const outCur = dist(x1, y1, zone.x, zone.y) - (zone.r - main.r * 0.5);
        if (outCur > 0) zonePen += 60 + outCur * 0.6;
        const outNext = dist(x1, y1, zone.nx, zone.ny) - Math.max(0, zone.nr - main.r);
        if (outNext > 0 && zoneUrgency > 0) zonePen += zoneUrgency * (15 + outNext * 0.25);
      }

      // inercia muy suave: sólo desempata para que no titubee
      const inertia = 0.3 * (ux * this.dirX + uy * this.dirY);

      const score = food + hunt + shelter + inertia - danger * 10 - virus - wall - zonePen;
      if (score > bestScore) {
        bestScore = score;
        best = [ux, uy];
        bestParts = { food, hunt, danger, zonePen };
      }
    }

    // ---- Estado (para depurar y para el ritmo de giro)
    if (dangerNow > 1.5) this.state = 'flee';
    else if (bestParts.zonePen > 0 || (zone && zoneUrgency >= 1)) this.state = 'zone';
    else if (bestParts.hunt > bestParts.food && bestPrey) this.state = 'hunt';
    else if (foods.length) this.state = 'farm';
    else this.state = 'wander';

    // ---- Acciones especiales (sólo si no hay peligro serio)
    if (dangerNow < 1 && this.trySplitKill(world, cen, main, prey, others, viruses)) return;
    if (dangerNow < 0.5 && !zoneUrgency && this.tryVirusShot(world, cen, main, others, viruses, nCells)) return;

    // ---- Objetivo final (con un poco de error humano)
    let [ux, uy] = best;
    if (this.state === 'hunt' && bestPrey) {
      const d = Math.max(1, dist(cen.x, cen.y, bestPrey.px, bestPrey.py));
      const hx = (bestPrey.px - cen.x) / d, hy = (bestPrey.py - cen.y) / d;
      if (hx * ux + hy * uy > 0.8) {
        ux = hx;
        uy = hy;
      }
    }
    const noise = (this.rng.next() - 0.5) * 2 * prof.noise * (this.state === 'flee' ? 0.5 : 1);
    const cs = Math.cos(noise), sn = Math.sin(noise);
    const nx = ux * cs - uy * sn;
    const ny = ux * sn + uy * cs;
    this.dirX = nx;
    this.dirY = ny;
    const reach = Math.max(500, step * 3);
    this.tx = Math.min(world.w, Math.max(0, cen.x + nx * reach));
    this.ty = Math.min(world.h, Math.max(0, cen.y + ny * reach));
  }

  // ------------------------------------------------------------------ dividirse para atacar

  trySplitKill(world, cen, main, prey, others, viruses) {
    const p = this.p;
    const g = world.g;
    const prof = this.prof;
    if (!prey.length || prof.aggression <= 0 || p.cells.length >= MAX_CELLS || main.m < g.minSplitMass) return false;
    const half = main.m / 2;
    const rHalf = massToRadius(half);
    const lead = 0.28;
    let choice = null;
    let bestVal = 0;
    for (const pr of prey) {
      const e = pr.e;
      if (half < g.eatRatio * e.m) continue;
      const tx = e.x + pr.vx * lead;
      const ty = e.y + pr.vy * lead;
      const d = dist(main.x, main.y, tx, ty);
      const reach = (main.r * 0.5 + splitDistance(rHalf) + rHalf - 0.4 * e.r) * 0.9;
      let splits = 0;
      if (d <= reach) splits = 1;
      else if (prof.doubleSplit && p.cells.length <= 2) {
        const quarter = half / 2;
        const rq = massToRadius(quarter);
        const reach2 = reach + (splitDistance(rq) + rq - 0.4 * e.r) * 0.8;
        if (quarter >= g.eatRatio * e.m && d <= reach2 && e.m >= main.m * 0.08) splits = 2;
      }
      if (!splits) continue;
      // ¿Vale la pena? (presas muy chicas no justifican quedar partido)
      if (e.m < Math.max(12, main.m * 0.04)) continue;
      // Seguridad: nadie que pueda comerse a mi mitad cerca del punto de llegada
      const ux = (tx - main.x) / Math.max(1, d);
      const uy = (ty - main.y) / Math.max(1, d);
      const lx = main.x + ux * Math.min(d, reach);
      const ly = main.y + uy * Math.min(d, reach);
      const pieceM = splits === 2 ? half / 2 : half;
      let safe = true;
      for (const o of others) {
        if (o === e || o.m < g.eatRatio * pieceM * 0.95) continue;
        const canSplit = o.m / 2 >= g.eatRatio * pieceM && o.owner.cells.length < MAX_CELLS;
        const oReach = o.r + (canSplit ? splitDistance(massToRadius(o.m / 2)) : 0) + 180;
        if (dist(o.x, o.y, lx, ly) < oReach) {
          safe = false;
          break;
        }
      }
      if (!safe) continue;
      // No partirse contra un cactus
      if (pieceM >= g.virusPopRatio * g.virusMass) {
        for (const v of viruses) {
          if (segDist(v.x, v.y, main.x, main.y, lx, ly) < v.r + rHalf * 0.3) {
            safe = false;
            break;
          }
        }
      }
      if (!safe) continue;
      const val = e.m / (1 + d / 300);
      if (val > bestVal) {
        bestVal = val;
        choice = { tx, ty, splits };
      }
    }
    if (!choice || !this.rng.chance(prof.aggression)) return false;
    const c = world.centroid(p);
    p.input.dx = choice.tx - c.x;
    p.input.dy = choice.ty - c.y;
    p.splitRequests += choice.splits;
    this.tx = choice.tx;
    this.ty = choice.ty;
    this.state = 'split-kill';
    return true;
  }

  // ------------------------------------------------------------------ disparar un cactus

  tryVirusShot(world, cen, main, others, viruses, nCells) {
    const g = world.g;
    const prof = this.prof;
    if (prof.shoot <= 0 || !viruses.length || nCells > 4 || world.time < this.shotCooldownUntil) return false;
    const feedsLeft = (v) => Math.max(1, Math.ceil((g.virusMass + g.ejectMass * g.virusFeedsToShoot - v.m) / g.ejectMass));
    let choice = null;
    let bestVal = 0;
    for (const v of viruses) {
      const dv = dist(cen.x, cen.y, v.x, v.y);
      if (dv > 650 || dv < main.r + v.r + 40) continue;
      if (main.m >= g.virusPopRatio * v.m && dv < main.r + v.r + 120) continue;
      const need = feedsLeft(v);
      if (main.m - need * g.ejectLoss < Math.max(g.minEjectMass, main.m * 0.55)) continue;
      const ux = (v.x - cen.x) / dv;
      const uy = (v.y - cen.y) / dv;
      for (const e of others) {
        if (e.m < g.virusPopRatio * g.virusMass || e.m < main.m * 0.9) continue; // sólo contra grandes
        if ((e.owner.protectedUntil || 0) > world.time) continue;
        const wx = e.x - v.x;
        const wy = e.y - v.y;
        const dw = Math.hypot(wx, wy);
        if (dw < v.r || dw > g.virusShootDistance * 0.85 + e.r) continue;
        if ((wx * ux + wy * uy) / dw < 0.96) continue; // tienen que estar alineados
        const val = e.m / (1 + need);
        if (val > bestVal) {
          bestVal = val;
          choice = { v, need };
        }
      }
    }
    if (!choice || !this.rng.chance(prof.shoot)) return false;
    this.shot = { virus: choice.v, lastM: choice.v.m, until: world.time + choice.need * g.ejectIntervalMs + 700 };
    this.state = 'shoot';
    return true;
  }
}
