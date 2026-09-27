import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createGameServer } from '../../server/create-server.js';
import { testConfig } from '../helpers/common.js';

let server;
let base;

before(async () => {
  const config = testConfig({ admins: ['jefe'], ffa: { bots: 2 }, br: { bots: 2 } });
  server = await createGameServer({ config, dbPath: ':memory:', seed: 1 });
  const port = await server.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await server.close();
});

async function call(method, path, body, token) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data, headers: res.headers };
}

test('página, archivos compartidos y cabeceras de seguridad', async () => {
  const r = await fetch(base + '/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  const html = await r.text();
  assert.match(html, /Jaha\.io/);
  const shared = await fetch(base + '/shared/constants.js');
  assert.equal(shared.status, 200);
  const skin = await fetch(base + '/skins/bandera.svg');
  assert.equal(skin.status, 200);
  const info = await call('GET', '/api/server-info');
  assert.equal(info.status, 200);
  assert.ok(info.data.rooms.ffa);
  assert.equal((await call('GET', '/api/no-existe')).status, 404);
});

test('registro, login, perfil, tienda, equipar, ajustes y ranking', async () => {
  const reg = await call('POST', '/api/auth/register', { username: 'karai_juan', password: 'secreta123', displayName: 'Karai Juan' });
  assert.equal(reg.status, 201);
  assert.ok(reg.data.token);
  assert.equal(reg.data.user.coins, 5000);
  const token = reg.data.token;

  assert.equal((await call('POST', '/api/auth/register', { username: 'KARAI_JUAN', password: 'otraclave1' })).status, 409);
  assert.equal((await call('POST', '/api/auth/register', { username: 'x', password: 'secreta123' })).status, 400);
  assert.equal((await call('POST', '/api/auth/register', { username: 'hijodeputa', password: 'secreta123' })).status, 400);

  assert.equal((await call('POST', '/api/auth/login', { username: 'karai_juan', password: 'mal' })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { username: 'nadie', password: 'mal' })).status, 401);
  const login = await call('POST', '/api/auth/login', { username: 'Karai_Juan', password: 'secreta123' });
  assert.equal(login.status, 200);

  const me = await call('GET', '/api/me', undefined, token);
  assert.equal(me.status, 200);
  assert.equal(me.data.user.displayName, 'Karai Juan');
  assert.ok(me.data.user.skins.includes('bandera'));
  assert.equal((await call('GET', '/api/me')).status, 401);

  // Tienda: sin plata para el yacaré, sí para la mandioca
  const shop = await call('GET', '/api/shop', undefined, token);
  const mandioca = shop.data.skins.find((s) => s.id === 'mandioca');
  assert.equal(mandioca.canBuy, false, '5.000 no alcanzan para 10.000');
  server.repos.addCoins(me.data.user.id, 20000, 'test');
  const buy = await call('POST', '/api/shop/buy', { skinId: 'mandioca' }, token);
  assert.equal(buy.status, 200);
  assert.equal(buy.data.coins, 15000);
  assert.equal((await call('POST', '/api/shop/buy', { skinId: 'mandioca' }, token)).status, 409);
  assert.equal((await call('POST', '/api/shop/buy', { skinId: 'nanduti' }, token)).status, 403, 'requiere nivel 5');
  assert.equal((await call('POST', '/api/shop/buy', { skinId: 'pombero' }, token)).status, 400, 'no se vende');
  assert.equal((await call('POST', '/api/skins/equip', { skinId: 'mandioca' }, token)).status, 200);
  assert.equal((await call('POST', '/api/skins/equip', { skinId: 'jaguarete' }, token)).status, 403);
  assert.equal((await call('POST', '/api/skins/equip', { skinId: '' }, token)).status, 200);

  // Ajustes
  const put = await call('PUT', '/api/settings', { settings: { theme: 'tierra', volume: 3, raro: 1 } }, token);
  assert.equal(put.data.settings.theme, 'tierra');
  assert.equal(put.data.settings.volume, 1);
  assert.equal('raro' in put.data.settings, false);
  assert.equal((await call('GET', '/api/settings', undefined, token)).data.settings.theme, 'tierra');

  // Cambiar nombre
  assert.equal((await call('PUT', '/api/me', { displayName: 'Juancito' }, token)).data.user.displayName, 'Juancito');

  // Ranking (por XP necesita xp > 0)
  server.repos.setXpCoins(me.data.user.id, 500, 15000);
  const lb = await call('GET', '/api/leaderboard?by=xp', undefined, token);
  assert.equal(lb.status, 200);
  assert.equal(lb.data.top[0].displayName, 'Juancito');
  assert.equal(lb.data.top[0].you, true);
  assert.equal(lb.data.me.rank, 1);

  // Perfil público y contraseña
  assert.equal((await call('GET', '/api/stats/karai_juan')).data.player.displayName, 'Juancito');
  const pw = await call('POST', '/api/auth/password', { current: 'secreta123', next: 'nueva12345' }, token);
  assert.equal(pw.status, 200);
  assert.equal((await call('GET', '/api/me', undefined, token)).status, 401, 'el token viejo se revocó');
  assert.equal((await call('GET', '/api/me', undefined, pw.data.token)).status, 200);
  await call('POST', '/api/auth/logout', {}, pw.data.token);
  assert.equal((await call('GET', '/api/me', undefined, pw.data.token)).status, 401);
});

test('los admins de config.json quedan marcados', async () => {
  const reg = await call('POST', '/api/auth/register', { username: 'jefe', password: 'secreta123' });
  assert.equal(reg.data.user.isAdmin, true);
});

test('JSON inválido y cuerpos enormes', async () => {
  const bad = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{nope' });
  assert.equal(bad.status, 400);
  const huge = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'a'.repeat(40000) }) });
  assert.equal(huge.status, 413);
});

test('límite de intentos de registro por IP', async () => {
  let last;
  for (let i = 0; i < 6; i++) {
    last = await call('POST', '/api/auth/register', { username: `spam${i}`, password: 'secreta123' });
  }
  assert.equal(last.status, 429);
});
