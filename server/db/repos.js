// Acceso a datos con sentencias preparadas.
import { tx } from './database.js';

const STAT_COLUMNS = [
  'games_played', 'games_ffa', 'games_br', 'deaths', 'time_alive_ms', 'longest_life_ms', 'max_mass',
  'total_mass_gained', 'food_eaten', 'cells_eaten', 'players_eaten', 'bots_eaten', 'viruses_popped', 'splits',
  'ejects', 'times_top1_ffa', 'best_rank_ffa', 'br_wins', 'br_top3', 'best_br_place', 'xp_earned_total',
  'coins_earned_total',
];

export const LEADERBOARD_METRICS = {
  xp: { sql: 'u.xp', label: 'Experiencia' },
  max_mass: { sql: 's.max_mass', label: 'Masa máxima' },
  kills: { sql: 's.players_eaten + s.bots_eaten', label: 'Jugadores comidos' },
  br_wins: { sql: 's.br_wins', label: 'Victorias en Batalla real' },
  time: { sql: 's.time_alive_ms', label: 'Tiempo jugado' },
  food: { sql: 's.food_eaten', label: 'Chipitas comidas' },
};

export function createRepos(db) {
  const st = {
    insertUser: db.prepare(
      `INSERT INTO users (username, display_name, pass_hash, is_admin, xp, coins, equipped_skin, created_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?)`
    ),
    insertStats: db.prepare('INSERT INTO stats (user_id) VALUES (?)'),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
    nameTaken: db.prepare('SELECT 1 AS x FROM users WHERE username = ? OR display_name = ? COLLATE NOCASE LIMIT 1'),
    displayTaken: db.prepare('SELECT 1 AS x FROM users WHERE (display_name = ? COLLATE NOCASE OR username = ?) AND id != ? LIMIT 1'),
    setLastLogin: db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?'),
    setPassword: db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?'),
    setDisplay: db.prepare('UPDATE users SET display_name = ? WHERE id = ?'),
    setAdmin: db.prepare('UPDATE users SET is_admin = ? WHERE id = ?'),
    setBanned: db.prepare('UPDATE users SET banned = ? WHERE id = ?'),
    setEquipped: db.prepare('UPDATE users SET equipped_skin = ? WHERE id = ?'),
    setXpCoins: db.prepare('UPDATE users SET xp = ?, coins = ? WHERE id = ?'),
    addCoins: db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?'),
    spendCoins: db.prepare('UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?'),
    resetAdmins: db.prepare('UPDATE users SET is_admin = 0'),
    setAdminByName: db.prepare('UPDATE users SET is_admin = 1 WHERE username = ?'),

    insertSession: db.prepare(
      'INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ),
    sessionByHash: db.prepare('SELECT * FROM sessions WHERE token_hash = ?'),
    touchSession: db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    deleteUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    deleteExpiredSessions: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),

    statsByUser: db.prepare('SELECT * FROM stats WHERE user_id = ?'),

    insertMatch: db.prepare(
      `INSERT INTO matches (user_id, mode, started_at, ended_at, duration_ms, max_mass, final_mass, kills, bot_kills,
        food_eaten, best_rank, br_place, br_participants, xp, coins, end_reason, killer_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ),
    matchesByUser: db.prepare('SELECT * FROM matches WHERE user_id = ? ORDER BY ended_at DESC LIMIT ?'),
    pruneMatches: db.prepare(
      `DELETE FROM matches WHERE user_id = ? AND id NOT IN (SELECT id FROM matches WHERE user_id = ? ORDER BY ended_at DESC LIMIT 100)`
    ),

    skinsByUser: db.prepare('SELECT skin_id, source, acquired_at FROM user_skins WHERE user_id = ? ORDER BY acquired_at'),
    hasSkin: db.prepare('SELECT 1 AS x FROM user_skins WHERE user_id = ? AND skin_id = ?'),
    grantSkin: db.prepare('INSERT OR IGNORE INTO user_skins (user_id, skin_id, source, acquired_at) VALUES (?, ?, ?, ?)'),
    countSkins: db.prepare('SELECT COUNT(*) AS n FROM user_skins WHERE user_id = ?'),

    achByUser: db.prepare('SELECT achievement_id, unlocked_at FROM user_achievements WHERE user_id = ? ORDER BY unlocked_at'),
    grantAch: db.prepare('INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, unlocked_at) VALUES (?, ?, ?)'),

    settingsByUser: db.prepare('SELECT data FROM user_settings WHERE user_id = ?'),
    upsertSettings: db.prepare(
      `INSERT INTO user_settings (user_id, data, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    ),

    ledger: db.prepare('INSERT INTO coin_ledger (user_id, delta, reason, ref, at) VALUES (?, ?, ?, ?, ?)'),
    countUsers: db.prepare('SELECT COUNT(*) AS n FROM users'),
  };

  const lbCache = new Map();
  const updCache = new Map();
  function lbStatements(metric) {
    if (!lbCache.has(metric)) {
      const m = LEADERBOARD_METRICS[metric];
      lbCache.set(metric, {
        top: db.prepare(
          `SELECT u.id, u.username, u.display_name, u.xp, u.equipped_skin, ${m.sql} AS value
           FROM users u JOIN stats s ON s.user_id = u.id
           WHERE u.banned = 0 AND ${m.sql} > 0
           ORDER BY value DESC, u.id ASC LIMIT ?`
        ),
        mine: db.prepare(`SELECT ${m.sql} AS value FROM users u JOIN stats s ON s.user_id = u.id WHERE u.id = ?`),
        rank: db.prepare(
          `SELECT COUNT(*) AS n FROM users u JOIN stats s ON s.user_id = u.id WHERE u.banned = 0 AND ${m.sql} > ?`
        ),
      });
    }
    return lbCache.get(metric);
  }

  return {
    db,
    tx: (fn) => tx(db, fn),

    // ---- usuarios
    createUser({ username, displayName, passHash, isAdmin = false, coins = 0, skin = 'bandera', now = Date.now(), freeSkins = [] }) {
      return tx(db, () => {
        const r = st.insertUser.run(username, displayName, passHash, isAdmin ? 1 : 0, coins, skin, now);
        const id = Number(r.lastInsertRowid);
        st.insertStats.run(id);
        for (const s of freeSkins) st.grantSkin.run(id, s, 'default', now);
        return id;
      });
    },
    getUser: (id) => st.userById.get(id) || null,
    getUserByName: (username) => st.userByName.get(username) || null,
    isNameTaken: (name) => !!st.nameTaken.get(name, name),
    isDisplayTaken: (name, exceptId = 0) => !!st.displayTaken.get(name, name, exceptId),
    setLastLogin: (id, now = Date.now()) => st.setLastLogin.run(now, id),
    setPassword: (id, hash) => st.setPassword.run(hash, id),
    setDisplayName: (id, name) => st.setDisplay.run(name, id),
    setAdmin: (id, v) => st.setAdmin.run(v ? 1 : 0, id),
    setBanned: (id, v) => st.setBanned.run(v ? 1 : 0, id),
    setEquipped: (id, skin) => st.setEquipped.run(skin, id),
    setXpCoins: (id, xp, coins) => st.setXpCoins.run(xp, coins, id),
    syncAdmins(usernames) {
      tx(db, () => {
        st.resetAdmins.run();
        for (const u of usernames) st.setAdminByName.run(u);
      });
    },
    countUsers: () => st.countUsers.get().n,

    addCoins(id, delta, reason, ref = null, now = Date.now()) {
      return tx(db, () => {
        st.addCoins.run(delta, id);
        st.ledger.run(id, delta, reason, ref, now);
      });
    },
    /** Descuenta monedas sólo si alcanza. Devuelve true si se pudo. */
    spendCoins(id, amount, reason, ref = null, now = Date.now()) {
      return tx(db, () => {
        const r = st.spendCoins.run(amount, id, amount);
        if (Number(r.changes) !== 1) return false;
        st.ledger.run(id, -amount, reason, ref, now);
        return true;
      });
    },
    ledger: (id, delta, reason, ref = null, now = Date.now()) => st.ledger.run(id, delta, reason, ref, now),

    // ---- sesiones
    insertSession: (hash, userId, now, expires, ip, ua) => st.insertSession.run(hash, userId, now, now, expires, ip, ua),
    getSession: (hash) => st.sessionByHash.get(hash) || null,
    touchSession: (hash, now, expires) => st.touchSession.run(now, expires, hash),
    deleteSession: (hash) => st.deleteSession.run(hash),
    deleteUserSessions: (userId) => st.deleteUserSessions.run(userId),
    deleteExpiredSessions: (now = Date.now()) => st.deleteExpiredSessions.run(now),

    // ---- estadísticas
    getStats: (userId) => st.statsByUser.get(userId) || null,
    /** Suma/actualiza columnas. deltas: {col: n}, maxes: {col: n}, mins: {col: n} */
    updateStats(userId, { add = {}, max = {}, min = {} }) {
      const sets = [];
      const params = [];
      for (const [k, v] of Object.entries(add)) {
        if (!STAT_COLUMNS.includes(k) || !v) continue;
        sets.push(`${k} = ${k} + ?`);
        params.push(Math.round(v));
      }
      for (const [k, v] of Object.entries(max)) {
        if (!STAT_COLUMNS.includes(k) || v == null) continue;
        sets.push(`${k} = MAX(${k}, ?)`);
        params.push(Math.round(v));
      }
      for (const [k, v] of Object.entries(min)) {
        if (!STAT_COLUMNS.includes(k) || !v) continue;
        sets.push(`${k} = CASE WHEN ${k} IS NULL OR ${k} > ? THEN ? ELSE ${k} END`);
        params.push(Math.round(v), Math.round(v));
      }
      if (!sets.length) return;
      params.push(userId);
      const sql = `UPDATE stats SET ${sets.join(', ')} WHERE user_id = ?`;
      let stmt = updCache.get(sql);
      if (!stmt) {
        stmt = db.prepare(sql);
        if (updCache.size > 64) updCache.clear();
        updCache.set(sql, stmt);
      }
      stmt.run(...params);
    },

    insertMatch(m) {
      st.insertMatch.run(
        m.userId, m.mode, m.startedAt, m.endedAt, m.durationMs, m.maxMass, m.finalMass, m.kills, m.botKills,
        m.foodEaten, m.bestRank ?? null, m.brPlace ?? null, m.brParticipants ?? null, m.xp, m.coins, m.reason ?? null,
        m.killerName ?? null
      );
      st.pruneMatches.run(m.userId, m.userId);
    },
    getMatches: (userId, limit = 20) => st.matchesByUser.all(userId, limit),

    // ---- skins
    getSkins: (userId) => st.skinsByUser.all(userId),
    hasSkin: (userId, skinId) => !!st.hasSkin.get(userId, skinId),
    grantSkin: (userId, skinId, source, now = Date.now()) => Number(st.grantSkin.run(userId, skinId, source, now).changes) === 1,
    countSkins: (userId) => st.countSkins.get(userId).n,

    // ---- logros
    getAchievements: (userId) => st.achByUser.all(userId),
    grantAchievement: (userId, achId, now = Date.now()) => Number(st.grantAch.run(userId, achId, now).changes) === 1,

    // ---- ajustes
    getSettings(userId) {
      const row = st.settingsByUser.get(userId);
      if (!row) return null;
      try {
        return JSON.parse(row.data);
      } catch {
        return null;
      }
    },
    saveSettings: (userId, data, now = Date.now()) => st.upsertSettings.run(userId, JSON.stringify(data), now),

    // ---- ranking
    leaderboard(metric, limit = 20) {
      return lbStatements(metric).top.all(limit);
    },
    leaderboardRank(metric, userId) {
      const s = lbStatements(metric);
      const mine = s.mine.get(userId);
      if (!mine || !mine.value) return null;
      return { value: mine.value, rank: s.rank.get(mine.value).n + 1 };
    },
  };
}
