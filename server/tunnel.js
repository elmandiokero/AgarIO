// Túnel de Cloudflare: da una URL https pública sin abrir puertos del router.
//
// Modos (config.json → tunnel.mode):
//  - "quick": túnel rápido gratuito, sin cuenta. El link (…trycloudflare.com) cambia en cada inicio.
//  - "named": túnel con nombre en tu cuenta de Cloudflare → dominio propio fijo (ej. agario.alexlamasg.lat).
//             Lo configura 4-CONFIGURAR-DOMINIO.bat (server/tools/dominio.js).
//  - "token": túnel creado desde el panel de Cloudflare (Zero Trust → Tunnels) usando su token.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { ROOT } from './config.js';

const QUICK_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const CONNECTED_RE = /Registered tunnel connection/i;
export const HOSTNAME_RE = /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function cloudflaredHome() {
  return path.join(os.homedir(), '.cloudflared');
}

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
 * Arma los argumentos de cloudflared según el modo. Función pura salvo por escribir el .yml del modo "named".
 * @returns {{args: string[], env: object, fixedUrl: string|null, mode: string}|{error: string, mode: string}}
 */
export function buildTunnelSpec({ port, tunnel, dataDir }) {
  const mode = tunnel.mode || 'quick';
  const base = ['tunnel', '--no-autoupdate'];
  if (tunnel.protocol && tunnel.protocol !== 'auto') base.push('--protocol', tunnel.protocol);

  if (mode === 'named') {
    if (!tunnel.id || !tunnel.hostname || !HOSTNAME_RE.test(tunnel.hostname)) {
      return { mode, error: 'El túnel con dominio no está configurado. Ejecutá 4-CONFIGURAR-DOMINIO.bat.' };
    }
    const cred = tunnel.credentialsFile || path.join(cloudflaredHome(), `${tunnel.id}.json`);
    if (!fs.existsSync(cred)) {
      return { mode, error: `No se encontró la credencial del túnel (${cred}). Ejecutá 4-CONFIGURAR-DOMINIO.bat de nuevo.` };
    }
    // JSON.stringify produce un string entre comillas dobles válido en YAML (escapa las \ de Windows)
    const yml = [
      `tunnel: ${tunnel.id}`,
      `credentials-file: ${JSON.stringify(cred)}`,
      'ingress:',
      `  - hostname: ${tunnel.hostname}`,
      `    service: http://127.0.0.1:${port}`,
      '  - service: http_status:404',
      '',
    ].join('\n');
    fs.mkdirSync(dataDir, { recursive: true });
    const file = path.join(dataDir, 'cloudflared-jaha.yml');
    fs.writeFileSync(file, yml);
    return { mode, args: [...base, '--config', file, 'run'], env: {}, fixedUrl: `https://${tunnel.hostname}` };
  }

  if (mode === 'token') {
    if (!tunnel.token) return { mode, error: 'Falta el token del túnel. Ejecutá 4-CONFIGURAR-DOMINIO.bat.' };
    // El token va por variable de entorno para que no aparezca en la lista de procesos
    return {
      mode,
      args: [...base, 'run'],
      env: { TUNNEL_TOKEN: tunnel.token },
      fixedUrl: tunnel.hostname && HOSTNAME_RE.test(tunnel.hostname) ? `https://${tunnel.hostname}` : null,
    };
  }

  return { mode: 'quick', args: [...base, '--url', `http://127.0.0.1:${port}`], env: {}, fixedUrl: null };
}

/** Pistas para errores comunes de cloudflared. */
export function explainTunnelError(text) {
  if (/token is not valid|invalid token|Unauthorized: Invalid tunnel secret/i.test(text)) {
    return 'El token del túnel no es válido. Copialo de nuevo del panel de Cloudflare y ejecutá 4-CONFIGURAR-DOMINIO.bat.';
  }
  if (/credentials file .*(doesn't exist|not found|no such file)|Cannot determine default origin certificate/i.test(text)) {
    return 'Faltan las credenciales del túnel. Ejecutá 4-CONFIGURAR-DOMINIO.bat de nuevo.';
  }
  if (/tunnel not found|Tunnel .* not found|Unknown tunnel/i.test(text)) {
    return 'El túnel ya no existe en tu cuenta de Cloudflare. Ejecutá 4-CONFIGURAR-DOMINIO.bat de nuevo.';
  }
  if (/failed to (dial|connect) to edge|unable to reach the origin|network is unreachable|quic/i.test(text)) {
    return 'No se puede conectar con Cloudflare. Si sigue así, poné "protocol": "http2" en la sección "tunnel" de config.json.';
  }
  return null;
}

/**
 * Arranca cloudflared y avisa la URL pública por onUrl(url). Se reinicia solo si se cae.
 * @returns {{stop: () => void, url: () => string|null, mode: string}}
 */
export function startTunnel({ port, tunnel, dataDir, log, onUrl, onStatus }) {
  const bin = findCloudflared(tunnel.cloudflaredPath);
  if (!bin) {
    onStatus?.('missing');
    return { stop() {}, url: () => null, missing: true, mode: tunnel.mode || 'quick' };
  }
  let child = null;
  let stopped = false;
  let current = null;
  let restarts = 0;
  let timer = null;
  let lastLines = [];
  let hinted = false;

  const run = () => {
    if (stopped) return;
    const spec = buildTunnelSpec({ port, tunnel, dataDir });
    if (spec.error) {
      onStatus?.('error', spec.error);
      return;
    }
    onStatus?.('starting', spec.mode);
    lastLines = [];
    child = spawn(bin, spec.args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...spec.env } });
    const onData = (buf) => {
      const text = buf.toString();
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        lastLines.push(line.trim());
        if (lastLines.length > 8) lastLines.shift();
      }
      let url = null;
      if (spec.fixedUrl) {
        if (CONNECTED_RE.test(text)) url = spec.fixedUrl;
      } else {
        const m = text.match(QUICK_URL_RE);
        if (m) url = m[0];
      }
      if (url && url !== current) {
        current = url;
        restarts = 0;
        onUrl?.(current, spec.mode);
      }
      if (!current && !hinted) {
        const hint = explainTunnelError(text);
        if (hint) {
          hinted = true;
          log?.warn(hint);
        }
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
      const wasUp = current !== null;
      current = null;
      onUrl?.(null, spec.mode);
      restarts++;
      const wait = Math.min(60, 2 ** Math.min(restarts, 6)) * 1000;
      if (!wasUp && lastLines.length) {
        log?.warn('cloudflared dijo:\n    ' + lastLines.slice(-4).join('\n    '));
        const hint = explainTunnelError(lastLines.join('\n'));
        if (hint && !hinted) log?.warn(hint);
      }
      log?.warn(`El túnel se cerró (código ${code}). Reintentando en ${wait / 1000}s…`);
      onStatus?.('restarting', spec.mode);
      timer = setTimeout(run, wait);
    });
  };
  run();

  return {
    mode: tunnel.mode || 'quick',
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

/** Aviso: un config.yml de cloudflared en la carpeta del usuario rompe los túneles rápidos. */
export function cloudflaredConfigWarning() {
  for (const f of ['config.yml', 'config.yaml']) {
    const p = path.join(cloudflaredHome(), f);
    if (fs.existsSync(p)) return p;
  }
  return null;
}
