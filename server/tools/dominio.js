// Configura un dominio propio (ej. agario.alexlamasg.lat) con un túnel de Cloudflare.
//
//   node server/tools/dominio.js                       (pregunta todo)
//   node server/tools/dominio.js agario.alexlamasg.lat (usa inicio de sesión automático)
//   node server/tools/dominio.js agario.alexlamasg.lat --token eyJ...   (token del panel de Cloudflare)
//   node server/tools/dominio.js --relogin             (vuelve a autorizar el dominio)
//   node server/tools/dominio.js --desactivar          (vuelve al link al azar de trycloudflare)
//
// Requisito: el dominio (alexlamasg.lat) tiene que estar agregado en tu cuenta de Cloudflare.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { findCloudflared, cloudflaredHome, HOSTNAME_RE } from '../tunnel.js';

export const DEFAULT_HOSTNAME = 'agario.alexlamasg.lat';
const TUNNEL_NAME_RE = /^[a-zA-Z0-9_.-]{1,60}$/;

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function parseArgs(argv) {
  const out = { hostname: null, token: null, login: false, relogin: false, off: false, name: null, config: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--token') out.token = argv[++i] || '';
    else if (a.startsWith('--token=')) out.token = a.slice(8);
    else if (a === '--login') out.login = true;
    else if (a === '--relogin') out.relogin = out.login = true;
    else if (a === '--desactivar' || a === '--off') out.off = true;
    else if (a === '--name') out.name = argv[++i];
    else if (a === '--config') out.config = argv[++i];
    else if (!a.startsWith('--') && !out.hostname) out.hostname = a;
  }
  return out;
}

/** Limpia lo que escribió el usuario: "https://Agario.AlexLamasG.lat/" → "agario.alexlamasg.lat" */
export function normalizeHostname(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/\.$/, '');
}

/**
 * Saca el token de lo que pegó el usuario (puede pegar el comando entero del panel,
 * ej. "cloudflared.exe service install eyJhIjoi..."). Devuelve {token, tunnelId} o null.
 */
export function parseTunnelToken(raw) {
  const m = String(raw || '').match(/eyJ[A-Za-z0-9_\-+/]+={0,2}/);
  if (!m) return null;
  try {
    const json = JSON.parse(Buffer.from(m[0], 'base64').toString('utf8'));
    if (!json || typeof json.t !== 'string' || typeof json.a !== 'string' || typeof json.s !== 'string') return null;
    return { token: m[0], tunnelId: json.t };
  } catch {
    return null;
  }
}

/** Guarda la sección "tunnel" en config.json sin tocar el resto. */
export function saveTunnelConfig(configPath, patch) {
  let file = {};
  if (fs.existsSync(configPath)) {
    try {
      file = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^﻿/, ''));
    } catch (err) {
      throw new Error(`No se pudo leer ${configPath}: ${err.message}. Arreglalo o borralo y probá de nuevo.`);
    }
  }
  file.tunnel = { ...(file.tunnel || {}), ...patch };
  for (const [k, v] of Object.entries(file.tunnel)) if (v === undefined) delete file.tunnel[k];
  fs.writeFileSync(configPath, JSON.stringify(file, null, 2) + '\n');
  return file.tunnel;
}

function run(bin, args, { capture = false } = {}) {
  const r = spawnSync(bin, args, {
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    windowsHide: false,
  });
  if (r.error) throw new Error(`No se pudo ejecutar cloudflared: ${r.error.message}`);
  return r;
}

function listTunnels(bin) {
  const r = run(bin, ['tunnel', 'list', '--output', 'json'], { capture: true });
  if (r.status !== 0) {
    throw new Error(`cloudflared no pudo listar los túneles:\n${(r.stderr || '').trim().split('\n').slice(-3).join('\n')}`);
  }
  try {
    const list = JSON.parse(r.stdout || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function findTunnel(bin, name) {
  return listTunnels(bin).find((t) => t && t.name === name && !t.deleted_at) || null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { config, configPath } = loadConfig({ argv: args.config ? ['--config', args.config] : [], createFile: true });
  const say = (s = '') => console.log(s);
  say('');
  say(c.bold('  🇵🇾 Jaha.io — Dominio propio con Cloudflare'));
  say('');

  if (args.off) {
    saveTunnelConfig(configPath, { mode: 'quick' });
    say(c.green('  ✔ Listo: se vuelve a usar el link al azar (…trycloudflare.com).'));
    return 0;
  }

  const bin = findCloudflared(config.tunnel.cloudflaredPath);
  if (!bin) {
    say(c.red('  ✖ No se encontró cloudflared. Ejecutá primero 1-INSTALAR.bat.'));
    return 1;
  }

  const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
  const ask = async (q, def = '') => {
    if (!rl) return def;
    const a = (await rl.question(q)).trim();
    return a || def;
  };

  try {
    // 1) Dominio
    const def = config.tunnel.hostname || DEFAULT_HOSTNAME;
    let hostname = normalizeHostname(args.hostname || (await ask(`  ¿En qué dirección va a estar el juego? [${def}]: `, def)));
    if (!HOSTNAME_RE.test(hostname)) {
      say(c.red(`  ✖ "${hostname}" no parece un dominio válido (ej. ${DEFAULT_HOSTNAME}).`));
      return 1;
    }

    // 2) ¿Token del panel o inicio de sesión automático?
    let tokenRaw = args.token;
    if (tokenRaw === null && !args.login) {
      say('');
      say('  Hay dos formas de configurarlo:');
      say(`   ${c.bold('A)')} Automática (recomendada): se abre el navegador, entrás a tu cuenta de`);
      say(`      Cloudflare, elegís ${c.bold(hostname.split('.').slice(-2).join('.'))} y tocás "Authorize".`);
      say(`   ${c.bold('B)')} Con un token que copiaste del panel de Cloudflare (Zero Trust → Networks → Tunnels).`);
      say('');
      tokenRaw = await ask('  Si tenés el token (opción B), pegalo acá. Si no, apretá Enter para la opción A: ', '');
    }

    if (tokenRaw) {
      const parsed = parseTunnelToken(tokenRaw);
      if (!parsed) {
        say(c.red('  ✖ Eso no parece un token de túnel de Cloudflare (empieza con "eyJ").'));
        return 1;
      }
      saveTunnelConfig(configPath, { mode: 'token', token: parsed.token, hostname });
      say('');
      say(c.green(`  ✔ Token guardado (túnel ${parsed.tunnelId}).`));
      say('');
      say(`  ${c.yellow('Importante:')} en el panel de Cloudflare, en ese túnel, agregá un "Public Hostname":`);
      say(`     Subdomain: ${c.bold(hostname.split('.')[0])}   Domain: ${c.bold(hostname.split('.').slice(1).join('.'))}`);
      say(`     Service:   ${c.bold('HTTP')}  →  ${c.bold(`localhost:${config.port}`)}`);
      say('');
      say(`  Después abrí ${c.bold('2-INICIAR.bat')} y el juego va a estar en ${c.cyan(`https://${hostname}`)}`);
      return 0;
    }

    // 3) Inicio de sesión (cert.pem)
    const home = cloudflaredHome();
    const cert = path.join(home, 'cert.pem');
    if (args.relogin && fs.existsSync(cert)) {
      const bak = `${cert}.bak-${Date.now()}`;
      fs.renameSync(cert, bak);
      say(`  (el permiso anterior se guardó como ${bak})`);
    }
    if (!fs.existsSync(cert)) {
      say('');
      say(c.bold('  Paso 1: autorizar tu dominio en Cloudflare'));
      say('  Se va a abrir el navegador (si no se abre, copiá el link que aparece abajo).');
      say(`  Entrá con tu cuenta de Cloudflare, elegí ${c.bold(hostname.split('.').slice(-2).join('.'))} y tocá ${c.bold('Authorize')}.`);
      say('  Esta ventana espera sola hasta que termines.');
      say('');
      run(bin, ['tunnel', 'login']);
      if (!fs.existsSync(cert)) {
        say(c.red('  ✖ No se completó la autorización. Probá de nuevo.'));
        return 1;
      }
      say(c.green('  ✔ Dominio autorizado.'));
    } else {
      say(c.green('  ✔ Ya había permiso de Cloudflare en esta PC.'));
    }

    // 4) Túnel
    const name = args.name || config.tunnel.name || 'jaha-io';
    if (!TUNNEL_NAME_RE.test(name)) {
      say(c.red(`  ✖ Nombre de túnel inválido: ${name}`));
      return 1;
    }
    say('');
    say(c.bold(`  Paso 2: túnel "${name}"`));
    let t = findTunnel(bin, name);
    if (!t) {
      const r = run(bin, ['tunnel', 'create', name]);
      if (r.status !== 0) {
        say(c.red('  ✖ No se pudo crear el túnel (mirá el mensaje de arriba).'));
        return 1;
      }
      t = findTunnel(bin, name);
    }
    if (!t || !t.id) {
      say(c.red('  ✖ No encontré el túnel después de crearlo.'));
      return 1;
    }
    const cred = path.join(home, `${t.id}.json`);
    if (!fs.existsSync(cred)) {
      // El túnel existe (quizás se creó en otra PC): bajar su credencial
      const r = run(bin, ['tunnel', 'token', '--cred-file', cred, t.id]);
      if (r.status !== 0 || !fs.existsSync(cred)) {
        say(c.red('  ✖ No se pudo obtener la credencial del túnel.'));
        return 1;
      }
    }
    say(c.green(`  ✔ Túnel listo (${t.id}).`));

    // 5) DNS: agario.alexlamasg.lat → túnel
    say('');
    say(c.bold(`  Paso 3: dirección ${hostname}`));
    const r = run(bin, ['tunnel', 'route', 'dns', '--overwrite-dns', t.id, hostname]);
    if (r.status !== 0) {
      say(c.red(`  ✖ No se pudo crear el registro DNS de ${hostname}.`));
      say('    Revisá que el dominio esté en tu cuenta de Cloudflare y que hayas autorizado');
      say('    ese mismo dominio. Para autorizar de nuevo: 4-CONFIGURAR-DOMINIO.bat --relogin');
      return 1;
    }
    say(c.green(`  ✔ ${hostname} apunta al túnel.`));

    saveTunnelConfig(configPath, { mode: 'named', name, id: t.id, credentialsFile: cred, hostname, token: undefined });
    say('');
    say(c.green(c.bold('  ¡Listo! ¡Jaha!')));
    say(`  Abrí ${c.bold('2-INICIAR.bat')} y el juego va a estar en ${c.cyan(`https://${hostname}`)}`);
    say('  (el link es fijo: compartilo una vez y sirve siempre, mientras el servidor esté prendido)');
    return 0;
  } finally {
    rl?.close();
  }
}

// Ejecutar sólo si se llama directamente (los tests importan las funciones)
const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(c.red(`  ✖ ${err.message}`));
      process.exit(1);
    });
}
