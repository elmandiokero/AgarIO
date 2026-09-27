// Zona de Batalla real: círculos que se achican por fases.
import { clamp } from '../../shared/formulas.js';

export class Zone {
  /**
   * @param {number} worldSize
   * @param {Array<{hold:number, shrink:number, radius:number, dmgPct:number, dmgFlat:number}>} phases
   *        radius es fracción del tamaño del mapa
   * @param {object} rng
   */
  constructor(worldSize, phases, rng) {
    this.size = worldSize;
    this.phases = phases;
    const circles = [{ x: worldSize / 2, y: worldSize / 2, r: worldSize * 0.72 }];
    for (const ph of phases) {
      const cur = circles[circles.length - 1];
      const nr = Math.max(0, Math.min(cur.r, ph.radius * worldSize));
      const maxOff = Math.max(0, cur.r - nr);
      const ang = rng.angle();
      const off = rng.next() * maxOff;
      // mantener el centro dentro del mapa
      const nx = clamp(cur.x + Math.cos(ang) * off, nr * 0.5, worldSize - nr * 0.5);
      const ny = clamp(cur.y + Math.sin(ang) * off, nr * 0.5, worldSize - nr * 0.5);
      // si el clamp lo sacó del círculo actual, acercarlo al centro actual
      let x = nx, y = ny;
      const d = Math.hypot(x - cur.x, y - cur.y);
      if (d > maxOff && d > 0) {
        x = cur.x + ((x - cur.x) / d) * maxOff;
        y = cur.y + ((y - cur.y) / d) * maxOff;
      }
      circles.push({ x, y, r: nr });
    }
    this.circles = circles;
    // línea de tiempo en ms
    this.timeline = [];
    let t = 0;
    for (const ph of phases) {
      const holdEnd = t + ph.hold * 1000;
      const shrinkEnd = holdEnd + ph.shrink * 1000;
      this.timeline.push({ start: t, holdEnd, shrinkEnd });
      t = shrinkEnd;
    }
    this.totalMs = t;
    this.state = { x: circles[0].x, y: circles[0].y, r: circles[0].r, nx: circles[1]?.x ?? circles[0].x, ny: circles[1]?.y ?? circles[0].y, nr: circles[1]?.r ?? circles[0].r, phase: 0, stage: 'hold', stageEndsAt: 0, dmgPct: phases[0]?.dmgPct ?? 0, dmgFlat: phases[0]?.dmgFlat ?? 0 };
  }

  /** Actualiza el estado para el tiempo t (ms desde que empezó la ronda). */
  update(t) {
    const s = this.state;
    const n = this.phases.length;
    let i = 0;
    while (i < n - 1 && t >= this.timeline[i].shrinkEnd) i++;
    const tl = this.timeline[i];
    const from = this.circles[i];
    const to = this.circles[i + 1] || from;
    const ph = this.phases[i];
    s.phase = i;
    s.dmgPct = ph.dmgPct;
    s.dmgFlat = ph.dmgFlat;
    s.nx = to.x; s.ny = to.y; s.nr = to.r;
    if (t < tl.holdEnd) {
      s.stage = 'hold';
      s.stageEndsAt = tl.holdEnd;
      s.x = from.x; s.y = from.y; s.r = from.r;
    } else if (t < tl.shrinkEnd) {
      s.stage = 'shrink';
      s.stageEndsAt = tl.shrinkEnd;
      const k = (t - tl.holdEnd) / (tl.shrinkEnd - tl.holdEnd);
      s.x = from.x + (to.x - from.x) * k;
      s.y = from.y + (to.y - from.y) * k;
      s.r = from.r + (to.r - from.r) * k;
    } else {
      s.stage = 'final';
      s.stageEndsAt = tl.shrinkEnd;
      s.x = to.x; s.y = to.y; s.r = to.r;
    }
    return s;
  }

  isOutside(x, y) {
    const s = this.state;
    return Math.hypot(x - s.x, y - s.y) > s.r;
  }

  /** Daño por segundo (en masa) para una célula de masa m en (x, y). */
  damage(x, y, m) {
    if (!this.isOutside(x, y)) return 0;
    return this.state.dmgPct * m + this.state.dmgFlat;
  }
}
