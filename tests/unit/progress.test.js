import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRewards } from '../../server/progress/rewards.js';
import { evaluateAchievements, RULES } from '../../server/progress/achievements.js';
import { ACHIEVEMENTS } from '../../shared/catalog/achievements.js';
import { SKINS, SKIN_MAP, skinsForLevelRange } from '../../shared/catalog/skins.js';
import { testConfig } from '../helpers/common.js';

const pcfg = testConfig().progression;
const base = { mode: 'ffa', durationMs: 60_000, maxMass: 800, humanKills: 1, botKills: 2, bestRank: 3, brPlace: 0, brParticipants: 0 };

test('premios: fórmula y tope', () => {
  const r = computeRewards(base, pcfg);
  assert.equal(r.xp, 100 + 30 + 24 + 10 + 30);
  assert.equal(r.coins, r.xp * pcfg.coinsPerXp);
  assert.equal(computeRewards({ ...base, durationMs: 5000 }, pcfg).xp, 0);
  assert.equal(computeRewards({ ...base, maxMass: 1e9 }, pcfg).xp, pcfg.maxXpPerLife);
  // BR: el puesto cuenta aunque haya durado poco
  const br = computeRewards({ ...base, mode: 'br', durationMs: 3000, brPlace: 1, brParticipants: 10, bestRank: 0 }, pcfg);
  assert.equal(br.tooShort, false);
  assert.ok(br.breakdown.rank === 250);
});

test('logros: cada regla tiene metadatos y viceversa', () => {
  const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
  for (const id of Object.keys(RULES)) assert.ok(ids.has(id), id);
  for (const id of ids) assert.ok(RULES[id], id);
  for (const a of ACHIEVEMENTS) if (a.skin) assert.ok(SKIN_MAP[a.skin], a.skin);
  for (const s of SKINS) if (s.achievement) assert.ok(ids.has(s.achievement), s.id);
});

test('logros: evaluación y sin repetir', () => {
  const life = { ...base, maxMass: 5000, humanKills: 6, botKills: 4, splitKill: true, revenge: false, reachedTop1: true, hourLocal: 2, cellsEaten: 12 };
  const got = evaluateAchievements({ life }, new Set());
  for (const id of ['primer_bocado', 'mbarete', 'tuicha', 'cazador', 'dividir_conquistar', 'numero_uno', 'noctambulo']) assert.ok(got.includes(id), id);
  assert.ok(!got.includes('karai_guasu'));
  const again = evaluateAchievements({ life }, new Set(got));
  assert.deepEqual(again, []);
  const live = evaluateAchievements({ life: { ...life, mode: 'br', brPlace: 1, brParticipants: 8 } }, new Set(), { live: true });
  assert.ok(!live.includes('campeon_br'), 'los de fin de ronda no se dan en vivo');
  const stats = { food_eaten: 12000, viruses_popped: 30, players_eaten: 60, bots_eaten: 40, games_played: 100 };
  const tot = evaluateAchievements({ stats }, new Set());
  for (const id of ['chipero', 'chipero_guasu', 'tuna_poty', 'jaguarete', 'terere_rupa', 'vicio']) assert.ok(tot.includes(id), id);
  const prof = evaluateAchievements({ profile: { coins: 100000, skinCount: 10 } }, new Set());
  assert.deepEqual(prof.sort(), ['ahorrista', 'coleccionista']);
});

test('skins por nivel', () => {
  assert.deepEqual(skinsForLevelRange(4, 5), ['pombero']);
  assert.deepEqual(skinsForLevelRange(1, 1), []);
  assert.ok(skinsForLevelRange(0, 50).length >= 8);
  // todas las skins tienen alguna forma de obtenerse
  for (const s of SKINS) assert.ok(s.free || s.price || s.level || s.achievement, s.id);
});
