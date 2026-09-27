import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  massToRadius, radiusToMass, cellSpeed, zoomFor, viewSize, mergeSeconds, totalXpForLevel, levelFromXp,
  levelProgress, formatGs, formatThousands, formatDuration, MAX_LEVEL, BASE_VIEW_W, BASE_VIEW_H,
} from '../../shared/formulas.js';

test('radio y masa son inversos', () => {
  for (const m of [1, 10, 20, 100, 1234, 22500]) assert.ok(Math.abs(radiusToMass(massToRadius(m)) - m) < 1e-9);
  assert.equal(massToRadius(100), 100);
});

test('la velocidad baja con la masa', () => {
  let prev = Infinity;
  for (const m of [10, 20, 100, 1000, 10000]) {
    const v = cellSpeed(m);
    assert.ok(v < prev);
    prev = v;
  }
});

test('zoom limitado entre el mínimo y 1', () => {
  assert.equal(zoomFor(10), 1);
  assert.ok(zoomFor(100000) >= 0.28);
  assert.ok(zoomFor(500) < zoomFor(100));
});

test('el área visible es la misma en cualquier pantalla', () => {
  const a = viewSize(1, 16 / 9);
  const b = viewSize(1, 0.5);
  assert.ok(Math.abs(a.w * a.h - BASE_VIEW_W * BASE_VIEW_H) < 1);
  assert.ok(Math.abs(b.w * b.h - BASE_VIEW_W * BASE_VIEW_H) < 1);
  // proporción fuera de rango se limita
  const c = viewSize(1, 10);
  assert.ok(Math.abs(c.w / c.h - 2.4) < 1e-9);
});

test('tiempo de fusión con tope de 45 s', () => {
  assert.equal(mergeSeconds(0), 15);
  assert.equal(mergeSeconds(1e6), 45);
});

test('niveles: levelFromXp(totalXpForLevel(L)) === L', () => {
  for (let l = 1; l <= MAX_LEVEL; l++) {
    assert.equal(levelFromXp(totalXpForLevel(l)), l);
    if (l > 1) assert.equal(levelFromXp(totalXpForLevel(l) - 1), l - 1);
  }
  assert.equal(levelFromXp(0), 1);
  assert.equal(levelFromXp(1e12), MAX_LEVEL);
  const p = levelProgress(150);
  assert.equal(p.level, 2);
  assert.equal(p.into, 50);
  assert.equal(p.need, 200);
});

test('formato de guaraníes y duración', () => {
  assert.equal(formatGs(15000), '₲ 15.000');
  assert.equal(formatGs(0), '₲ 0');
  assert.equal(formatThousands(1234567), '1.234.567');
  assert.equal(formatDuration(65_000), '1:05');
  assert.equal(formatDuration(3_725_000), '1h 02m');
});
