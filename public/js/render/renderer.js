// Dibujo del juego en Canvas 2D.
import { ET, PF, FOOD_PALETTE } from '/shared/constants.js';
import { viewSize, clamp } from '/shared/formulas.js';
import { SkinCache } from './skins.js';

const THEMES = {
  dark: { bg: '#0f1829', outside: '#070b14', grid: 'rgba(255,255,255,0.055)', border: '#d52b1e', zone: 'rgba(213,43,30,0.20)' },
  light: { bg: '#f5f7fb', outside: '#d9e0ea', grid: 'rgba(10,30,60,0.08)', border: '#d52b1e', zone: 'rgba(213,43,30,0.16)' },
  tierra: { bg: '#5b2817', outside: '#34150b', grid: 'rgba(255,214,170,0.07)', border: '#f5c542', zone: 'rgba(0,0,0,0.28)' },
};

const TAU = Math.PI * 2;

export class Renderer {
  constructor(canvas, app) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.app = app;
    this.skins = new SkinCache();
    this.cssW = 1;
    this.cssH = 1;
    this.dpr = 1;
    this.zoom = 0.6;
    this.zoomInit = false;
    this.scale = 1;
    this.view = { w: 1600, h: 900 };
    this.camX = 0;
    this.camY = 0;
    this.fps = 60;
    this.frames = 0;
    this.fpsT = performance.now();
    this.lowFpsSince = null;
    this.autoLow = false;
    this.colorCache = new Map();
    this.attract = null;
    this.foodBuckets = FOOD_PALETTE.map(() => []);
    this.drawList = [];
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  quality() {
    const q = this.app.settings.quality;
    if (q === 'auto') return this.autoLow ? 'low' : 'high';
    return q;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const q = this.quality();
    const maxDpr = q === 'high' ? 2 : q === 'medium' ? 1.5 : 1;
    this.dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    this.cssW = w;
    this.cssH = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.attract = null;
  }

  get aspect() {
    return this.cssW / Math.max(1, this.cssH);
  }

  colors(hue) {
    let c = this.colorCache.get(hue);
    if (!c) {
      const deg = Math.round((hue / 256) * 360);
      c = { fill: `hsl(${deg},72%,54%)`, stroke: `hsl(${deg},70%,36%)` };
      this.colorCache.set(hue, c);
    }
    return c;
  }

  /** Convierte coordenadas de pantalla (CSS px) a delta en el mundo respecto del centro. */
  screenToWorldDelta(sx, sy) {
    return { dx: (sx - this.cssW / 2) / this.scale, dy: (sy - this.cssH / 2) / this.scale };
  }

  trackFps(now) {
    this.frames++;
    if (now - this.fpsT >= 1000) {
      this.fps = Math.round((this.frames * 1000) / (now - this.fpsT));
      this.frames = 0;
      this.fpsT = now;
      if (this.app.settings.quality === 'auto') {
        if (this.fps < 45) {
          this.lowFpsSince ??= now;
          if (!this.autoLow && now - this.lowFpsSince > 3000) {
            this.autoLow = true;
            this.resize();
          }
        } else {
          this.lowFpsSince = null;
        }
      }
    }
  }

  frame(now, dt) {
    this.trackFps(now);
    const st = this.app.state;
    const settings = this.app.settings;
    const theme = THEMES[settings.theme] || THEMES.dark;
    const ctx = this.ctx;
    if (!st.active || !this.app.inRoom) {
      this.drawAttract(now, dt, theme);
      return;
    }
    st.interpolate(now);

    const targetZoom = st.cam.r || 0.5;
    if (!this.zoomInit) {
      this.zoom = targetZoom;
      this.zoomInit = true;
    } else {
      this.zoom += (targetZoom - this.zoom) * Math.min(1, (dt / 1000) * 4);
    }
    this.camX = st.cam.x;
    this.camY = st.cam.y;
    this.view = viewSize(this.zoom, this.aspect);
    this.scale = this.cssW / this.view.w;
    const s = this.scale * this.dpr;
    const W = this.canvas.width;
    const H = this.canvas.height;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = theme.outside;
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(s, 0, 0, s, W / 2 - this.camX * s, H / 2 - this.camY * s);

    const hw = this.view.w / 2 + 50;
    const hh = this.view.h / 2 + 50;
    const x0 = this.camX - hw, x1 = this.camX + hw, y0 = this.camY - hh, y1 = this.camY + hh;
    const px = 1 / this.scale; // un píxel en unidades del mundo
    const low = this.quality() === 'low';

    // Fondo del mapa
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, st.world.w, st.world.h);
    if (settings.showGrid) this.drawGrid(ctx, theme, x0, y0, x1, y1, st.world, px);
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 6 * px;
    ctx.strokeRect(0, 0, st.world.w, st.world.h);

    // Comida, agrupada por color
    const buckets = this.foodBuckets;
    for (const b of buckets) b.length = 0;
    const list = this.drawList;
    list.length = 0;
    let mine = 0;
    for (const e of st.entities.values()) {
      if (e.type === ET.CELL && e.pid === st.myPid) mine++;
      if (e.x + e.r < x0 || e.x - e.r > x1 || e.y + e.r < y0 || e.y - e.r > y1) continue;
      if (e.type === ET.FOOD) buckets[e.color % buckets.length].push(e);
      else list.push(e);
    }
    st.myCellsCount = mine;
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      if (!b.length) continue;
      ctx.fillStyle = FOOD_PALETTE[i];
      ctx.beginPath();
      for (const f of b) {
        const k = Math.max(0, Math.min(1, (now - f.born) / 180));
        const r = f.r * k;
        ctx.moveTo(f.x + r, f.y);
        ctx.arc(f.x, f.y, r, 0, TAU);
      }
      ctx.fill();
    }
    if (!low && this.scale > 0.35) {
      // agujerito de chipa
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      for (const b of buckets) {
        for (const f of b) {
          const r = f.r * 0.32 * Math.max(0, Math.min(1, (now - f.born) / 180));
          ctx.moveTo(f.x + r, f.y);
          ctx.arc(f.x, f.y, r, 0, TAU);
        }
      }
      ctx.fill();
    }

    // Animaciones de "comido"
    for (const d of st.dying) {
      const r = d.r * (1 - Math.max(0, d.k || 0));
      if (r <= 0.5) continue;
      if (d.e.type === ET.FOOD) ctx.fillStyle = FOOD_PALETTE[d.e.color % FOOD_PALETTE.length];
      else if (d.e.type === ET.CELL) ctx.fillStyle = this.colors(st.players.get(d.e.pid)?.hue ?? 0).fill;
      else if (d.e.type === ET.EJECT) ctx.fillStyle = this.colors(d.e.hue).fill;
      else ctx.fillStyle = '#3aa655';
      ctx.globalAlpha = 1 - d.k * 0.5;
      ctx.beginPath();
      ctx.arc(d.x, d.y, r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Células, expulsiones y cactus (de menor a mayor)
    list.sort((a, b) => a.r - b.r);
    const cactus = this.skins.getRaw('__cactus', '/skins/cactus.svg');
    for (const e of list) {
      if (e.type === ET.EJECT) {
        const c = this.colors(e.hue);
        ctx.fillStyle = c.fill;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, TAU);
        ctx.fill();
        ctx.lineWidth = Math.max(e.r * 0.12, px);
        ctx.strokeStyle = c.stroke;
        ctx.stroke();
      } else if (e.type === ET.VIRUS) {
        this.drawCactus(ctx, e, cactus, px, now);
      } else if (e.type === ET.CELL) {
        this.drawCell(ctx, e, st, settings, px, low);
      }
    }

    // Zona de Batalla real
    if (st.zone) this.drawZone(ctx, st, theme, px, now);

    // Nombres y masa arriba de todo
    if (settings.showNames || settings.showMass) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      for (const e of list) if (e.type === ET.CELL) this.drawLabel(ctx, e, st, settings, px);
    }
  }

  drawGrid(ctx, theme, x0, y0, x1, y1, world, px) {
    const step = this.scale < 0.4 ? 100 : 50;
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = px;
    ctx.beginPath();
    const sx = Math.max(0, Math.floor(x0 / step) * step);
    const ex = Math.min(world.w, x1);
    const sy = Math.max(0, Math.floor(y0 / step) * step);
    const ey = Math.min(world.h, y1);
    for (let x = sx; x <= ex; x += step) {
      ctx.moveTo(x, Math.max(0, y0));
      ctx.lineTo(x, Math.min(world.h, y1));
    }
    for (let y = sy; y <= ey; y += step) {
      ctx.moveTo(Math.max(0, x0), y);
      ctx.lineTo(Math.min(world.w, x1), y);
    }
    ctx.stroke();
  }

  drawCell(ctx, e, st, settings, px, low) {
    const p = st.players.get(e.pid);
    const c = this.colors(p ? p.hue : 0);
    const r = e.r;
    ctx.fillStyle = c.fill;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, 0, TAU);
    ctx.fill();
    const onScreen = r * this.scale;
    if (settings.showSkins && p && p.skin && !(low && onScreen < 14)) {
      const img = this.skins.get(p.skin);
      if (img) ctx.drawImage(img, e.x - r, e.y - r, r * 2, r * 2);
    }
    ctx.lineWidth = Math.max(r * 0.06, 2 * px);
    ctx.strokeStyle = c.stroke;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r - ctx.lineWidth / 2, 0, TAU);
    ctx.stroke();
    if (e.pid === st.myPid && this.app.shieldUntil > performance.now()) {
      // escudo de aparición
      ctx.lineWidth = 3 * px;
      ctx.strokeStyle = `rgba(143,211,255,${0.55 + Math.sin(performance.now() / 120) * 0.35})`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r + 6 * px, 0, TAU);
      ctx.stroke();
    } else if (e.pid === st.myPid && st.myCellsCount > 1 && onScreen > 20) {
      // marcar las propias cuando hay varias
      ctx.lineWidth = 2 * px;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.stroke();
    }
  }

  drawLabel(ctx, e, st, settings, px) {
    const p = st.players.get(e.pid);
    const r = e.r;
    const size = Math.max(r * 0.3, 12 * px);
    if (size / px < 7) return;
    let y = e.y;
    const showName = settings.showNames && p && p.name;
    const showMass = settings.showMass && (e.pid === st.myPid || r * this.scale > 26);
    if (showName && showMass) y -= size * 0.25;
    if (showName) {
      ctx.font = `800 ${size}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
      ctx.lineWidth = Math.max(size * 0.14, 1.5 * px);
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.fillStyle = '#fff';
      ctx.strokeText(p.name, e.x, y);
      ctx.fillText(p.name, e.x, y);
      if (settings.showBotTag && this.app.showBotTag !== false && p.flags & PF.BOT && size / px > 10) {
        ctx.font = `700 ${size * 0.4}px system-ui, sans-serif`;
        ctx.lineWidth = Math.max(size * 0.06, px);
        ctx.strokeText('BOT', e.x, y - size * 0.72);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillText('BOT', e.x, y - size * 0.72);
      }
    }
    if (showMass) {
      const m = Math.round((r / 10) * (r / 10));
      const ms = size * (showName ? 0.55 : 0.8);
      if (ms / px < 6) return;
      ctx.font = `700 ${ms}px system-ui, sans-serif`;
      ctx.lineWidth = Math.max(ms * 0.14, px);
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.fillStyle = '#fff';
      const my = showName ? y + size * 0.72 : y;
      ctx.strokeText(String(m), e.x, my);
      ctx.fillText(String(m), e.x, my);
    }
  }

  drawCactus(ctx, e, img, px, now) {
    const r = e.r;
    if (img) {
      const k = 1.18;
      const wob = 1 + Math.sin(now / 400 + e.id) * 0.015;
      ctx.drawImage(img, e.x - r * k * wob, e.y - r * k * wob, r * 2 * k * wob, r * 2 * k * wob);
      return;
    }
    const spikes = 20;
    ctx.fillStyle = '#2f9e44';
    ctx.strokeStyle = '#1b5e20';
    ctx.lineWidth = Math.max(r * 0.05, px);
    ctx.beginPath();
    for (let i = 0; i <= spikes * 2; i++) {
      const a = (i / (spikes * 2)) * TAU;
      const rr = i % 2 === 0 ? r * 1.12 : r * 0.92;
      const x = e.x + Math.cos(a) * rr;
      const y = e.y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  drawZone(ctx, st, theme, px, now) {
    const z = st.zone;
    const W = st.world.w, H = st.world.h;
    ctx.beginPath();
    ctx.rect(-W, -H, W * 3, H * 3);
    ctx.arc(z.x, z.y, Math.max(0, z.r), 0, TAU, true);
    ctx.fillStyle = theme.zone;
    ctx.fill();
    ctx.lineWidth = 5 * px;
    ctx.strokeStyle = `rgba(255,74,61,${0.75 + Math.sin(now / 250) * 0.2})`;
    ctx.beginPath();
    ctx.arc(z.x, z.y, Math.max(0, z.r), 0, TAU);
    ctx.stroke();
    const n = st.nextZone;
    if (n && n.r < z.r - 1) {
      ctx.setLineDash([18 * px, 12 * px]);
      ctx.lineWidth = 3 * px;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(n.x, n.y, Math.max(0, n.r), 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /** Fondo animado del menú. */
  drawAttract(now, dt, theme) {
    const ctx = this.ctx;
    const W = this.cssW, H = this.cssH;
    if (!this.attract) {
      const blobs = [];
      const skins = ['bandera', 'chipa', 'pelota', 'terere', 'jaguarete', 'mburucuya', 'carpincho', 'mate', 'lapacho', 'nanduti'];
      const n = Math.round(Math.min(60, (W * H) / 16000));
      for (let i = 0; i < n; i++) {
        const big = Math.random() < 0.18;
        blobs.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r: big ? 26 + Math.random() * 40 : 4 + Math.random() * 5,
          vx: (Math.random() - 0.5) * 30,
          vy: (Math.random() - 0.5) * 30,
          hue: Math.floor(Math.random() * 256),
          color: FOOD_PALETTE[i % FOOD_PALETTE.length],
          skin: big ? skins[i % skins.length] : null,
        });
      }
      this.attract = blobs;
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const off = (now / 60) % 40;
    for (let x = -off; x < W; x += 40) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
    }
    for (let y = -off; y < H; y += 40) {
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
    ctx.stroke();
    const k = Math.min(0.05, dt / 1000);
    for (const b of this.attract) {
      b.x += b.vx * k;
      b.y += b.vy * k;
      if (b.x < -80) b.x = W + 80;
      if (b.x > W + 80) b.x = -80;
      if (b.y < -80) b.y = H + 80;
      if (b.y > H + 80) b.y = -80;
      if (b.skin) {
        const c = this.colors(b.hue);
        ctx.fillStyle = c.fill;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, TAU);
        ctx.fill();
        const img = this.skins.get(b.skin);
        if (img) ctx.drawImage(img, b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
        ctx.lineWidth = Math.max(2, b.r * 0.06);
        ctx.strokeStyle = c.stroke;
        ctx.stroke();
      } else {
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, TAU);
        ctx.fill();
      }
    }
  }

  resetCamera() {
    this.zoomInit = false;
  }

  /** Radio de pantalla para el joystick → delta en el mundo. */
  get halfView() {
    return { w: this.view.w / 2, h: this.view.h / 2 };
  }
}

export { clamp };
