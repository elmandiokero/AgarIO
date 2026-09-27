import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../server/game/world.js';
import { createPlayer } from '../../server/game/player.js';
import { createRng } from '../../server/util/rng.js';
import { massToRadius } from '../../shared/formulas.js';
import { MAX_CELLS } from '../../shared/constants.js';
import { testConfig } from '../helpers/common.js';

const cfg = testConfig();

function mkWorld(game = {}) {
  const w = new World({ width: 3000, height: 3000, game: { ...cfg.game, ...game }, food: 0, viruses: 0, rng: createRng(5), bots: cfg.bots });
  w.spawnProtectionMs = 0;
  return w;
}

let nextPid = 1;
function mkPlayer(w, x, y, mass, { isBot = false } = {}) {
  const p = createPlayer({ pid: nextPid++, name: `P${nextPid}`, skin: '', hue: 10, isBot });
  w.addCell(p, x, y, mass);
  p.alive = true;
  p.lifeEnded = false;
  return p;
}

const total = (p) => p.cells.reduce((s, c) => s + c.m, 0);

test('come comida sólo si el centro está dentro del radio', () => {
  const w = mkWorld();
  const p = mkPlayer(w, 500, 500, 20);
  const r = massToRadius(20);
  const inside = w.addFood(500 + r - 1, 500);
  const outside = w.addFood(500 + r + 3, 500); // +3: al crecer por la primera no alcanza a esta
  w.step(25);
  assert.equal(inside.removed, true);
  assert.equal(outside.removed, undefined);
  assert.equal(p.cells[0].m, 21);
  assert.equal(p.life.foodEaten, 1);
});

test('para comer a otro hace falta 1.25x la masa y superposición', () => {
  for (const [mA, expectEaten] of [[125, true], [124.9, false]]) {
    const w = mkWorld();
    const rA = massToRadius(mA);
    const rB = massToRadius(100);
    const a = mkPlayer(w, 500, 500, mA);
    const b = mkPlayer(w, 500 + (rA - 0.4 * rB) - 0.5, 500, 100);
    w.step(25);
    assert.equal(b.cells.length === 0, expectEaten, `masa ${mA}`);
    if (expectEaten) {
      assert.ok(Math.abs(a.cells[0].m - (mA + 100)) < 0.1); // decaimiento mínimo
      const ev = w.drainEvents();
      assert.equal(ev.length, 1);
      assert.equal(ev[0].player, b);
      assert.equal(ev[0].killer, a);
      assert.equal(a.life.humanKills, 1);
      assert.equal(b.nemesisPid, a.pid);
    }
  }
  // Con superposición insuficiente no come aunque tenga masa
  const w = mkWorld();
  const a = mkPlayer(w, 500, 500, 400);
  const rA = massToRadius(400);
  const b = mkPlayer(w, 500 + (rA - 0.4 * massToRadius(100)) + 1, 500, 100);
  w.step(25);
  assert.equal(b.cells.length, 1);
  assert.ok(a.cells[0].m <= 400 && a.cells[0].m > 399.9);
});

test('dividir conserva la masa, respeta el mínimo y el tope de 16 células', () => {
  const w = mkWorld();
  const p = mkPlayer(w, 1500, 1500, 20000);
  p.input.dx = 100;
  for (let i = 0; i < 6; i++) w.split(p);
  assert.equal(p.cells.length, MAX_CELLS);
  assert.ok(Math.abs(total(p) - 20000) < 1e-6);
  assert.equal(p.life.splits, 4);
  const small = mkPlayer(w, 500, 500, 35);
  assert.equal(w.split(small), 0);
  assert.equal(small.cells.length, 1);
  const ok = mkPlayer(w, 800, 800, 36);
  assert.equal(w.split(ok), 1);
  assert.equal(ok.cells.length, 2);
  // la mitad nueva sale lanzada hacia adelante
  const moving = ok.cells.find((c) => c.bvx !== 0 || c.bvy !== 0);
  assert.ok(moving);
});

test('expulsar masa: pierde 16, la bolita tiene 13, mínimo 35', () => {
  const w = mkWorld();
  const p = mkPlayer(w, 1000, 1000, 100);
  p.input.dx = 200;
  assert.equal(w.eject(p), 1);
  assert.equal(p.cells[0].m, 84);
  assert.equal(w.ejects.length, 1);
  assert.equal(w.ejects[0].m, 13);
  assert.ok(w.ejects[0].x > 1000);
  const tiny = mkPlayer(w, 2000, 2000, 34);
  assert.equal(w.eject(tiny), 0);
});

test('las células propias no se fusionan antes de tiempo y después sí', () => {
  const w = mkWorld();
  const p = mkPlayer(w, 1000, 1000, 50);
  const c2 = w.addCell(p, 1020, 1000, 50);
  const c1 = p.cells[0];
  c1.mergeAt = c2.mergeAt = w.time + 1000;
  for (let i = 0; i < 10; i++) w.step(25);
  assert.equal(p.cells.length, 2);
  assert.ok(Math.hypot(c2.x - c1.x, c2.y - c1.y) > 20, 'se empujaron');
  for (let i = 0; i < 120; i++) w.step(25);
  assert.equal(p.cells.length, 1);
  assert.ok(Math.abs(p.cells[0].m - 100) < 1e-6);
  assert.equal(w.cells.length, 1);
});

test('cactus: explota a los grandes conservando masa (+100)', () => {
  const w = mkWorld();
  const p = mkPlayer(w, 1000, 1000, 500);
  w.addVirus(1050, 1000);
  w.step(25);
  assert.equal(w.viruses.length, 0);
  assert.equal(p.cells.length, MAX_CELLS);
  assert.ok(Math.abs(total(p) - 600) < 0.5, `masa total ${total(p)}`);
  assert.equal(p.life.virusesPopped, 1);
});

test('cactus: los chicos pasan por debajo', () => {
  const w = mkWorld();
  const p = mkPlayer(w, 1000, 1000, 120);
  w.addVirus(1000, 1000);
  w.step(25);
  assert.equal(w.viruses.length, 1);
  assert.equal(p.cells.length, 1);
});

test('cactus: con 16 células sólo suma masa', () => {
  const w = mkWorld();
  const p = mkPlayer(w, 1000, 1000, 500);
  for (let i = 1; i < MAX_CELLS; i++) {
    const c = w.addCell(p, 2500, 2500, 10);
    c.mergeAt = Infinity;
  }
  p.cells[0].mergeAt = Infinity;
  w.addVirus(1030, 1000);
  w.step(25);
  assert.equal(p.cells.length, MAX_CELLS);
  assert.ok(p.cells.some((c) => Math.abs(c.m - 600) < 0.5));
});

test('alimentar un cactus 7 veces dispara uno nuevo', () => {
  const w = mkWorld();
  const p = mkPlayer(w, 500, 1000, 1000);
  p.input.dx = 1;
  const v = w.addVirus(1000, 1000);
  for (let i = 0; i < 7; i++) {
    w.eject(p);
    for (let k = 0; k < 4; k++) w.step(25);
  }
  assert.equal(w.viruses.length, 2);
  assert.equal(v.m, 100);
  const shot = w.viruses.find((x) => x !== v);
  assert.ok(shot.vx > 0, 'sale disparado en la dirección de las expulsiones');
});

test('decaimiento sólo arriba de 100 de masa', () => {
  const w = mkWorld();
  const small = mkPlayer(w, 500, 500, 50);
  const big = mkPlayer(w, 2500, 2500, 1000);
  for (let i = 0; i < 40; i++) w.step(25);
  assert.equal(small.cells[0].m, 50);
  assert.ok(big.cells[0].m < 1000 && big.cells[0].m > 990);
});

test('auto-división arriba de la masa máxima', () => {
  const w = mkWorld();
  const p = mkPlayer(w, 1500, 1500, 30000);
  w.step(25);
  assert.equal(p.cells.length, 2);
});

test('protección al aparecer y jugadores congelados', () => {
  const w = mkWorld();
  w.spawnProtectionMs = 1000;
  const a = mkPlayer(w, 1000, 1000, 400);
  const b = createPlayer({ pid: 999, name: 'Nuevo', skin: '', hue: 1 });
  w.spawnPlayer(b, 20, { x: 1000, y: 1000 });
  for (let i = 0; i < 20; i++) w.step(25);
  assert.equal(b.cells.length, 1, 'protegido');
  for (let i = 0; i < 30; i++) w.step(25);
  assert.equal(b.cells.length, 0, 'se terminó la protección');

  const w2 = mkWorld();
  const big = mkPlayer(w2, 1000, 1000, 400);
  const frozen = mkPlayer(w2, 1000, 1000, 20);
  frozen.frozen = true;
  w2.step(25);
  assert.equal(frozen.cells.length, 1);
  assert.ok(big.cells[0].m > 399.9 && big.cells[0].m <= 400);
});

test('daño de zona elimina células', () => {
  const w = mkWorld();
  const p = mkPlayer(w, 100, 100, 20);
  w.zoneDamage = () => 400; // por segundo
  for (let i = 0; i < 10; i++) w.step(25);
  assert.equal(p.cells.length, 0);
  const ev = w.drainEvents();
  assert.equal(ev[0].reason, 'zone');
  assert.equal(ev[0].killer, null);
});

test('matar justo después de dividirse marca el logro', () => {
  const w = mkWorld();
  const a = mkPlayer(w, 1000, 1000, 1000);
  const b = mkPlayer(w, 1300, 1000, 50, { isBot: true });
  a.input.dx = 300;
  w.split(a);
  for (let i = 0; i < 20 && b.cells.length; i++) w.step(25);
  assert.equal(b.cells.length, 0);
  assert.equal(a.life.splitKill, true);
  assert.equal(a.life.botKills, 1);
});
