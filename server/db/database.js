// Base de datos SQLite incorporada en Node (node:sqlite). Sin módulos nativos que compilar.
import '../util/quiet-sqlite-warning.js';
import fs from 'node:fs';
import path from 'node:path';
import { MIGRATIONS } from './migrations.js';

let sqliteMod = null;

async function loadSqlite() {
  if (!sqliteMod) sqliteMod = await import('node:sqlite');
  return sqliteMod;
}

/**
 * Abre (o crea) la base de datos y aplica las migraciones.
 * @param {string} file  ruta del archivo o ':memory:'
 */
export async function openDatabase(file) {
  const { DatabaseSync } = await loadSqlite();
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 3000');
  migrate(db);
  return db;
}

export function migrate(db) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`Falló la migración ${v + 1}: ${err.message}`);
    }
  }
}

const depth = new WeakMap();

/**
 * Ejecuta fn dentro de una transacción. Es anidable: si ya hay una abierta, sólo ejecuta fn
 * (llevamos la cuenta nosotros porque db.isTransaction no existe en todas las versiones de Node).
 */
export function tx(db, fn) {
  const d = depth.get(db) || 0;
  if (d > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  depth.set(db, 1);
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* ignorar */
    }
    throw err;
  } finally {
    depth.set(db, 0);
  }
}
