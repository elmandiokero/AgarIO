// Minimapa: zona, los 10 primeros y vos.
export class Minimap {
  constructor(canvas, app) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.app = app;
    this.last = 0;
    this.sizeSet = false;
  }

  draw(now) {
    if (now - this.last < 150 || this.canvas.hidden) return;
    this.last = now;
    const app = this.app;
    const st = app.state;
    const c = this.canvas;
    const cssSize = c.clientWidth || 160;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.round(cssSize * dpr);
    if (c.width !== px) {
      c.width = px;
      c.height = px;
    }
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, px, px);
    if (!st.active) return;
    const W = st.world.w, H = st.world.h;
    const k = px / Math.max(W, H);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    // sectores
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1 / k;
    ctx.beginPath();
    for (let i = 1; i < 4; i++) {
      ctx.moveTo((W * i) / 4, 0);
      ctx.lineTo((W * i) / 4, H);
      ctx.moveTo(0, (H * i) / 4);
      ctx.lineTo(W, (H * i) / 4);
    }
    ctx.stroke();
    // zona
    if (st.zone) {
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.arc(st.zone.x, st.zone.y, Math.max(0, st.zone.r), 0, Math.PI * 2, true);
      ctx.fillStyle = 'rgba(213,43,30,0.35)';
      ctx.fill();
      if (st.nextZone) {
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1.5 / k;
        ctx.beginPath();
        ctx.arc(st.nextZone.x, st.nextZone.y, Math.max(0, st.nextZone.r), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // top 10
    const top = app.lb?.top || [];
    for (const p of top) {
      if (p.pid === st.myPid) continue;
      ctx.fillStyle = p.b ? 'rgba(200,210,230,0.75)' : '#8fd3ff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(3 / k, Math.sqrt(p.m) * 10 * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
    // vista actual
    const r = app.renderer;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1 / k;
    ctx.strokeRect(r.camX - r.view.w / 2, r.camY - r.view.h / 2, r.view.w, r.view.h);
    // vos
    if (st.alive) {
      ctx.fillStyle = '#f5c542';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5 / k;
      ctx.beginPath();
      ctx.arc(st.cam.x, st.cam.y, 5 / k, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}
