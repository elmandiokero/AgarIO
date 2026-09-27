import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ByteWriter, writeSnapshotHeader, writePlayerInfo, writeAdded, writeUpdated, decodeSnapshot, encodeMove, encodeOp, decodeInput } from '../../shared/codec.js';
import { ET, OP, SF, PF } from '../../shared/constants.js';

test('snapshot ida y vuelta (con ñ y g̃)', () => {
  const w = new ByteWriter(8);
  writeSnapshotHeader(w, { tick: 123, time: 45678, flags: SF.ALIVE, camX: 100.5, camY: 200.25, zoom: 0.75, zone: { x: 1, y: 2, r: 3, nx: 4, ny: 5, nr: 6 } });
  w.u16(1);
  writePlayerInfo(w, { pid: 7, hue: 300, level: 12, name: 'Ñandú g̃uasu', skin: 'jaguarete' }, PF.YOU | PF.REGISTERED);
  w.u16(1);
  w.u32(99);
  w.u32(5);
  w.u16(4);
  const owner = { pid: 7 };
  writeAdded(w, { id: 1, type: ET.CELL, x: 10, y: 20, r: 44.72, owner });
  writeAdded(w, { id: 2, type: ET.FOOD, x: 11, y: 21, r: 10, color: 3 });
  writeAdded(w, { id: 3, type: ET.EJECT, x: 12, y: 22, r: 36, hue: 200 });
  writeAdded(w, { id: 4, type: ET.VIRUS, x: 13, y: 23, r: 100 });
  w.u16(1);
  writeUpdated(w, { id: 1, x: 15, y: 25, r: 50 });
  const s = decodeSnapshot(w.toBytes());
  assert.equal(s.tick, 123);
  assert.equal(s.time, 45678);
  assert.ok(s.flags & SF.ALIVE && s.flags & SF.ZONE);
  assert.equal(s.camX, 100.5);
  assert.deepEqual(s.zone, { x: 1, y: 2, r: 3, nx: 4, ny: 5, nr: 6 });
  assert.equal(s.players[0].name, 'Ñandú g̃uasu');
  assert.equal(s.players[0].hue, 300 & 255);
  assert.equal(s.players[0].skin, 'jaguarete');
  assert.deepEqual(s.removed, [{ id: 99, eater: 5 }]);
  assert.equal(s.added.length, 4);
  assert.equal(s.added[0].pid, 7);
  assert.equal(s.added[0].r, 44.75);
  assert.equal(s.added[1].color, 3);
  assert.equal(s.added[2].hue, 200);
  assert.equal(s.added[3].type, ET.VIRUS);
  assert.deepEqual(s.updated, [{ id: 1, x: 15, y: 25, r: 50 }]);
});

test('nombres largos se cortan sin romper UTF-8', () => {
  const w = new ByteWriter();
  w.str8('ñ'.repeat(40));
  const bytes = w.toBytes();
  assert.ok(bytes[0] <= 48);
  assert.equal(bytes[0] % 2, 0);
});

test('inputs: válidos e inválidos', () => {
  const mv = decodeInput(new Uint8Array(encodeMove(12.5, -3)));
  assert.deepEqual(mv, { op: OP.MOVE, dx: 12.5, dy: -3 });
  assert.deepEqual(decodeInput(new Uint8Array(encodeOp(OP.SPLIT))), { op: OP.SPLIT });
  assert.equal(decodeInput(new Uint8Array([OP.MOVE])), null);
  assert.equal(decodeInput(new Uint8Array([0x55])), null);
  assert.equal(decodeInput(new Uint8Array(20)), null);
  const nan = new DataView(new ArrayBuffer(9));
  nan.setUint8(0, OP.MOVE);
  nan.setFloat32(1, NaN, true);
  assert.equal(decodeInput(new Uint8Array(nan.buffer)), null);
});
