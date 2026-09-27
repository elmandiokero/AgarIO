// Prueba de carga: N clientes falsos se conectan, juegan y miden cuántos datos reciben.
//   node scripts/dev/loadtest.mjs --url ws://localhost:3000/ws --clients 20 --seconds 30 --mode ffa
import WebSocket from 'ws';
import { PROTOCOL_VERSION } from '../../shared/constants.js';
import { encodeMove, decodeSnapshot } from '../../shared/codec.js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);
const url = args.url || 'ws://127.0.0.1:3000/ws';
const clients = Number(args.clients || 20);
const seconds = Number(args.seconds || 30);
const mode = args.mode || 'ffa';

let bytes = 0;
let snaps = 0;
let errors = 0;
const sockets = [];

for (let i = 0; i < clients; i++) {
  const ws = new WebSocket(url, { headers: { 'X-Forwarded-For': `10.0.0.${i + 1}` } });
  ws.binaryType = 'arraybuffer';
  sockets.push(ws);
  ws.on('open', () => {
    ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION }));
    ws.send(JSON.stringify({ t: 'join', mode, name: `Carga ${i + 1}`, skin: '' }));
    const timer = setInterval(() => {
      if (ws.readyState !== 1) return clearInterval(timer);
      const a = Math.random() * Math.PI * 2;
      ws.send(encodeMove(Math.cos(a) * 500, Math.sin(a) * 500));
    }, 300);
  });
  ws.on('message', (data, isBinary) => {
    const len = isBinary ? data.byteLength : data.length;
    bytes += len;
    if (isBinary) {
      snaps++;
      try {
        decodeSnapshot(new Uint8Array(data));
      } catch {
        errors++;
      }
    } else {
      const m = JSON.parse(data.toString());
      if (m.t === 'dead' && mode === 'ffa') setTimeout(() => ws.send(JSON.stringify({ t: 'respawn' })), 500);
    }
  });
  ws.on('error', () => errors++);
}

const t0 = Date.now();
const tick = setInterval(() => {
  const secs = (Date.now() - t0) / 1000;
  console.log(`${secs.toFixed(0)}s · ${(bytes / 1024 / secs / clients).toFixed(1)} KB/s por cliente · ${Math.round(snaps / secs / clients)} snapshots/s · errores ${errors}`);
}, 5000);

setTimeout(() => {
  clearInterval(tick);
  for (const ws of sockets) ws.close();
  const secs = (Date.now() - t0) / 1000;
  console.log(`\nListo: ${clients} clientes, ${(bytes / 1024 / secs / clients).toFixed(1)} KB/s promedio por cliente, errores ${errors}`);
  process.exit(errors ? 1 : 0);
}, seconds * 1000);
