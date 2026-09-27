// Herramienta de administración por consola.
//   npm run admin -- ayuda
//   npm run backup
import '../util/quiet-sqlite-warning.js';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { openDatabase } from '../db/database.js';
import { createRepos } from '../db/repos.js';
import { hashPassword } from '../auth/passwords.js';
import { levelFromXp, formatGs } from '../../shared/formulas.js';

const HELP = `
Jaha.io — administración

  npm run admin -- backup                         Copia la base de datos a data/backups/
  npm run admin -- usuarios                       Lista las cuentas
  npm run admin -- reset-password USUARIO CLAVE   Cambia la contraseña de una cuenta
  npm run admin -- dar-gs USUARIO CANTIDAD        Regala guaraníes (₲) a una cuenta
  npm run admin -- admin USUARIO [si|no]          Da o quita permisos de admin (se guarda en config.json)
  npm run admin -- ban USUARIO                    Suspende una cuenta
  npm run admin -- unban USUARIO                  Levanta la suspensión
`;

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2).filter((a) => a !== '--');
  if (!cmd || cmd === 'ayuda' || cmd === 'help' || cmd === '-h') {
    console.log(HELP);
    return;
  }
  const { config, configPath } = loadConfig({ argv: [], createFile: true });
  const dbFile = path.join(config.dataDir, 'jaha.db');
  if (!fs.existsSync(dbFile) && cmd !== 'backup') {
    console.log('Todavía no hay base de datos. Iniciá el servidor una vez primero.');
    process.exit(1);
  }
  const db = await openDatabase(dbFile);
  const repos = createRepos(db);
  const need = (u) => {
    const user = repos.getUserByName(u || '');
    if (!user) {
      console.error(`✖ No existe la cuenta "${u}".`);
      process.exit(1);
    }
    return user;
  };

  switch (cmd) {
    case 'backup': {
      const dir = path.join(config.dataDir, 'backups');
      fs.mkdirSync(dir, { recursive: true });
      const out = path.join(dir, `jaha-${stamp()}.db`);
      db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
      // dejar sólo los últimos 30 respaldos
      const files = fs.readdirSync(dir).filter((f) => /^jaha-\d{8}-\d{6}\.db$/.test(f)).sort();
      for (const f of files.slice(0, Math.max(0, files.length - 30))) fs.rmSync(path.join(dir, f));
      console.log(`✔ Respaldo guardado en ${out}`);
      break;
    }
    case 'usuarios':
    case 'users': {
      const rows = db.prepare('SELECT username, display_name, xp, coins, is_admin, banned, created_at FROM users ORDER BY xp DESC LIMIT 200').all();
      if (!rows.length) console.log('No hay cuentas todavía.');
      for (const r of rows) {
        const flags = [r.is_admin ? 'admin' : '', r.banned ? 'SUSPENDIDO' : ''].filter(Boolean).join(', ');
        console.log(`${r.username.padEnd(16)} ${r.display_name.padEnd(18)} nivel ${String(levelFromXp(r.xp)).padStart(2)}  ${formatGs(r.coins).padStart(14)}  ${flags}`);
      }
      console.log(`\nTotal: ${repos.countUsers()} cuentas`);
      break;
    }
    case 'reset-password': {
      const [u, pass] = args;
      if (!pass || pass.length < 6) {
        console.error('✖ La contraseña nueva debe tener al menos 6 caracteres.');
        process.exit(1);
      }
      const user = need(u);
      repos.setPassword(user.id, await hashPassword(pass));
      repos.deleteUserSessions(user.id);
      console.log(`✔ Contraseña de ${user.username} cambiada. Tiene que volver a iniciar sesión.`);
      break;
    }
    case 'dar-gs':
    case 'grant-coins': {
      const [u, amount] = args;
      const n = Math.round(Number(amount));
      if (!Number.isFinite(n) || n === 0 || Math.abs(n) > 100_000_000) {
        console.error('✖ Cantidad inválida.');
        process.exit(1);
      }
      const user = need(u);
      repos.addCoins(user.id, n, 'admin');
      console.log(`✔ ${user.username} ahora tiene ${formatGs(repos.getUser(user.id).coins)}`);
      break;
    }
    case 'admin':
    case 'set-admin': {
      const [u, onOff = 'si'] = args;
      const user = need(u);
      const on = !/^(no|off|false|0)$/i.test(onOff);
      let file = {};
      try {
        file = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^﻿/, ''));
      } catch {
        file = {};
      }
      const list = new Set((file.admins || []).map((a) => String(a).toLowerCase()));
      if (on) list.add(user.username.toLowerCase());
      else list.delete(user.username.toLowerCase());
      file.admins = [...list];
      fs.writeFileSync(configPath, JSON.stringify(file, null, 2) + '\n');
      repos.setAdmin(user.id, on);
      console.log(`✔ ${user.username} ${on ? 'ahora es admin' : 'ya no es admin'} (guardado en ${configPath}).`);
      break;
    }
    case 'ban':
    case 'unban': {
      const user = need(args[0]);
      repos.setBanned(user.id, cmd === 'ban');
      if (cmd === 'ban') repos.deleteUserSessions(user.id);
      console.log(`✔ ${user.username} ${cmd === 'ban' ? 'suspendido' : 'habilitado de nuevo'}.`);
      break;
    }
    default:
      console.log(`Comando desconocido: ${cmd}`);
      console.log(HELP);
      process.exit(1);
  }
  db.close();
}

main().catch((err) => {
  console.error(`✖ ${err.message}`);
  process.exit(1);
});
