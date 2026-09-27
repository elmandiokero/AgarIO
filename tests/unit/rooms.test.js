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
