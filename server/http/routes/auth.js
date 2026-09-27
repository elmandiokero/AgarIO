// Registro, inicio de sesión, cierre de sesión y cambio de contraseña.
import { Router } from 'express';
import { HttpError, str, limiter, authRequired, bearer } from '../middleware.js';
import { hashPassword, verifyPassword, dummyVerify } from '../../auth/passwords.js';
import { clientIp } from '../../util/client-ip.js';
import { USERNAME_RE, cleanName, createWordFilter } from '../../../shared/sanitize.js';
import { LIMITS } from '../../../shared/constants.js';
import { FREE_SKINS, DEFAULT_SKIN } from '../../../shared/catalog/skins.js';

export function authRoutes({ repos, sessions, config, buildProfile }) {
  const r = Router();
  const filter = createWordFilter(config.chat.badWords);

  r.post('/register', limiter(5 / 3600, 5), async (req, res) => {
    const username = str(req.body, 'username', { min: LIMITS.USERNAME_MIN, max: LIMITS.USERNAME_MAX }).trim();
    const password = str(req.body, 'password', { min: LIMITS.PASSWORD_MIN, max: LIMITS.PASSWORD_MAX });
    const rawDisplay = str(req.body, 'displayName', { max: 64, required: false });
    if (!USERNAME_RE.test(username)) {
      throw new HttpError(400, 'El usuario sólo puede tener letras, números, punto, guion y guion bajo (3 a 16).', 'username');
    }
    const displayName = cleanName(rawDisplay || username);
    if (!displayName) throw new HttpError(400, 'El nombre para mostrar no es válido.', 'displayName');
    if (filter.test(username) || filter.test(displayName)) throw new HttpError(400, 'Elegí un nombre sin malas palabras 😅', 'badword');
    if (repos.getUserByName(username)) throw new HttpError(409, 'Ese usuario ya existe.', 'taken');
    if (repos.isDisplayTaken(displayName, 0)) throw new HttpError(409, 'Ese nombre ya lo usa otro jugador.', 'taken');
    const passHash = await hashPassword(password);
    const isAdmin = config.admins.includes(username.toLowerCase());
    let id;
    try {
      id = repos.createUser({
        username, displayName, passHash, isAdmin, coins: config.progression.startingCoins, skin: DEFAULT_SKIN, freeSkins: FREE_SKINS,
      });
    } catch (err) {
      if (/UNIQUE/i.test(err.message)) throw new HttpError(409, 'Ese usuario ya existe.', 'taken');
      throw err;
    }
    if (config.progression.startingCoins) repos.ledger(id, config.progression.startingCoins, 'bienvenida');
    const token = sessions.issue(id, { ip: clientIp(req), userAgent: req.headers['user-agent'] });
    res.status(201).json({ token, user: buildProfile(repos.getUser(id)) });
  });

  const loginLimiter = limiter(10 / 900, 10, (req) => `${clientIp(req)}|${String(req.body?.username || '').toLowerCase()}`);
  r.post('/login', loginLimiter, async (req, res) => {
    const username = str(req.body, 'username', { min: 1, max: 64 }).trim();
    const password = str(req.body, 'password', { min: 1, max: LIMITS.PASSWORD_MAX });
    const user = repos.getUserByName(username);
    const ok = user ? await verifyPassword(password, user.pass_hash) : await dummyVerify(password);
    if (!ok) throw new HttpError(401, 'Usuario o contraseña incorrectos.', 'login');
    if (user.banned) throw new HttpError(403, 'Esta cuenta está suspendida.', 'banned');
    repos.setLastLogin(user.id);
    const token = sessions.issue(user.id, { ip: clientIp(req), userAgent: req.headers['user-agent'] });
    res.json({ token, user: buildProfile(repos.getUser(user.id)) });
  });

  r.post('/logout', (req, res) => {
    const token = bearer(req);
    if (token) sessions.revoke(token);
    res.json({ ok: true });
  });

  r.post('/password', authRequired(sessions), limiter(5 / 900, 5), async (req, res) => {
    const current = str(req.body, 'current', { min: 1, max: LIMITS.PASSWORD_MAX });
    const next = str(req.body, 'next', { min: LIMITS.PASSWORD_MIN, max: LIMITS.PASSWORD_MAX });
    const user = repos.getUser(req.user.id);
    if (!(await verifyPassword(current, user.pass_hash))) throw new HttpError(401, 'La contraseña actual no es correcta.', 'login');
    repos.setPassword(user.id, await hashPassword(next));
    sessions.revokeAll(user.id);
    const token = sessions.issue(user.id, { ip: clientIp(req), userAgent: req.headers['user-agent'] });
    res.json({ ok: true, token });
  });

  return r;
}
