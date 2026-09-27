// Perfil, estadísticas, historial y ajustes.
import { Router } from 'express';
import { HttpError, str, authRequired } from '../middleware.js';
import { cleanName, createWordFilter } from '../../../shared/sanitize.js';
import { validateSettings } from '../../../shared/settings-schema.js';

export function profileRoutes({ repos, sessions, config, buildProfile, publicStats }) {
  const r = Router();
  const auth = authRequired(sessions);
  const filter = createWordFilter(config.chat.badWords);

  r.get('/me', auth, (req, res) => {
    res.json({ user: buildProfile(req.user, { full: true }) });
  });

  r.put('/me', auth, (req, res) => {
    const raw = str(req.body, 'displayName', { min: 1, max: 64 });
    const name = cleanName(raw);
    if (!name) throw new HttpError(400, 'Ese nombre no es válido.', 'displayName');
    if (filter.test(name)) throw new HttpError(400, 'Elegí un nombre sin malas palabras 😅', 'badword');
    if (repos.isDisplayTaken(name, req.user.id)) throw new HttpError(409, 'Ese nombre ya lo usa otro jugador.', 'taken');
    repos.setDisplayName(req.user.id, name);
    res.json({ user: buildProfile(repos.getUser(req.user.id), { full: true }) });
  });

  r.get('/stats/:username', (req, res) => {
    const u = repos.getUserByName(String(req.params.username).slice(0, 32));
    if (!u || u.banned) throw new HttpError(404, 'No existe ese jugador.', 'notfound');
    res.json({ player: publicStats(u) });
  });

  r.get('/matches', auth, (req, res) => {
    res.json({ matches: repos.getMatches(req.user.id, 20) });
  });

  r.get('/settings', auth, (req, res) => {
    res.json({ settings: validateSettings(repos.getSettings(req.user.id) || {}) });
  });

  r.put('/settings', auth, (req, res) => {
    const settings = validateSettings(req.body?.settings ?? req.body);
    repos.saveSettings(req.user.id, settings);
    res.json({ settings });
  });

  return r;
}
