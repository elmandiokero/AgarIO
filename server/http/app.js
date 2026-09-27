// Aplicación Express: API REST + archivos estáticos del juego.
import path from 'node:path';
import express from 'express';
import { authRoutes } from './routes/auth.js';
import { profileRoutes } from './routes/profile.js';
import { shopRoutes } from './routes/shop.js';
import { leaderboardRoutes } from './routes/leaderboard.js';
import { infoRoutes } from './routes/info.js';
import { HttpError } from './middleware.js';
import { levelProgress } from '../../shared/formulas.js';
import { validateSettings } from '../../shared/settings-schema.js';
import { ROOT } from '../config.js';

const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self' ws: wss:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "font-src 'self' data:",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
].join('; ');

export function createApp({ config, repos, sessions, progression, rooms, getUrls, version, log }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.set('etag', 'strong');

  app.use((_req, res, next) => {
    res.set('Content-Security-Policy', CSP);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  function buildProfile(u, { full = false } = {}) {
    const lp = levelProgress(u.xp);
    const out = {
      id: u.id,
      username: u.username,
      displayName: u.display_name,
      isAdmin: !!u.is_admin,
      xp: u.xp,
      level: lp.level,
      xpInto: lp.into,
      xpNeed: lp.need,
      coins: u.coins,
      equippedSkin: u.equipped_skin,
      createdAt: u.created_at,
    };
    if (full) {
      out.skins = repos.getSkins(u.id).map((s) => s.skin_id);
      out.achievements = repos.getAchievements(u.id).map((a) => ({ id: a.achievement_id, at: a.unlocked_at }));
      out.stats = repos.getStats(u.id);
      out.settings = validateSettings(repos.getSettings(u.id) || {});
    }
    return out;
  }

  function publicStats(u) {
    const lp = levelProgress(u.xp);
    return {
      username: u.username,
      displayName: u.display_name,
      level: lp.level,
      skin: u.equipped_skin,
      createdAt: u.created_at,
      stats: repos.getStats(u.id),
      achievements: repos.getAchievements(u.id).map((a) => a.achievement_id),
    };
  }

  const api = express.Router();
  api.use(express.json({ limit: '16kb' }));
  api.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  if (repos) {
    const deps = { repos, sessions, config, progression, buildProfile, publicStats };
    api.use('/auth', authRoutes(deps));
    api.use(profileRoutes(deps));
    api.use(shopRoutes(deps));
    api.use(leaderboardRoutes(deps));
  }
  api.use(infoRoutes({ config, rooms, getUrls, version }));
  api.use((_req, _res, next) => next(new HttpError(404, 'No encontrado.', 'notfound')));
  app.use('/api', api);

  // Archivos estáticos
  const staticOpts = {
    etag: true,
    lastModified: true,
    setHeaders(res, filePath) {
      if (/\.(svg|png|webp)$/.test(filePath) && /[\\/](skins|icons)[\\/]/.test(filePath)) {
        res.set('Cache-Control', 'public, max-age=3600');
      } else {
        res.set('Cache-Control', 'no-cache');
      }
      if (filePath.endsWith('.webmanifest')) res.type('application/manifest+json');
    },
  };
  app.use('/shared', express.static(path.join(ROOT, 'shared'), staticOpts));
  app.use(express.static(path.join(ROOT, 'public'), staticOpts));

  // Errores
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    let status = err.status || err.statusCode || 500;
    if (err.type === 'entity.parse.failed') status = 400;
    if (err.type === 'entity.too.large') status = 413;
    if (status >= 500) log?.error('Error HTTP:', err.stack || err.message);
    const msg = status >= 500 ? 'Error del servidor. Probá de nuevo.' : err.message || 'Error';
    if (req.path.startsWith('/api')) res.status(status).json({ error: msg, code: err.code || null });
    else res.status(status).type('text/plain').send(msg);
  });

  return app;
}
