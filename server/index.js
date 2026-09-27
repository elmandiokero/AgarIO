// Punto de entrada: node server/index.js [--tunnel] [--port 3000] [--config archivo] [--data carpeta]
import './util/quiet-sqlite-warning.js';
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import { loadConfig, ROOT } from './config.js';
import { createGameServer } from './create-server.js';
import { startTunnel, cloudflaredConfigWarning } from './tunnel.js';
import { log } from './util/log.js';

const EXIT_CONFIG = 78; // los .bat no reintentan con este código

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const { config, configPath, fileError } = loadConfig({ argv: process.argv.slice(2) });

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  blue: (s) => `\x1b[34m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

function flag() {
  return `${c.red('████')}${'████'}${c.blue('████')}`;
}

async function qr(url) {
  try {
    return await QRCode.toString(url, { type: 'terminal', small: true, errorCorrectionLevel: 'L' });
  } catch {
    return '';
  }
}

let tunnel = null;

async function main() {
  if (fileError) {
    console.error(c.red(`\n✖ ${fileError}`));
    console.error('  Revisá que config.json sea JSON válido (comas, comillas). Podés borrarlo y se crea de nuevo.\n');
    process.exit(EXIT_CONFIG);
  }
  const server = await createGameServer({ config, log, version: pkg.version });
  let port;
  try {
    port = await server.listen();
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      console.error(c.red(`\n✖ El puerto ${config.port} ya está en uso.`));
      console.error('  ¿Ya tenés el juego abierto en otra ventana? Cerrala, o cambiá "port" en config.json.\n');
    } else if (err.code === 'EACCES') {
      console.error(c.red(`\n✖ No hay permiso para usar el puerto ${config.port}. Probá con otro (ej. 3000).\n`));
    } else {
      console.error(c.red(`\n✖ No se pudo iniciar el servidor: ${err.message}\n`));
    }
    process.exit(EXIT_CONFIG);
  }

  const { lan } = server.getUrls();
  console.log('');
  console.log(`  ${flag()}  ${c.bold(config.title)} ${c.dim('v' + pkg.version)}  —  ¡Mba'éichapa! ¡Jaha!`);
  console.log('');
  console.log(`  ➜ En esta PC:        ${c.green(`http://localhost:${port}`)}`);
  if (lan.length) {
    for (const u of lan) console.log(`  ➜ En tu WiFi / red:  ${c.green(u)}`);
  } else {
    console.log(`  ➜ En tu WiFi / red:  ${c.yellow('(no se encontró una red local)')}`);
  }
  console.log(c.dim(`  Configuración: ${configPath}`));
  console.log('');
  if (lan[0]) {
    console.log('  Escaneá con el celular (misma WiFi):');
    console.log((await qr(lan[0])).replace(/^/gm, '    '));
  }

  if (config.tunnel.enabled) {
    const mode = config.tunnel.mode;
    if (mode === 'quick') {
      const warnCfg = cloudflaredConfigWarning();
      if (warnCfg) log.warn(`Existe ${warnCfg}: puede impedir el túnel rápido. Si falla, renombralo.`);
      console.log('  🌐 Iniciando el túnel de Internet (Cloudflare)…');
    } else {
      console.log(`  🌐 Conectando ${c.bold(`https://${config.tunnel.hostname || '(dominio sin configurar)'}`)} con Cloudflare…`);
    }
    tunnel = startTunnel({
      port,
      tunnel: config.tunnel,
      dataDir: config.dataDir,
      log,
      onStatus: (s, detail) => {
        if (s === 'missing') {
          console.log(c.yellow('  ⚠ No se encontró cloudflared. Sólo se puede jugar en la misma red WiFi.'));
          console.log(c.yellow('    Ejecutá 1-INSTALAR.bat para instalarlo.'));
        } else if (s === 'error') {
          console.log(c.yellow(`  ⚠ ${detail}`));
          console.log(c.yellow('    Mientras tanto se puede jugar en la misma red WiFi.'));
        }
      },
      onUrl: async (url, tmode) => {
        server.setPublicUrl(url);
        if (!url) return;
        console.log('');
        console.log(`  🌎 ${c.bold('Link para jugar por Internet')} (compartilo con tus amigos):`);
        console.log(`     ${c.green(url)}`);
        if (tmode === 'quick') {
          console.log(c.dim('     (este link cambia cada vez que reiniciás el servidor;'));
          console.log(c.dim('      para un link fijo con tu dominio usá 4-CONFIGURAR-DOMINIO.bat)'));
        } else {
          console.log(c.dim('     (link fijo: es siempre el mismo)'));
        }
        console.log((await qr(url)).replace(/^/gm, '    '));
      },
    });
  } else {
    console.log(c.dim('  Túnel de Internet desactivado (usá 2-INICIAR.bat o --tunnel para activarlo).'));
  }
  console.log(c.dim('  Cerrá esta ventana o apretá Ctrl+C para apagar el servidor.\n'));

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    console.log(`\n  Apagando (${signal})… guardando partidas. ¡Aguyje por jugar!`);
    try {
      tunnel?.stop();
      await Promise.race([server.close(), new Promise((r) => setTimeout(r, 4000))]);
    } catch (err) {
      log.error(err.message);
    }
    process.exit(0);
  };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
    try {
      process.on(sig, () => shutdown(sig));
    } catch {
      /* señal no soportada en esta plataforma */
    }
  }
  process.on('uncaughtException', (err) => {
    log.error('Error inesperado:', err.stack || err.message);
    try {
      server.rooms.shutdown();
    } catch {
      /* ignorar */
    }
    tunnel?.stop();
    process.exit(1);
  });
  // Que cloudflared no quede andando solo si el proceso termina
  process.on('exit', () => tunnel?.stop());
}

main().catch((err) => {
  console.error(c.red(`✖ ${err.stack || err.message}`));
  process.exit(1);
});
