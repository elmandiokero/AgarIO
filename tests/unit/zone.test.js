import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Zone } from '../../server/game/zone.js';
import { createRng } from '../../server/util/rng.js';
import { testConfig } from '../helpers/common.js';

const cfg = testConfig();

test('cada círculo siguiente queda dentro del anterior (1000 semillas)', () => {
  for (let seed = 1; seed <= 1000; seed++) {
    const z = new Zone(4500, cfg.br.phases, createRng(seed));
    for (let i = 1; i < z.circles.length; i++) {
      const a = z.circles[i - 1];
      const b = z.circles[i];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      assert.ok(d + b.r <= a.r + 1e-6, `semilla ${seed} fase ${i}`);
    }
  }
});

test('la zona se achica en las fases y hace daño afuera', () => {
  const phases = [
    { hold: 10, shrink: 10, radius: 0.2, dmgPct: 0.01, dmgFlat: 1 },
    { hold: 5, shrink: 5, radius: 0, dmgPct: 0.1, dmgFlat: 6 },
  ];
  const z = new Zone(1000, phases, createRng(3));
  const s0 = z.update(0);
  assert.equal(s0.stage, 'hold');
  assert.equal(s0.r, 720);
  const mid = z.update(15000);
  assert.equal(mid.stage, 'shrink');
  assert.ok(mid.r < 720 && mid.r > 200);
  const p2 = z.update(21000);
  assert.equal(p2.phase, 1);
  assert.equal(p2.stage, 'hold');
  assert.ok(Math.abs(p2.r - 200) < 1e-6);
  const end = z.update(60000);
  assert.equal(end.stage, 'final');
  assert.equal(end.r, 0);
  // daño
  z.update(0);
  assert.equal(z.damage(500, 500, 100), 0);
  assert.equal(z.damage(-500, -500, 100), 0.01 * 100 + 1);
});
