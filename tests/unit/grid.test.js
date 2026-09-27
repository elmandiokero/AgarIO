import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpatialGrid } from '../../server/game/grid.js';
import { createRng } from '../../server/util/rng.js';

test('consultas de la grilla coinciden con fuerza bruta', () => {
  const rng = createRng(1);
  const W = 3000;
  const g = new SpatialGrid(W, W, 256);
  const statics = [];
  const dyn = [];
  for (let i = 0; i < 400; i++) {
    const f = { id: i, x: rng.range(0, W), y: rng.range(0, W), r: 10 };
    g.addStatic(f);
    statics.push(f);
  }
  for (let i = 0; i < 80; i++) {
    const d = { id: 1000 + i, x: rng.range(0, W), y: rng.range(0, W), r: rng.range(5, 600) };
    g.addDynamic(d);
    dyn.push(d);
  }
  // quitar algunos estáticos
  for (let i = 0; i < 100; i++) g.removeStatic(statics[i * 3]);
  const removed = new Set(Array.from({ length: 100 }, (_, i) => statics[i * 3]));
  for (let q = 0; q < 50; q++) {
    const x0 = rng.range(0, W), y0 = rng.range(0, W);
    const x1 = x0 + rng.range(10, 900), y1 = y0 + rng.range(10, 900);
    const got = new Set();
    g.query(x0, y0, x1, y1, (e) => got.add(e));
    for (const f of statics) {
      const inside = f.x >= x0 && f.x <= x1 && f.y >= y0 && f.y <= y1;
      if (removed.has(f)) assert.ok(!got.has(f), 'devolvió uno quitado');
      else if (inside) assert.ok(got.has(f), 'faltó un estático');
    }
    for (const d of dyn) {
      const overlaps = d.x + d.r >= x0 && d.x - d.r <= x1 && d.y + d.r >= y0 && d.y - d.r <= y1;
      if (overlaps) assert.ok(got.has(d), 'faltó un dinámico');
    }
    // sin duplicados
    let count = 0;
    g.query(x0, y0, x1, y1, () => count++);
    assert.equal(count, got.size);
  }
});
