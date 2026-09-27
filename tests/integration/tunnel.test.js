import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildTunnelSpec, startTunnel, explainTunnelError } from '../../server/tunnel.js';
import { parseTunnelToken, normalizeHostname, saveTunnelConfig } from '../../server/tools/dominio.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FAKE = path.join(ROOT, 'tests', 'helpers', 'fake-cloudflared.mjs');
const isWin = process.platform === 'win32';

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'jaha-tunnel-'));
}

test('argumentos de cloudflared según el modo', () => {
  const dir = tmpdir();
  const quick = buildTunnelSpec({ port: 3000, tunnel: { mode: 'quick', protocol: 'http2' }, dataDir: dir });
  assert.deepEqual(quick.args, ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', 'http://127.0.0.1:3000']);
  assert.equal(quick.fixedUrl, null);

  const missing = buildTunnelSpec({ port: 3000, tunnel: { mode: 'named', hostname: 'agario.alexlamasg.lat' }, dataDir: dir });
  assert.match(missing.error, /4-CONFIGURAR-DOMINIO/);

  const cred = path.join(dir, 'abc.json');
  fs.writeFileSync(cred, '{}');
  const named = buildTunnelSpec({ port: 3100, tunnel: { mode: 'named', id: 'abc', hostname: 'agario.alexlamasg.lat', credentialsFile: cred }, dataDir: dir });
  assert.equal(named.fixedUrl, 'https://agario.alexlamasg.lat');
  assert.deepEqual(named.args.slice(-3), ['--config', path.join(dir, 'cloudflared-jaha.yml'), 'run']);
  const yml = fs.readFileSync(path.join(dir, 'cloudflared-jaha.yml'), 'utf8');
  assert.match(yml, /tunnel: abc/);
  assert.match(yml, /hostname: agario\.alexlamasg\.lat/);
  assert.match(yml, /service: http:\/\/127\.0\.0\.1:3100/);
  assert.match(yml, /http_status:404/);

  const token = buildTunnelSpec({ port: 3000, tunnel: { mode: 'token', token: 'eyJxyz', hostname: 'agario.alexlamasg.lat' }, dataDir: dir });
  assert.deepEqual(token.args, ['tunnel', '--no-autoupdate', 'run']);
  assert.equal(token.env.TUNNEL_TOKEN, 'eyJxyz');
  assert.ok(!token.args.includes('eyJxyz'), 'el token no va en los argumentos');
});

test('token del panel: se reconoce aunque se pegue el comando entero', () => {
  const tok = Buffer.from(JSON.stringify({ a: 'cuenta', t: '1234-uuid', s: 'secreto' })).toString('base64');
  const r = parseTunnelToken(`cloudflared.exe service install ${tok}`);
  assert.equal(r.token, tok);
  assert.equal(r.tunnelId, '1234-uuid');
  assert.equal(parseTunnelToken('hola'), null);
  assert.equal(normalizeHostname(' https://Agario.AlexLamasG.lat/ '), 'agario.alexlamasg.lat');
  assert.ok(explainTunnelError('Provided Tunnel token is not valid'));
});

test('guardar la sección tunnel sin romper el resto de config.json', () => {
  const dir = tmpdir();
  const cfg = path.join(dir, 'config.json');
  fs.writeFileSync(cfg, '﻿' + JSON.stringify({ port: 4000, admins: ['pedro'], tunnel: { protocol: 'http2', token: 'viejo' } }));
  saveTunnelConfig(cfg, { mode: 'named', id: 'x', token: undefined });
  const out = JSON.parse(fs.readFileSync(cfg, 'utf8'));
  assert.equal(out.port, 4000);
  assert.deepEqual(out.admins, ['pedro']);
  assert.equal(out.tunnel.protocol, 'http2');
  assert.equal(out.tunnel.mode, 'named');
  assert.equal('token' in out.tunnel, false);
});

test('dominio.js: inicio de sesión, túnel, DNS y config (con cloudflared falso)', { skip: isWin }, () => {
  const dir = tmpdir();
  const home = path.join(dir, 'home');
  fs.mkdirSync(home);
  const cfg = path.join(dir, 'config.json');
  fs.writeFileSync(cfg, JSON.stringify({ port: 3000, tunnel: { cloudflaredPath: FAKE } }));
  const run = () =>
    spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/tools/dominio.js', 'agario.alexlamasg.lat', '--login', '--config', cfg], {
      cwd: ROOT,
      env: { ...process.env, HOME: home, USERPROFILE: home },
      encoding: 'utf8',
    });
  const r = run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(fs.readFileSync(cfg, 'utf8'));
  assert.equal(out.tunnel.mode, 'named');
  assert.equal(out.tunnel.hostname, 'agario.alexlamasg.lat');
  assert.equal(out.tunnel.name, 'jaha-io');
  assert.ok(fs.existsSync(out.tunnel.credentialsFile));
  const state = JSON.parse(fs.readFileSync(path.join(home, '.cloudflared', 'fake-state.json'), 'utf8'));
  assert.equal(state.tunnels.length, 1);
  assert.deepEqual(state.routes[0], { tunnel: out.tunnel.id, hostname: 'agario.alexlamasg.lat', overwrite: true });
  // Repetir no crea otro túnel ni pide login de nuevo
  const r2 = run();
  assert.equal(r2.status, 0, r2.stdout + r2.stderr);
  const state2 = JSON.parse(fs.readFileSync(path.join(home, '.cloudflared', 'fake-state.json'), 'utf8'));
  assert.equal(state2.tunnels.length, 1);
  assert.equal(state2.calls.filter((c) => c[1] === 'login').length, 1);
});

test('startTunnel: avisa el link fijo cuando el túnel conecta', { skip: isWin }, async () => {
  const dir = tmpdir();
  const cred = path.join(dir, 'id.json');
  fs.writeFileSync(cred, '{}');
  for (const [tunnel, expected] of [
    [{ mode: 'named', id: 'id', hostname: 'agario.alexlamasg.lat', credentialsFile: cred }, 'https://agario.alexlamasg.lat'],
    [{ mode: 'token', token: 'eyJfake', hostname: 'agario.alexlamasg.lat' }, 'https://agario.alexlamasg.lat'],
    [{ mode: 'quick' }, 'https://fake-quick-tunnel.trycloudflare.com'],
  ]) {
    const url = await new Promise((resolve, reject) => {
      const t = startTunnel({
        port: 3000,
        tunnel: { cloudflaredPath: FAKE, protocol: 'auto', ...tunnel },
        dataDir: dir,
        onUrl: (u) => {
          if (u) {
            t.stop();
            resolve(u);
          }
        },
        onStatus: (s, d) => s === 'error' && reject(new Error(d)),
      });
      setTimeout(() => reject(new Error('sin respuesta')), 5000);
    });
    assert.equal(url, expected, tunnel.mode);
  }
});
