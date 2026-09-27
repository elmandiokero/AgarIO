import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FfaRoom } from '../../server/game/ffa-room.js';
import { BrRoom } from '../../server/game/br-room.js';
import { createRng } from '../../server/util/rng.js';
import { createManualClock } from '../../server/util/clock.js';
import { decodeSnapshot } from '../../shared/codec.js';
import { ET, SF } from '../../shared/constants.js';
import { testConfig, fakeConn, stepN } from '../helpers/common.js';

function brConfig(extra = {}) {
  return testConfig({
    br: {
      bots: 3,
      lobbySeconds: 1,
      countdownSeconds: 1,
      endedSeconds: 1,
      noHumansEndSeconds: 1,
      maxRoundSeconds: 60,
      phases: [
        { hold: 2, shrink: 2, radius: 0.3, dmgPct: 0.05, dmgFlat: 2 },
        { hold: 1, shrink: 2, radius: 0, dmgPct: 0.5, dmgFlat: 20 },
      ],
      ...extra,
    },
  });
}

test('Clásico: los bots siempre están y reaparecen', () => {
  const config = testConfig({ ffa: { bots: 6 } });
  const clock = createManualClock();
  const room = new FfaRoom({ config, rng: createRng(11), clock });
  assert.equal(room.bots.length, 6);
  const conn = fakeConn();
  room.join(conn, { name: 'Test', skin: 'bandera' });
  stepN(room, 40 * 60, clock);
  assert.equal(room.bots.length, 6);
  assert.ok(room.bots.filter((b) => b.alive).length >= 4, 'la mayoría vivos');
  // el ranking y snapshots llegaron
  assert.ok(conn.last('lb'));
  assert.ok(conn.binaries.length > 100);
  const snap = decodeSnapshot(conn.binaries[conn.binaries.length - 1]);
  assert.equal(snap.tick % 2, 0);
});

test('Clásico: morir, recibir resumen y reaparecer', () => {
  const config = testConfig({ ffa: { bots: 0 } });
  const clock = createManualClock();
  const room = new FfaRoom({ config, rng: createRng(12), clock });
  room.world.spawnProtectionMs = 0;
  const victim = fakeConn();
  const hunter = fakeConn();
  room.join(victim, { name: 'Víctima', skin: '' });
  room.join(hunter, { name: 'Cazador', skin: '' });
  const v = victim.player;
  const h = hunter.player;
  // poner al cazador grande encima de la víctima
  const vc = v.cells[0];
  const hc = h.cells[0];
  hc.x = vc.x;
  hc.y = vc.y;
  room.world._setMass(hc, 500);
  v.protectedUntil = 0;
  h.protectedUntil = 0;
  stepN(room, 2, clock);
  const dead = victim.last('dead');
  assert.ok(dead, 'mensaje de muerte');
  assert.equal(dead.killer, 'Cazador');
  assert.equal(dead.result.guest, true);
  assert.ok(hunter.all('feed').length >= 1);
  room.respawn(victim, {});
  assert.ok(victim.last('respawned'));
  assert.equal(v.alive, true);
  assert.equal(v.cells.length, 1);
});

test('Clásico: desconexión con reconexión dentro del tiempo', () => {
  const config = testConfig({ ffa: { bots: 0 } });
  const clock = createManualClock();
  const room = new FfaRoom({ config, rng: createRng(13), clock });
  const conn = fakeConn();
  room.join(conn, { name: 'Viajero', skin: '' });
  const key = conn.last('joined').resumeKey;
  const p = conn.player;
  room.disconnect(conn);
  assert.equal(room.players.has(p.pid), true, 'las células quedan');
  stepN(room, 40 * 5, clock);
  const conn2 = fakeConn();
  assert.equal(room.tryResume(conn2, 'otra-clave'), false);
  assert.equal(room.tryResume(conn2, key), true);
  assert.equal(conn2.player, p);
  assert.equal(conn2.last('joined').resumed, true);
  // y si pasa el tiempo de gracia, se va
  room.disconnect(conn2);
  stepN(room, 40 * 25, clock);
  assert.equal(room.players.has(p.pid), false);
});

test('Batalla real: ciclo completo con puestos y podio', () => {
  const config = brConfig();
  const clock = createManualClock();
  const room = new BrRoom({ config, rng: createRng(21), clock });
  const conn = fakeConn();
  room.join(conn, { name: 'Jugador', skin: 'chipa' });
  assert.equal(room.state, 'lobby');
  assert.equal(conn.player.brState, 'queued');
  const seen = new Set();
  let snapWithZone = false;
  for (let i = 0; i < 40 * 90 && seen.size < 4; i++) {
    room.step();
    clock.advance(25);
    seen.add(room.state);
    if (room.state === 'playing' && conn.binaries.length && !snapWithZone) {
      const s = decodeSnapshot(conn.binaries[conn.binaries.length - 1]);
      snapWithZone = !!(s.flags & SF.ZONE);
    }
  }
  assert.deepEqual([...seen], ['lobby', 'countdown', 'playing', 'ended']);
  assert.ok(snapWithZone, 'los snapshots traen la zona');
  const dead = conn.last('dead');
  assert.ok(dead, 'el jugador recibió su resultado');
  assert.ok(dead.place >= 1 && dead.place <= 4);
  assert.equal(dead.of, 4);
  const br = conn.all('br').find((m) => m.state === 'ended');
  assert.ok(br.podium.length >= 1);
  assert.equal(br.podium[0].place, 1);
  // vuelve a la sala de espera con el jugador anotado
  for (let i = 0; i < 40 * 3; i++) {
    room.step();
    clock.advance(25);
  }
  assert.ok(['lobby', 'countdown', 'playing'].includes(room.state));
  assert.ok(['queued', 'playing'].includes(conn.player.brState));
});

test('Batalla real: el que llega tarde mira y entra en la próxima', () => {
  const config = brConfig({ maxRoundSeconds: 30 });
  const clock = createManualClock();
  const room = new BrRoom({ config, rng: createRng(22), clock });
  const a = fakeConn();
  room.join(a, { name: 'Temprano', skin: '' });
  while (room.state !== 'playing') {
    room.step();
    clock.advance(25);
  }
  const late = fakeConn();
  room.join(late, { name: 'Tarde', skin: '' });
  assert.equal(late.player.brState, 'queued');
  assert.equal(late.spectating, 'auto');
  assert.equal(late.player.alive, false);
  assert.equal(room.participants.includes(late.player), false);
  const joined = late.last('joined');
  assert.equal(joined.br.state, 'playing');
  assert.equal(joined.br.you.state, 'queued');
});

test('Batalla real: salir en medio de la ronda cuenta como eliminado', () => {
  const config = brConfig();
  const clock = createManualClock();
  const room = new BrRoom({ config, rng: createRng(23), clock });
  const a = fakeConn();
  room.join(a, { name: 'Se va', skin: '' });
  while (room.state !== 'playing') {
    room.step();
    clock.advance(25);
  }
  const p = a.player;
  const before = room.aliveParticipants().length;
  room.leave(a);
  const saved = a.last('saved');
  assert.ok(saved);
  assert.equal(saved.summary.brPlace, before);
  assert.equal(room.aliveParticipants().length, before - 1);
  assert.equal(room.players.has(p.pid), false);
});

// ---------------------------------------------------------------- regresiones de la revisión de código

test('regresión: reconectar después de morir muestra la pantalla de muerte y deja mirando', () => {
  const config = testConfig({ ffa: { bots: 0 } });
  const clock = createManualClock();
  const room = new FfaRoom({ config, rng: createRng(31), clock });
  room.world.spawnProtectionMs = 0;
  const victim = fakeConn();
  const hunter = fakeConn();
  room.join(victim, { name: 'Víctima', skin: '' });
  room.join(hunter, { name: 'Cazador', skin: '' });
  const key = victim.last('joined').resumeKey;
  const v = victim.player;
  room.disconnect(victim);
  const hc = hunter.player.cells[0];
  hc.x = v.cells[0].x;
  hc.y = v.cells[0].y;
  room.world._setMass(hc, 500);
  hunter.player.protectedUntil = 0;
  v.protectedUntil = 0;
  stepN(room, 2, clock);
  assert.equal(v.alive, false);
  const again = fakeConn();
  assert.equal(room.tryResume(again, key), true);
  assert.ok(again.last('dead'), 'recibe el aviso de muerte guardado');
  assert.equal(again.spectating, 'auto');
});

test('regresión: reconectar aunque el servidor no haya notado el corte (conexión medio abierta)', () => {
  const config = testConfig({ ffa: { bots: 0 } });
  const clock = createManualClock();
  const room = new FfaRoom({ config, rng: createRng(32), clock });
  const old = fakeConn();
  room.join(old, { name: 'Viajero', skin: '' });
  const key = old.last('joined').resumeKey;
  const p = old.player;
  const fresh = fakeConn();
  assert.equal(room.tryResume(fresh, key), true);
  assert.equal(p.conn, fresh);
  assert.equal(old.closed, 4004, 'la conexión vieja se cierra');
  assert.equal(room.conns.has(old), false);
});

test('regresión: iniciar sesión estando muerto aplica la cuenta en la próxima vida', () => {
  const config = testConfig({ ffa: { bots: 0 } });
  const clock = createManualClock();
  const calls = [];
  const progression = { getUnlocked: () => new Set(), checkLive: () => [], applyLifeResult: (uid, s) => (calls.push([uid, s.reason]), null) };
  const room = new FfaRoom({ config, rng: createRng(33), clock, progression });
  const conn = fakeConn();
  room.join(conn, { name: 'Invitado', skin: '' });
  const p = conn.player;
  room.world.removeCell(p.cells[0], null, 'zone'); // muere
  stepN(room, 1, clock);
  conn.user = { id: 42, display_name: 'Cuenta Nueva', is_admin: false, level: 3 };
  room.respawn(conn, {});
  assert.equal(p.userId, 42);
  assert.equal(p.name, 'Cuenta Nueva');
  stepN(room, 40 * 20, clock);
  room.leave(conn);
  assert.deepEqual(calls.at(-1), [42, 'left']);
});

test('regresión: Batalla real no arranca con un solo participante', () => {
  const config = brConfig({ bots: 0 });
  const clock = createManualClock();
  const room = new BrRoom({ config, rng: createRng(34), clock });
  const conn = fakeConn();
  room.join(conn, { name: 'Solo', skin: '' });
  stepN(room, 40 * 5, clock);
  assert.equal(room.state, 'lobby');
  const conn2 = fakeConn();
  room.join(conn2, { name: 'Otro', skin: '' });
  stepN(room, 40 * 2, clock);
  assert.notEqual(room.state, 'lobby');
});

test('regresión: /br stop en la cuenta atrás cancela sin premios; irse en la cuenta atrás no deja fantasmas', () => {
  const config = brConfig({ bots: 3, countdownSeconds: 5 });
  const clock = createManualClock();
  const room = new BrRoom({ config, rng: createRng(35), clock });
  const a = fakeConn();
  room.join(a, { name: 'A', skin: '' });
  while (room.state !== 'countdown') stepN(room, 1, clock);
  room.leave(a);
  assert.equal(room.participants.length, 3, 'sin el que se fue');
  room.join(a, { name: 'A', skin: '' });
  assert.equal(room.participants.length, 4);
  room.forceStop();
  assert.equal(room.state, 'lobby');
  assert.equal(a.last('dead'), null, 'no hubo resultado');
});

test('regresión: puestos únicos aunque mueran en el mismo tick', () => {
  const config = brConfig({ bots: 3 });
  const clock = createManualClock();
  const room = new BrRoom({ config, rng: createRng(36), clock });
  const a = fakeConn();
  room.join(a, { name: 'A', skin: '' });
  while (room.state !== 'playing') stepN(room, 1, clock);
  // matar a todos en el mismo tick con la zona
  room.world.zoneDamage = () => 1e9;
  stepN(room, 1, clock);
  const places = room.participants.map((p) => p.brPlace).sort((x, y) => x - y);
  assert.deepEqual(places, [1, 2, 3, 4]);
  assert.equal(room.state, 'ended');
});

test('regresión: la zona final no concentra comida y con radio 0 todos reciben daño', async () => {
  const { Zone } = await import('../../server/game/zone.js');
  const z = new Zone(1000, [{ hold: 0, shrink: 1, radius: 0, dmgPct: 0.1, dmgFlat: 6 }], createRng(1));
  z.update(5000);
  assert.equal(z.state.r, 0);
  assert.ok(z.damage(z.state.x, z.state.y, 100) > 0, 'justo en el centro también');
  const config = brConfig({ bots: 3 });
  const clock = createManualClock();
  const room = new BrRoom({ config, rng: createRng(37), clock });
  room.join(fakeConn(), { name: 'A', skin: '' });
  while (room.state !== 'playing') stepN(room, 1, clock);
  room.zone.state.r = 0;
  assert.equal(room.world.spawnArea(), null, 'con la zona cerrada la comida sale en todo el mapa');
});
