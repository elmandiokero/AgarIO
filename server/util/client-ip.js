// IP real del cliente. Las conexiones que vienen por el túnel de Cloudflare llegan desde
// localhost, así que sólo en ese caso confiamos en CF-Connecting-IP / X-Forwarded-For.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function isLoopback(addr) {
  return LOOPBACK.has(addr);
}

export function clientIp(req) {
  const remote = req.socket?.remoteAddress || '';
  if (isLoopback(remote)) {
    const cf = req.headers['cf-connecting-ip'];
    if (typeof cf === 'string' && cf.length < 64) return cf.trim();
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length < 256) return xff.split(',')[0].trim();
  }
  return remote.replace(/^::ffff:/, '');
}

/** true si la petición viene por el túnel (Internet) y no por la red local. */
export function viaTunnel(req) {
  const remote = req.socket?.remoteAddress || '';
  return isLoopback(remote) && typeof req.headers['cf-connecting-ip'] === 'string';
}
