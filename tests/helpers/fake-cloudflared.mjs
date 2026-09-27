#!/usr/bin/env node
// cloudflared falso para las pruebas: simula login, list, create, token, route dns y run.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const home = path.join(os.homedir(), '.cloudflared');
fs.mkdirSync(home, { recursive: true });
const stateFile = path.join(home, 'fake-state.json');
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : { tunnels: [], routes: [], calls: [] };
const save = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
const args = process.argv.slice(2);
state.calls.push(args);
save();

const has = (f) => args.includes(f);
const after = (f) => args[args.indexOf(f) + 1];

if (args[0] !== 'tunnel') process.exit(2);
if (args[1] === 'login') {
  fs.writeFileSync(path.join(home, 'cert.pem'), 'FAKE CERT');
  console.error('You have successfully logged in.');
  process.exit(0);
}
if (args[1] === 'list') {
  process.stdout.write(JSON.stringify(state.tunnels));
  process.exit(0);
}
if (args[1] === 'create') {
  const id = crypto.randomUUID();
  state.tunnels.push({ id, name: args[2], created_at: new Date().toISOString(), deleted_at: null, connections: [] });
  fs.writeFileSync(path.join(home, `${id}.json`), JSON.stringify({ TunnelID: id }));
  save();
  console.log(`Created tunnel ${args[2]} with id ${id}`);
  process.exit(0);
}
if (args[1] === 'token') {
  fs.writeFileSync(after('--cred-file'), '{}');
  process.exit(0);
}
if (args[1] === 'route') {
  state.routes.push({ tunnel: args[args.length - 2], hostname: args[args.length - 1], overwrite: has('--overwrite-dns') });
  save();
  process.exit(0);
}
// tunnel --no-autoupdate ... (run o quick)
if (has('--url')) {
  console.error('INF |  https://fake-quick-tunnel.trycloudflare.com  |');
} else if (has('run')) {
  if (has('--config')) {
    const yml = fs.readFileSync(after('--config'), 'utf8');
    if (!/tunnel: /.test(yml) || !/credentials-file: /.test(yml)) process.exit(3);
  } else if (!process.env.TUNNEL_TOKEN) {
    console.error('ERR Provided Tunnel token is not valid');
    process.exit(1);
  }
  console.error('INF Registered tunnel connection connIndex=0 location=gru01 protocol=quic');
}
setInterval(() => {}, 1000);
