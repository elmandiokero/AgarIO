import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../server/game/world.js';
import { createPlayer } from '../../server/game/player.js';
import { BotBrain } from '../../server/game/bots/brain.js';
import { PROFILES, pickProfile } from '../../server/game/bots/profiles.js';
import { createRng } from '../../server/util/rng.js';
import { testConfig } from '../helpers/common.js';

const cfg = testConfig();

function setup(profile = PROFILES.capo) {
  const rng = createRng(9);
  const w = new World({ width: 4000, height: 4000, game: cfg.game, food: 0, viruses: 0, rng, bots: cfg.bots });
  w.spawnProtectionMs = 0;
  const bot = createPlayer({ pid: 1, name: 'Bot', skin: '', hue: 1, isBot: true });
  w.addCell(bot, 2000, 2000, 200);
  bot.alive = true;
  bot.brain = new BotBrain(bot, profile, rng);
  // Hacer la grilla dinámica
  w.step(25);
  return { w, bot };
}

function other(w, pid, x, y, m) {
  const p = createPlayer({ pid, name: `O${pid}`, skin: '', hue: 2 });
  w.addCell(p, x, y, m);
  p.alive = true;
  w.step(25);
  return p;
}

function think(bot, w, zone = null) {
  bot.brain.nextPlanAt = 0;
  bot.brain.update(w, zone);
  return bot.brain;
}

test('huye de los más grandes', () => {
  const { w, bot } = setup();
  other(w, 2, 2700, 2000, 2000); // cerca pero sin tocarlo
  assert.equal(bot.cells.length, 1);
  const b = think(bot, w);
  assert.equal(b.state, 'flee');
  assert.ok(b.tx < 2000, 'se aleja hacia la izquierda');
});

test('persigue a los más chicos', () => {
  const { w, bot } = setup({ ...PROFILES.capo, aggression: 0 });
  other(w, 3, 2400, 2000, 40);
  const b = think(bot, w);
  assert.equal(b.state, 'hunt');
  assert.ok(b.tx > 2000);
});

test('come comida si no hay nada más', () => {
  const { w, bot } = setup();
  w.addFood(2100, 2100);
  const b = think(bot, w);
  assert.equal(b.state, 'farm');
});

test('ignora a los recién aparecidos', () => {
  const { w, bot } = setup({ ...PROFILES.capo, aggression: 0 });
  const p = other(w, 4, 2300, 2000, 40);
  p.protectedUntil = w.time + 5000;
  const b = think(bot, w);
  assert.notEqual(b.state, 'hunt');
});

test('en Batalla real vuelve a la zona', () => {
  const { w, bot } = setup();
  const zone = { x: 500, y: 500, r: 400, nx: 500, ny: 500, nr: 200, stage: 'hold' };
  const b = think(bot, w, zone);
  assert.equal(b.state, 'zone');
  assert.equal(b.tx, 500);
});

test('mezcla de personalidades', () => {
  const rng = createRng(1);
  const counts = {};
  for (let i = 0; i < 2000; i++) {
    const p = pickProfile(rng, { tranqui: 0.5, normal: 0.35, capo: 0.15 });
    counts[p.id] = (counts[p.id] || 0) + 1;
  }
  assert.ok(counts.tranqui > counts.normal && counts.normal > counts.capo);
});
