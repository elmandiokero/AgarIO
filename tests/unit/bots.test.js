import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../server/game/world.js';
import { createPlayer } from '../../server/game/player.js';
import { BotBrain } from '../../server/game/bots/brain.js';
import { PROFILES, pickProfile, withDifficulty } from '../../server/game/bots/profiles.js';
import { createRng } from '../../server/util/rng.js';
import { testConfig } from '../helpers/common.js';

const cfg = testConfig();
const capo = { ...PROFILES.capo, noise: 0, aggression: 0, shoot: 0 };

function setup({ profile = capo, mass = 200, x = 2000, y = 2000, seed = 9 } = {}) {
  const rng = createRng(seed);
  const w = new World({ width: 4000, height: 4000, game: cfg.game, food: 0, viruses: 0, rng, bots: cfg.bots });
  w.spawnProtectionMs = 0;
  const bot = createPlayer({ pid: 1, name: 'Bot', skin: '', hue: 1, isBot: true });
  w.addCell(bot, x, y, mass);
  bot.alive = true;
  bot.brain = new BotBrain(bot, profile, rng);
  return { w, bot };
}

let pid = 10;
function other(w, x, y, m) {
  const p = createPlayer({ pid: pid++, name: `O${pid}`, skin: '', hue: 2 });
  w.addCell(p, x, y, m);
  p.alive = true;
  return p;
}

/** Arma la grilla dinámica sin mover a nadie y hace pensar al bot. */
function think(bot, w, zone = null) {
  w.grid.clearDynamic();
  for (const c of w.cells) w.grid.addDynamic(c);
  for (const v of w.viruses) w.grid.addDynamic(v);
  for (const e of w.ejects) w.grid.addDynamic(e);
  bot.brain.nextPlanAt = 0;
  bot.brain.update(w, zone);
  return bot.brain;
}

const dirOf = (b, bot) => {
  const c = bot.cells[0];
  const d = Math.hypot(b.tx - c.x, b.ty - c.y) || 1;
  return { x: (b.tx - c.x) / d, y: (b.ty - c.y) / d };
};

test('huye de los más grandes (incluso si pueden dividirse sobre él)', () => {
  const { w, bot } = setup();
  other(w, 2700, 2000, 2000);
  const b = think(bot, w);
  assert.equal(b.state, 'flee');
  assert.ok(dirOf(b, bot).x < -0.5, 'se aleja hacia la izquierda');
});

test('no huye hacia una pared: escapa en diagonal', () => {
  const { w, bot } = setup({ x: 150, y: 2000 });
  other(w, 900, 2000, 3000);
  const b = think(bot, w);
  assert.equal(b.state, 'flee');
  const d = dirOf(b, bot);
  assert.ok(Math.abs(d.y) > 0.5, `debería escapar hacia arriba o abajo (dir ${d.x.toFixed(2)}, ${d.y.toFixed(2)})`);
});

test('persigue a los más chicos', () => {
  const { w, bot } = setup();
  other(w, 2350, 2000, 40);
  const b = think(bot, w);
  assert.equal(b.state, 'hunt');
  assert.ok(dirOf(b, bot).x > 0.7);
});

test('come comida si no hay nada más, yendo hacia donde hay más', () => {
  const { w, bot } = setup();
  for (let i = 0; i < 15; i++) w.addFood(2000 + (i % 5) * 30, 2400 + Math.floor(i / 5) * 30);
  w.addFood(1700, 2000);
  const b = think(bot, w);
  assert.equal(b.state, 'farm');
  assert.ok(dirOf(b, bot).y > 0.5, 'va hacia el montón de comida de abajo');
});

test('ignora a los recién aparecidos (protegidos)', () => {
  const { w, bot } = setup();
  const p = other(w, 2300, 2000, 40);
  p.protectedUntil = w.time + 5000;
  const b = think(bot, w);
  assert.notEqual(b.state, 'hunt');
});

test('chico y perseguido: se esconde abajo de un cactus', () => {
  const { w, bot } = setup({ mass: 40 });
  other(w, 2900, 2000, 3000); // grande a la derecha
  w.addVirus(2000, 2260); // cactus abajo
  const b = think(bot, w);
  assert.equal(b.state, 'flee');
  assert.ok(dirOf(b, bot).y > 0.4, 'va hacia el cactus');
});

test('grande: esquiva el cactus que tiene enfrente', () => {
  const { w, bot } = setup({ mass: 600 });
  w.addVirus(2330, 2000);
  for (let i = 0; i < 20; i++) w.addFood(2650 + (i % 4) * 25, 1990 + Math.floor(i / 4) * 5);
  const b = think(bot, w);
  const d = dirOf(b, bot);
  const c = bot.cells[0];
  // el camino inmediato no pasa por el cactus
  const px = c.x + d.x * 200, py = c.y + d.y * 200;
  const t = Math.max(0, Math.min(1, ((2330 - c.x) * (px - c.x) + (2000 - c.y) * (py - c.y)) / (200 * 200)));
  const clear = Math.hypot(2330 - (c.x + (px - c.x) * t), 2000 - (c.y + (py - c.y) * t));
  assert.ok(clear > c.r * 0.9, `pasaría encima del cactus (${clear.toFixed(0)})`);
});

test('se divide para atacar cuando es seguro', () => {
  const { w, bot } = setup({ mass: 400, profile: { ...capo, aggression: 1 } });
  const prey = other(w, 2320, 2000, 60);
  const b = think(bot, w);
  assert.equal(b.state, 'split-kill');
  assert.equal(bot.splitRequests, 1);
  assert.ok(bot.input.dx > 250 && Math.abs(bot.input.dy) < 50, 'apunta a la presa');
  // y efectivamente se la come
  for (let i = 0; i < 30 && prey.cells.length; i++) w.step(25);
  assert.equal(prey.cells.length, 0);
});

test('no se divide si otro grande lo espera en el punto de llegada', () => {
  const { w, bot } = setup({ mass: 400, profile: { ...capo, aggression: 1 } });
  other(w, 2320, 2000, 60);
  other(w, 2750, 2150, 700); // come a la mitad de 200 que llegaría
  const b = think(bot, w);
  assert.notEqual(b.state, 'split-kill');
  assert.equal(bot.splitRequests, 0);
});

test('capo: le dispara un cactus a un jugador más grande', () => {
  const { w, bot } = setup({ mass: 400, x: 1300, profile: { ...capo, shoot: 1 } });
  const v = w.addVirus(1800, 2000);
  const victim = other(w, 2400, 2000, 900);
  const b = think(bot, w);
  assert.equal(b.state, 'shoot');
  assert.equal(bot.ejectHeld, true);
  assert.ok(bot.input.dx > 400 && Math.abs(bot.input.dy) < 5, 'apunta al cactus');
  // simular hasta que el cactus dispare
  let fired = false;
  for (let i = 0; i < 80 && !fired; i++) {
    bot.brain.update(w, null);
    w.step(25);
    fired = w.viruses.length > 1 || victim.cells.length !== 1;
  }
  assert.ok(fired, 'el cactus salió disparado');
  for (let i = 0; i < 10; i++) {
    bot.brain.update(w, null);
    w.step(25);
  }
  assert.equal(bot.ejectHeld, false, 'deja de expulsar');
  assert.ok(v.m <= 110);
});

test('Batalla real: vuelve a la zona y se adelanta a la próxima', () => {
  const { w, bot } = setup();
  const zone = { x: 500, y: 500, r: 400, nx: 500, ny: 500, nr: 200, stage: 'hold', timeLeft: 20000 };
  const b = think(bot, w, zone);
  assert.equal(b.state, 'zone');
  const d = dirOf(b, bot);
  assert.ok(d.x < -0.5 && d.y < -0.5);
  // adentro de la zona actual pero lejos de la próxima, con poco tiempo
  const s2 = setup({ x: 1500, y: 1500 });
  const z2 = { x: 1500, y: 1500, r: 1500, nx: 600, ny: 600, nr: 300, stage: 'hold', timeLeft: 2000 };
  const b2 = think(s2.bot, s2.w, z2);
  const d2 = dirOf(b2, s2.bot);
  assert.ok(d2.x < -0.4 && d2.y < -0.4, 'se mueve hacia la próxima zona a tiempo');
});

test('reflejo: re-planifica al instante si una amenaza se acerca de golpe', () => {
  const { w, bot } = setup();
  const big = other(w, 3600, 2000, 2000);
  think(bot, w);
  bot.brain.nextPlanAt = w.time + 10000; // no le toca pensar
  const before = bot.brain.lastPlanAt;
  big.cells[0].x = 2350; // aparece encima
  w.grid.clearDynamic();
  for (const c of w.cells) w.grid.addDynamic(c);
  w.time += 100;
  bot.brain.update(w, null);
  assert.ok(bot.brain.lastPlanAt > before, 'pensó de nuevo');
  assert.equal(bot.brain.state, 'flee');
});

test('personalidades y dificultad', () => {
  const rng = createRng(1);
  const counts = {};
  for (let i = 0; i < 4000; i++) {
    const p = pickProfile(rng, { tranqui: 0.35, normal: 0.35, cazador: 0.15, capo: 0.15 });
    counts[p.id] = (counts[p.id] || 0) + 1;
  }
  assert.ok(counts.tranqui > counts.cazador && counts.normal > counts.capo);
  assert.ok(counts.capo > 400 && counts.cazador > 400);
  const facil = withDifficulty(PROFILES.capo, 'facil');
  const dificil = withDifficulty(PROFILES.capo, 'dificil');
  assert.ok(facil.reactionMs > PROFILES.capo.reactionMs && dificil.reactionMs < PROFILES.capo.reactionMs);
  assert.equal(facil.shoot, 0, 'en fácil no disparan cactus');
  assert.ok(dificil.noise < facil.noise);
  // una personalidad desconocida en la config no rompe nada
  assert.equal(pickProfile(rng, { inventado: 1 }).id, 'normal');
});
