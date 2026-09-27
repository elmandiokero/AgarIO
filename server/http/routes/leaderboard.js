// Ranking global.
import { Router } from 'express';
import { authOptional } from '../middleware.js';
import { LEADERBOARD_METRICS } from '../../db/repos.js';
import { levelFromXp } from '../../../shared/formulas.js';

export function leaderboardRoutes({ repos, sessions }) {
  const r = Router();
  r.get('/leaderboard', authOptional(sessions), (req, res) => {
    const metric = Object.prototype.hasOwnProperty.call(LEADERBOARD_METRICS, req.query.by) ? req.query.by : 'xp';
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const rows = repos.leaderboard(metric, limit);
    const top = rows.map((u, i) => ({
      rank: i + 1,
      username: u.username,
      displayName: u.display_name,
      level: levelFromXp(u.xp),
      skin: u.equipped_skin,
      value: u.value,
      you: req.user ? u.id === req.user.id : false,
    }));
    const me = req.user ? repos.leaderboardRank(metric, req.user.id) : null;
    res.json({ metric, label: LEADERBOARD_METRICS[metric].label, metrics: Object.fromEntries(Object.entries(LEADERBOARD_METRICS).map(([k, v]) => [k, v.label])), top, me });
  });
  return r;
}
