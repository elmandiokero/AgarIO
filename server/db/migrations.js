// Migraciones en orden. Nunca modificar una ya publicada: agregar una nueva al final.
export const MIGRATIONS = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    pass_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    banned INTEGER NOT NULL DEFAULT 0,
    xp INTEGER NOT NULL DEFAULT 0,
    coins INTEGER NOT NULL DEFAULT 0,
    equipped_skin TEXT NOT NULL DEFAULT 'bandera',
    created_at INTEGER NOT NULL,
    last_login_at INTEGER
  );
  CREATE INDEX users_display ON users(display_name COLLATE NOCASE);

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    ip TEXT,
    user_agent TEXT
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  CREATE TABLE stats (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    games_played INTEGER NOT NULL DEFAULT 0,
    games_ffa INTEGER NOT NULL DEFAULT 0,
    games_br INTEGER NOT NULL DEFAULT 0,
    deaths INTEGER NOT NULL DEFAULT 0,
    time_alive_ms INTEGER NOT NULL DEFAULT 0,
    longest_life_ms INTEGER NOT NULL DEFAULT 0,
    max_mass INTEGER NOT NULL DEFAULT 0,
    total_mass_gained INTEGER NOT NULL DEFAULT 0,
    food_eaten INTEGER NOT NULL DEFAULT 0,
    cells_eaten INTEGER NOT NULL DEFAULT 0,
    players_eaten INTEGER NOT NULL DEFAULT 0,
    bots_eaten INTEGER NOT NULL DEFAULT 0,
    viruses_popped INTEGER NOT NULL DEFAULT 0,
    splits INTEGER NOT NULL DEFAULT 0,
    ejects INTEGER NOT NULL DEFAULT 0,
    times_top1_ffa INTEGER NOT NULL DEFAULT 0,
    best_rank_ffa INTEGER,
    br_wins INTEGER NOT NULL DEFAULT 0,
    br_top3 INTEGER NOT NULL DEFAULT 0,
    best_br_place INTEGER,
    xp_earned_total INTEGER NOT NULL DEFAULT 0,
    coins_earned_total INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE matches (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode TEXT NOT NULL CHECK (mode IN ('ffa', 'br')),
    started_at INTEGER NOT NULL,
    ended_at INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    max_mass INTEGER NOT NULL,
    final_mass INTEGER NOT NULL,
    kills INTEGER NOT NULL,
    bot_kills INTEGER NOT NULL,
    food_eaten INTEGER NOT NULL,
    best_rank INTEGER,
    br_place INTEGER,
    br_participants INTEGER,
    xp INTEGER NOT NULL,
    coins INTEGER NOT NULL,
    end_reason TEXT,
    killer_name TEXT
  );
  CREATE INDEX matches_user_time ON matches(user_id, ended_at DESC);

  CREATE TABLE user_skins (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    skin_id TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('default', 'shop', 'level', 'achievement', 'admin')),
    acquired_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, skin_id)
  ) WITHOUT ROWID;

  CREATE TABLE user_achievements (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id TEXT NOT NULL,
    unlocked_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, achievement_id)
  ) WITHOUT ROWID;

  CREATE TABLE user_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE coin_ledger (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    ref TEXT,
    at INTEGER NOT NULL
  );
  CREATE INDEX coin_ledger_user ON coin_ledger(user_id, at DESC);
  `,
];
