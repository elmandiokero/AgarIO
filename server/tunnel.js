// Túnel gratuito de Cloudflare ("quick tunnel"): da una URL https pública sin abrir puertos del router.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { ROOT } from './config.js';

const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

export function findCloudflared(custom = '') {
  const isWin = process.platform === 'win32';
  const exe = isWin ? 'cloudflared.exe' : 'cloudflared';
  const candidates = [];
  if (custom) candidates.push(path.resolve(ROOT, custom));
  candidates.push(path.join(ROOT, 'tools', exe));
  if (isWin) {
    const pf86 = process.env['ProgramFiles(x86)'];
    const pf = process.env.ProgramFiles;
    const local = process.env.LOCALAPPDATA;
    if (pf86) candidates.push(path.join(pf86, 'cloudflared', exe));
    if (pf) candidates.push(path.join(pf, 'cloudflared', exe));
    if (local) candidates.push(path.join(local, 'Microsoft', 'WinGet', 'Links', exe));
  }
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* ignorar */
    }
  }
  // ¿Está en el PATH?
  try {
    const r = spawnSync(exe, ['--version'], { stdio: 'ignore', windowsHide: true, timeout: 5000 });
    if (r.status === 0) return exe;
  } catch {
    /* no está */
  }
  return null;
}

/**
 * Arranca cloudflared y avisa la URL pública por onUrl(url). Se reinicia solo si se cae.
 * @returns {{stop: () => void, url: () => string|null}}
 */
export function startTunnel({ port, protocol = 'auto', cloudflaredPath = '', log, onUrl, onStatus }) {
  const bin = findCloudflared(cloudflaredPath);
  if (!bin) {
    onStatus?.('missing');
    return { stop() {}, url: () => null, missing: true };
  }
  let child = null;
  let stopped = false;
  let current = null;
  let restarts = 0;
  let timer = null;

  const run = () => {
    if (stopped) return;
    const args = ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`];
    if (protocol && protocol !== 'auto') args.push('--protocol', protocol);
    onStatus?.('starting');
    child = spawn(bin, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const onData = (buf) => {
      const text = buf.toString();
      const m = text.match(URL_RE);
      if (m && m[0] !== current) {
        current = m[0];
        restarts = 0;
        onUrl?.(current);
      }
      if (/failed to (dial|connect)|unable to reach|error="/i.test(text) && !current) {
        log?.debug?.('cloudflared:', text.trim().slice(0, 300));
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (err) => {
      log?.warn('No se pudo iniciar cloudflared:', err.message);
    });
    child.on('exit', (code) => {
      child = null;
      if (stopped) return;
      current = null;
      onUrl?.(null);
      restarts++;
      const wait = Math.min(60, 2 ** Math.min(restarts, 6)) * 1000;
      log?.warn(`El túnel se cerró (código ${code}). Reintentando en ${wait / 1000}s…`);
      onStatus?.('restarting');
      timer = setTimeout(run, wait);
    });
  };
  run();

  return {
    url: () => current,
    stop() {
      stopped = true;
      clearTimeout(timer);
      if (child) {
        try {
          child.kill();
        } catch {
          /* ignorar */
        }
      }
    },
  };
}

/** Aviso: un config.yml de cloudflared rompe los quick tunnels. */
export function cloudflaredConfigWarning() {
  const home = process.env.USERPROFILE || process.env.HOME;
  if (!home) return null;
  for (const f of ['config.yml', 'config.yaml']) {
    const p = path.join(home, '.cloudflared', f);
    if (fs.existsSync(p)) return p;
  }
  return null;
}
