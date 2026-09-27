// Middlewares: autenticación por token Bearer y límites de tasa.
import { KeyedLimiter } from '../util/rate-limit.js';
import { clientIp } from '../util/client-ip.js';

export class HttpError extends Error {
  constructor(status, message, code = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function bearer(req) {
  const h = req.headers.authorization;
  if (typeof h !== 'string' || !h.startsWith('Bearer ')) return null;
  return h.slice(7).trim();
}

export function authOptional(sessions) {
  return (req, _res, next) => {
    const token = bearer(req);
    req.token = token;
    req.user = token ? sessions.resolve(token) : null;
    next();
  };
}

export function authRequired(sessions) {
  return (req, _res, next) => {
    const token = bearer(req);
    const user = token ? sessions.resolve(token) : null;
    if (!user) return next(new HttpError(401, 'Tenés que iniciar sesión.', 'auth'));
    req.token = token;
    req.user = user;
    next();
  };
}

/** Limita peticiones por IP (o por la clave que devuelva keyFn). */
export function limiter(ratePerSec, burst, keyFn = null) {
  const lim = new KeyedLimiter(ratePerSec, burst);
  return (req, _res, next) => {
    const key = keyFn ? keyFn(req) : clientIp(req);
    if (!lim.take(key)) return next(new HttpError(429, 'Demasiados intentos. Esperá un ratito y probá de nuevo.', 'rate'));
    next();
  };
}

/** Lee un string del body con validación de tipo y largo. */
export function str(body, key, { min = 0, max = 200, required = true } = {}) {
  const v = body?.[key];
  if (v === undefined || v === null || v === '') {
    if (required) throw new HttpError(400, `Falta el campo "${key}".`, 'field');
    return '';
  }
  if (typeof v !== 'string') throw new HttpError(400, `El campo "${key}" no es válido.`, 'field');
  if (v.length < min || v.length > max) throw new HttpError(400, `El campo "${key}" debe tener entre ${min} y ${max} caracteres.`, 'field');
  return v;
}
