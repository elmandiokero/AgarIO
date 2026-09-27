import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, migrate } from '../../server/db/database.js';
import { createRepos } from '../../server/db/repos.js';
import { createProgression } from '../../server/progress/progression.js';
import { FREE_SKINS } from '../../shared/catalog/skins.js';
import { testConfig } from '../helpers/common.js';

async function setup() {
  const db = await openDatabase(':memory:');
  const repos = createRepos(db);
  return { db, repos };
}

test('migraciones idempotentes', async () => {
  const { db } = await setup();
  migrate(db);
  migrate(db);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 1);
});

test('usuarios, skins, monedas y borrado en cascada', async () => {
  const { db, repos } = await setup();
  const id = repos.createUser({ username: 'Karai', displayName: 'Karai Pedro', passHash: 'x', coins: 1000, freeSkins: FREE_SKINS });
  assert.equal(repos.getUserByName('karai').id, id, 'usuario sin distinguir mayúsculas');
  assert.equal(repos.isNameTaken('KARAI PEDRO'), true);
  assert.equal(repos.countSkins(id), FREE_SKINS.length);
  assert.equal(repos.spendCoins(id, 5000, 'compra'), false, 'no alcanza');
  assert.equal(repos.getUser(id).coins, 1000, 'no se tocó');
  assert.equal(repos.spendCoins(id, 400, 'compra'), true);
  assert.equal(repos.getUser(id).coins, 600);
  repos.updateStats(id, { add: { games_played: 2, food_eaten: 10 }, max: { max_mass: 300 }, min: { best_rank_ffa: 4 } });
  repos.updateStats(id, { max: { max_mass: 200 }, min: { best_rank_ffa: 7 } });
  const st = repos.getStats(id);
  assert.equal(st.games_played, 2);
  assert.equal(st.max_mass, 300);
  assert.equal(st.best_rank_ffa, 4);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  assert.equal(repos.getStats(id), null);
  assert.equal(repos.countSkins(id), 0);
});

test('progresión: premios, niveles, skins por nivel y logros en una transacción', async () => {
  const { repos } = await setup();
  const config = testConfig();
  const prog = createProgression(repos, config);
  const id = repos.createUser({ username: 'jugador', displayName: 'Jugador', passHash: 'x', coins: 0, freeSkins: FREE_SKINS });
  repos.setXpCoins(id, 1150, 0); // casi nivel 5 (1000 → nivel 5 empieza en 1000)
  const res = prog.applyLifeResult(id, {
    mode: 'ffa', reason: 'eaten', startedAt: Date.now() - 120000, endedAt: Date.now(), durationMs: 120000,
    maxMass: 1200, finalMass: 0, foodEaten: 300, cellsEaten: 3, humanKills: 2, botKills: 1, virusesPopped: 1,
    splits: 4, ejects: 2, massGained: 1500, bestRank: 1, reachedTop1: true, splitKill: false, revenge: false, hourLocal: 14,
  });
  assert.ok(res.rewards.xp > 0);
  assert.equal(res.xp, 1150 + res.rewards.xp);
  const ids = res.newAchievements.map((a) => a.id);
  assert.ok(ids.includes('mbarete'));
  assert.ok(ids.includes('primer_bocado'));
  assert.ok(ids.includes('numero_uno'));
  assert.ok(res.newSkins.includes('estrella'), 'skin del logro número uno');
  const u = repos.getUser(id);
  assert.equal(u.coins, res.coins);
  const m = repos.getMatches(id);
  assert.equal(m.length, 1);
  assert.equal(m[0].kills, 2);
  // repetir no vuelve a dar los mismos logros
  const again = prog.applyLifeResult(id, { mode: 'ffa', reason: 'eaten', startedAt: 0, durationMs: 20000, maxMass: 1100, cellsEaten: 1, humanKills: 0, botKills: 0 });
  assert.ok(!again.newAchievements.some((a) => a.id === 'mbarete'));
  // en vivo
  const unlocked = prog.getUnlocked(id);
  const live = prog.checkLive(id, { mode: 'ffa', durationMs: 1000, maxMass: 5000, cellsEaten: 0, humanKills: 0, botKills: 0, hourLocal: 12 }, unlocked);
  assert.deepEqual(live.map((a) => a.id), ['tuicha']);
  assert.ok(unlocked.has('tuicha'));
});

test('subir de nivel da skins de mitología', async () => {
  const { repos } = await setup();
  const prog = createProgression(repos, testConfig({ progression: { maxXpPerLife: 100000 } }));
  const id = repos.createUser({ username: 'mito', displayName: 'Mito', passHash: 'x', freeSkins: FREE_SKINS });
  const res = prog.applyLifeResult(id, { mode: 'ffa', reason: 'eaten', startedAt: 0, durationMs: 60000, maxMass: 80000, humanKills: 0, botKills: 0 });
  assert.ok(res.levelAfter >= 8, `nivel ${res.levelAfter}`);
  assert.ok(res.newSkins.includes('pombero'));
  assert.ok(res.newSkins.includes('jasy_jatere'));
  assert.ok(res.levelUpCoins > 0);
});

test('regresión: entrar y salir enseguida no suma partidas ni logros (anti-farmeo)', async () => {
  const { repos } = await setup();
  const prog = createProgression(repos, testConfig());
  const id = repos.createUser({ username: 'farmer', displayName: 'Farmer', passHash: 'x', freeSkins: FREE_SKINS });
  for (let i = 0; i < 120; i++) {
    const r = prog.applyLifeResult(id, { mode: 'ffa', reason: 'left', startedAt: 0, durationMs: 500, maxMass: 20, humanKills: 0, botKills: 0, hourLocal: 14 });
    assert.equal(r.ignored, true);
  }
  assert.equal(repos.getStats(id).games_played, 0);
  assert.equal(repos.getMatches(id).length, 0);
  assert.equal(prog.getUnlocked(id).size, 0);
});
