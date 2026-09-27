import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createGameServer } from '../../server/create-server.js';
import { decodeSnapshot, encodeMove, encodeOp } from '../../shared/codec.js';
import { PROTOCOL_VERSION, ET, OP, SF } from '../../shared/constants.js';
import { testConfig } from '../helpers/common.js';

let server;
let port;

before(async () => {
  const config = testConfig({
    ffa: { bots: 3, world: 3000, food: 300 },
    br: { bots: 2, lobbySeconds: 1, countdownSeconds: 1 },
    progression: { minLifeSeconds: 0 },
    game: { disconnectGraceSeconds: 2 },
  });
  server = await createGameServer({ config, dbPath: ':memory:', seed: 2 });
  port = await server.listen(0, '127.0.0.1');
});

after(async () => {
  await server.close();
});

/** Cliente de prueba que junta mensajes. */
function client() {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  ws.binaryType = 'arraybuffer';
  const c = { ws, msgs: [], snaps: [], waiters: [] };
  ws.on('message', (data, isBinary) => {
    if (isBinary) c.snaps.push(decodeSnapshot(new Uint8Array(data)));
    else c.msgs.push(JSON.parse(data.toString()));
    for (const w of [...c.waiters]) w();
  });
  c.open = () => new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  c.send = (o) => ws.send(JSON.stringify(o));
  c.wait = (pred, ms = 4000) =>
    new Promise((res, rej) => {
      const check = () => {
        const v = pred(c);
        if (v) {
          c.waiters = c.waiters.filter((w) => w !== check);
          clearTimeout(t);
          res(v);
        }
      };
      const t = setTimeout(() => {
        c.waiters = c.waiters.filter((w) => w !== check);
        rej(new Error('timeout esperando'));
      }, ms);
      c.waiters.push(check);
      check();
    });
  c.msg = (t) => c.wait((x) => x.msgs.find((m) => m.t === t));
  c.close = () => new Promise((res) => { ws.once('close', res); ws.close(); });
  return c;
}

test('invitado: hello → join → snapshots → moverse → dividirse', async () => {
  const c = client();
  await c.open();
  c.send({ t: 'hello', v: PROTOCOL_VERSION });
  const welcome = await c.msg('welcome');
  assert.equal(welcome.user, null);
  assert.ok(welcome.rooms.ffa);
  c.send({ t: 'join', mode: 'ffa', name: 'Probador', skin: 'bandera', aspect: 1.6 });
  const joined = await c.msg('joined');
  assert.ok(joined.pid > 0);
  const snap = await c.wait((x) => x.snaps.find((s) => s.flags & SF.ALIVE && s.added.some((a) => a.type === ET.CELL && a.pid === joined.pid)));
  const mine = snap.added.find((a) => a.type === ET.CELL && a.pid === joined.pid);
  const startX = mine.x;
  c.ws.send(encodeMove(800, 0));
  await c.wait((x) => {
    for (const s of x.snaps) for (const u of s.updated) if (u.id === mine.id && u.x > startX + 40) return true;
    return false;
  });
  await c.msg('lb');
  c.ws.send(encodeOp(OP.SPLIT)); // con masa 20 no divide, pero no debe romper nada
  c.send({ t: 'chat', text: 'hola che' });
  const chat = await c.wait((x) => x.msgs.find((m) => m.t === 'chat' && m.text === 'hola che'));
  assert.equal(chat.from, 'Probador');
  c.send({ t: 'leave' });
  await c.msg('left');
  await c.close();
});

test('versión vieja se rechaza y un nombre registrado no se puede usar como invitado', async () => {
  const old = client();
  await old.open();
  old.send({ t: 'hello', v: 0 });
  const err = await old.msg('err');
  assert.equal(err.code, 'version');

  server.repos.createUser({ username: 'ocupado', displayName: 'Ocupado', passHash: 'x' });
  const c = client();
  await c.open();
  c.send({ t: 'hello', v: PROTOCOL_VERSION });
  await c.msg('welcome');
  c.send({ t: 'join', mode: 'ffa', name: 'ocupado', skin: '' });
  const e2 = await c.msg('err');
  assert.equal(e2.code, 'name');
  c.send({ t: 'join', mode: 'ffa', name: 'Libre', skin: 'jaguarete' });
  const e3 = await c.wait((x) => x.msgs.find((m) => m.t === 'err' && m.code === 'skin'));
  assert.ok(e3);
  await c.close();
});

test('con cuenta: la partida se guarda en las estadísticas', async () => {
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'ws_user', password: 'secreta123', displayName: 'Jugadora WS' }),
  });
  const { token, user } = await res.json();
  const c = client();
  await c.open();
  c.send({ t: 'hello', v: PROTOCOL_VERSION, token });
  const welcome = await c.msg('welcome');
  assert.equal(welcome.user.displayName, 'Jugadora WS');
  c.send({ t: 'join', mode: 'ffa', name: 'ignorado', skin: 'bandera' });
  await c.msg('joined');
  await c.wait((x) => x.snaps.some((s) => s.players.some((p) => p.name === 'Jugadora WS')));
  await new Promise((r) => setTimeout(r, 300));
  c.send({ t: 'leave' });
  const saved = await c.msg('saved');
  assert.equal(saved.result.guest, undefined);
  const stats = server.repos.getStats(user.id);
  assert.equal(stats.games_played, 1);
  assert.equal(server.repos.getMatches(user.id).length, 1);
  await c.close();
});

test('reconexión con resumeKey', async () => {
  const c = client();
  await c.open();
  c.send({ t: 'hello', v: PROTOCOL_VERSION });
  await c.msg('welcome');
  c.send({ t: 'join', mode: 'ffa', name: 'Viajero', skin: '' });
  const joined = await c.msg('joined');
  c.ws.terminate();
  await new Promise((r) => setTimeout(r, 200));
  const c2 = client();
  await c2.open();
  c2.send({ t: 'hello', v: PROTOCOL_VERSION, resume: joined.resumeKey });
  const j2 = await c2.msg('joined');
  assert.equal(j2.resumed, true);
  assert.equal(j2.pid, joined.pid);
  await c2.close();

  const c3 = client();
  await c3.open();
  c3.send({ t: 'hello', v: PROTOCOL_VERSION, resume: 'clave-inventada' });
  const r = await c3.msg('resume');
  assert.equal(r.ok, false);
  await c3.close();
});

test('mensajes basura y frames gigantes no rompen el servidor', async () => {
  const c = client();
  await c.open();
  c.ws.send('no es json');
  c.ws.send(JSON.stringify({ t: 'hackear' }));
  c.ws.send(new Uint8Array([1, 2, 3]));
  c.send({ t: 'hello', v: PROTOCOL_VERSION });
  await c.msg('welcome');
  const closed = new Promise((res) => c.ws.once('close', (code) => res(code)));
  c.ws.send('x'.repeat(10000));
  const code = await closed;
  assert.equal(code, 1009, 'frame demasiado grande');
  // el servidor sigue vivo
  const d = client();
  await d.open();
  d.send({ t: 'hello', v: PROTOCOL_VERSION });
  await d.msg('welcome');
  await d.close();
});

test('Batalla real por WebSocket: sala de espera y cuenta atrás', async () => {
  const c = client();
  await c.open();
  c.send({ t: 'hello', v: PROTOCOL_VERSION });
  await c.msg('welcome');
  c.send({ t: 'join', mode: 'br', name: 'Guerrera', skin: 'chipa' });
  const joined = await c.msg('joined');
  assert.ok(joined.br);
  const cd = await c.wait((x) => x.msgs.find((m) => m.t === 'br' && m.state === 'countdown'), 5000);
  assert.ok(cd.participants >= 3);
  const playing = await c.wait((x) => x.msgs.find((m) => m.t === 'br' && m.state === 'playing'), 5000);
  assert.equal(playing.you.state, 'playing');
  const zsnap = await c.wait((x) => x.snaps.find((s) => s.zone));
  assert.ok(zsnap.zone.r > 0);
  await c.close();
});

test('chat global: llega al instante a todos (menú y sala), con historial y filtro', async () => {
  const a = client();
  const b = client();
  await a.open();
  await b.open();
  a.send({ t: 'hello', v: PROTOCOL_VERSION });
  b.send({ t: 'hello', v: PROTOCOL_VERSION });
  const hist = await a.msg('gchat_hist');
  assert.ok(Array.isArray(hist.msgs));
  await b.msg('welcome');
  // B entra a jugar, A se queda en el menú
  b.send({ t: 'join', mode: 'ffa', name: 'Jugando', skin: '' });
  await b.msg('joined');
  a.send({ t: 'gchat', text: 'Mba\'éichapa a todos', name: 'DesdeMenu' });
  const gotB = await b.wait((x) => x.msgs.find((m) => m.t === 'gchat' && m.m.text === "Mba'éichapa a todos"));
  assert.equal(gotB.m.from, 'DesdeMenu');
  assert.equal(gotB.m.where, 'Menú');
  const gotA = await a.wait((x) => x.msgs.find((m) => m.t === 'gchat' && m.m.text === "Mba'éichapa a todos"));
  assert.ok(gotA.m.id > 0);
  // desde la sala: usa el nombre del jugador y dice dónde está
  b.send({ t: 'gchat', text: 'hola desde el juego', name: 'Trucho' });
  const fromGame = await a.wait((x) => x.msgs.find((m) => m.t === 'gchat' && m.m.text === 'hola desde el juego'));
  assert.equal(fromGame.m.from, 'Jugando');
  assert.equal(fromGame.m.where, 'Clásico');
  // filtro
  a.send({ t: 'gchat', text: 'sos un pelotudo', name: 'DesdeMenu' });
  const censored = await b.wait((x) => x.msgs.find((m) => m.t === 'gchat' && m.m.from === 'DesdeMenu' && m.m.text.includes('***')));
  assert.ok(!censored.m.text.includes('pelotudo'));
  // anti-spam: la 4ª seguida recibe aviso privado
  for (let i = 0; i < 5; i++) a.send({ t: 'gchat', text: `spam ${i}`, name: 'DesdeMenu' });
  const warn = await a.wait((x) => x.msgs.find((m) => m.t === 'gchat' && m.m.sys && /Despacio/.test(m.m.text)));
  assert.ok(warn);
  // un nuevo conectado recibe el historial
  const c = client();
  await c.open();
  c.send({ t: 'hello', v: PROTOCOL_VERSION });
  const h2 = await c.msg('gchat_hist');
  assert.ok(h2.msgs.some((m) => m.text === 'hola desde el juego'));
  await a.close();
  await b.close();
  await c.close();
});
