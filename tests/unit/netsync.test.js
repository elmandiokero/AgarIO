import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FfaRoom } from '../../server/game/ffa-room.js';
import { buildSnapshot, commitSnapshot } from '../../server/game/netsync.js';
import { createRng } from '../../server/util/rng.js';
import { createManualClock } from '../../server/util/clock.js';
import { decodeSnapshot } from '../../shared/codec.js';
import { ET, PF } from '../../shared/constants.js';
import { testConfig, fakeConn } from '../helpers/common.js';

test('diferencias: agregados, actualizados y quitados; la comida no se re-envía', () => {
  const config = testConfig({ ffa: { bots: 0, food: 300, viruses: 0, world: 2000 } });
  const clock = createManualClock();
  const room = new FfaRoom({ config, rng: createRng(4), clock });
  const conn = fakeConn();
  room.join(conn, { name: 'Yo', skin: 'chipa' });
  const me = conn.player;

  const s1 = decodeSnapshot(buildSnapshot(room, conn));
  commitSnapshot(conn, room.world.tick);
  const myCell = s1.added.find((e) => e.type === ET.CELL && e.pid === me.pid);
  assert.ok(myCell, 'mi célula está');
  const meInfo = s1.players.find((p) => p.pid === me.pid);
  assert.ok(meInfo.flags & PF.YOU);
  assert.equal(meInfo.name, 'Yo');
  assert.ok(s1.added.some((e) => e.type === ET.FOOD));

  me.input.dx = 300;
  room.world.step(25);
  const s2 = decodeSnapshot(buildSnapshot(room, conn));
  assert.equal(s2.players.length, 0, 'la info del jugador no se repite');
  assert.ok(s2.updated.some((u) => u.id === myCell.id), 'mi célula se movió');
  assert.ok(!s2.updated.some((u) => s1.added.find((a) => a.id === u.id && a.type === ET.FOOD)), 'la comida nunca se actualiza');

  // Si el frame no se envía, el estado no cambia: el próximo trae lo mismo
  const s3 = decodeSnapshot(buildSnapshot(room, conn));
  assert.deepEqual(s3.added.map((a) => a.id).sort(), s2.added.map((a) => a.id).sort());
  commitSnapshot(conn, room.world.tick);

  // Comer una chipita: aparece en removed con quién la comió
  const food = [...room.world.entities.values()].find((e) => e.type === ET.FOOD && conn.net.known.has(e.id));
  const cell = me.cells[0];
  food.x = cell.x;
  food.y = cell.y;
  room.world.grid.removeStatic(food);
  room.world.grid.addStatic(food);
  room.world.step(25);
  const s4 = decodeSnapshot(buildSnapshot(room, conn));
  const rem = s4.removed.find((r) => r.id === food.id);
  assert.ok(rem, 'la comida comida se quita');
  assert.equal(rem.eater, cell.id);
});
