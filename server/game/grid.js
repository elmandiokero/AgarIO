// Hash espacial:
//  - "estático": comida (no se mueve) → se inserta/quita una sola vez, por su centro.
//  - "dinámico": células, expulsiones y cactus → se reconstruye cada tick; cada entidad
//    va a todas las celdas de la grilla que cubre su caja.

export class SpatialGrid {
  constructor(width, height, cellSize = 256) {
    this.size = cellSize;
    this.cols = Math.max(1, Math.ceil(width / cellSize));
    this.rows = Math.max(1, Math.ceil(height / cellSize));
    const n = this.cols * this.rows;
    this.stat = Array.from({ length: n }, () => []);
    this.dyn = Array.from({ length: n }, () => []);
    this.usedDyn = [];
    this.stamp = 0;
  }

  _col(x) {
    const c = Math.floor(x / this.size);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }
  _row(y) {
    const r = Math.floor(y / this.size);
    return r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r;
  }

  addStatic(e) {
    const idx = this._row(e.y) * this.cols + this._col(e.x);
    const b = this.stat[idx];
    e._gb = idx;
    e._gi = b.length;
    b.push(e);
  }

  removeStatic(e) {
    const b = this.stat[e._gb];
    if (!b || b[e._gi] !== e) return;
    const last = b.pop();
    if (last !== e) {
      b[e._gi] = last;
      last._gi = e._gi;
    }
    e._gb = -1;
  }

  clearDynamic() {
    for (const idx of this.usedDyn) this.dyn[idx].length = 0;
    this.usedDyn.length = 0;
  }

  addDynamic(e) {
    const c0 = this._col(e.x - e.r), c1 = this._col(e.x + e.r);
    const r0 = this._row(e.y - e.r), r1 = this._row(e.y + e.r);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const idx = r * this.cols + c;
        const b = this.dyn[idx];
        if (b.length === 0) this.usedDyn.push(idx);
        b.push(e);
      }
    }
  }

  /**
   * Visita las entidades de las celdas que tocan el rectángulo.
   * La comida se devuelve si su celda toca el rectángulo (el llamador filtra por distancia).
   */
  query(minX, minY, maxX, maxY, cb, { statics = true, dynamics = true } = {}) {
    const stamp = ++this.stamp;
    const c0 = this._col(minX), c1 = this._col(maxX);
    const r0 = this._row(minY), r1 = this._row(maxY);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const idx = r * this.cols + c;
        if (statics) {
          const s = this.stat[idx];
          for (let i = 0; i < s.length; i++) cb(s[i]);
        }
        if (dynamics) {
          const d = this.dyn[idx];
          for (let i = 0; i < d.length; i++) {
            const e = d[i];
            if (e._q === stamp) continue;
            e._q = stamp;
            cb(e);
          }
        }
      }
    }
  }

  /** Cantidad de comida en la celda que contiene (x, y). Usado por los bots. */
  staticCountAt(x, y) {
    return this.stat[this._row(y) * this.cols + this._col(x)].length;
  }

  staticBucketAt(x, y) {
    return this.stat[this._row(y) * this.cols + this._col(x)];
  }
}
