// Sesiones con token aleatorio. En la base sólo se guarda el sha256 del token.
import crypto from 'node:crypto';

const DAY = 24 * 60 * 60 * 1000;
export const SESSION_TTL = 90 * DAY;

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createSessionService(repos, clock = { now: () => Date.now() }) {
  let lastCleanup = 0;
  return {
    issue(userId, { ip = null, userAgent = null } = {}) {
      const token = crypto.randomBytes(32).toString('base64url');
      const now = clock.now();
      repos.insertSession(hashToken(token), userId, now, now + SESSION_TTL, ip, userAgent ? String(userAgent).slice(0, 200) : null);
      return token;
    },
    /** Devuelve el usuario de un token válido, o null. */
    resolve(token) {
      if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
      const now = clock.now();
      if (now - lastCleanup > DAY) {
        lastCleanup = now;
        repos.deleteExpiredSessions(now);
      }
      const hash = hashToken(token);
      const s = repos.getSession(hash);
      if (!s || s.expires_at < now) return null;
      const user = repos.getUser(s.user_id);
      if (!user || user.banned) return null;
      // Renovar como máximo una vez por hora
      if (now - s.last_seen_at > 60 * 60 * 1000) repos.touchSession(hash, now, now + SESSION_TTL);
      return user;
    },
    revoke(token) {
      if (typeof token === 'string') repos.deleteSession(hashToken(token));
    },
    revokeAll(userId) {
      repos.deleteUserSessions(userId);
    },
  };
}
