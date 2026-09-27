// Información del servidor: URLs para invitar (LAN / Internet), códigos QR y estado.
import { Router } from 'express';
import QRCode from 'qrcode';
import { viaTunnel } from '../../util/client-ip.js';

export function infoRoutes({ config, rooms, getUrls, version }) {
  const r = Router();
  const started = Date.now();

  r.get('/health', (_req, res) => {
    res.json({ ok: true, uptime: Math.round((Date.now() - started) / 1000) });
  });

  r.get('/server-info', (req, res) => {
    const { lan, publicUrl } = getUrls();
    // A los que entran por Internet no les mostramos las IPs de la red de la casa
    const remote = viaTunnel(req);
    res.json({ title: config.title, version, lanUrls: remote ? [] : lan, publicUrl, remote, rooms: rooms.summary() });
  });

  // Sólo codifica las URLs del propio servidor (no es un generador de QR abierto).
  r.get('/qr.svg', async (req, res) => {
    const { lan, publicUrl } = getUrls();
    const target = String(req.query.target || 'lan0');
    let url = null;
    if (target === 'public') url = publicUrl;
    else if (/^lan\d$/.test(target) && !viaTunnel(req)) url = lan[Number(target.slice(3))] || null;
    if (!url) return res.status(404).json({ error: 'No hay URL para ese destino.' });
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b1d3a', light: '#ffffff' } });
    res.type('image/svg+xml').set('Cache-Control', 'no-store').send(svg);
  });

  return r;
}
