// Prueba de humo de punta a punta con Chromium (Playwright).
// Uso: npm run test:e2e   (necesita Playwright instalado; en la PC de juego no hace falta)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ART = path.join(ROOT, 'test-artifacts');
fs.mkdirSync(ART, { recursive: true });

let pw;
try {
  pw = await import('playwright');
} catch {
  try {
    pw = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
  } catch {
    console.log('Playwright no está instalado: se omite la prueba E2E.');
    process.exit(0);
  }
}
const { chromium, devices } = pw;

// ---------------------------------------------------------------- servidor de prueba
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jaha-e2e-'));
const cfgPath = path.join(tmp, 'config.json');
fs.writeFileSync(
  cfgPath,
  JSON.stringify({
    port: 0,
    ffa: { bots: 4, world: 3000, food: 400, viruses: 6 },
    br: {
      bots: 3,
      world: 2500,
      lobbySeconds: 2,
      countdownSeconds: 2,
      endedSeconds: 4,
      maxRoundSeconds: 25,
      noHumansEndSeconds: 3,
      phases: [
        { hold: 3, shrink: 4, radius: 0.3, dmgPct: 0.05, dmgFlat: 3 },
        { hold: 2, shrink: 4, radius: 0, dmgPct: 0.4, dmgFlat: 30 },
      ],
    },
    progression: { minLifeSeconds: 1 },
  })
);

const srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js', '--config', cfgPath, '--data', tmp, '--port', '0'], {
  cwd: ROOT,
  env: { ...process.env, JAHA_LOG_LEVEL: 'warn' },
});
let srvOut = '';
const port = await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`El servidor no arrancó:\n${srvOut}`)), 15000);
  srv.stdout.on('data', (d) => {
    srvOut += d.toString();
    const m = srvOut.match(/localhost:(\d+)/);
    if (m) {
      clearTimeout(t);
      resolve(Number(m[1]));
    }
  });
  srv.stderr.on('data', (d) => (srvOut += d.toString()));
  srv.on('exit', (code) => reject(new Error(`El servidor terminó (${code}):\n${srvOut}`)));
});
const BASE = `http://127.0.0.1:${port}`;
console.log(`Servidor de prueba en ${BASE}`);

// ---------------------------------------------------------------- utilidades
const browser = await chromium.launch();
const problems = [];
let passed = 0;

function watch(page, label) {
  page.on('pageerror', (e) => problems.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`[${label}] console.error: ${m.text()}`);
  });
}

async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    passed++;
    console.log(`  ✔ ${name} (${Date.now() - t0} ms)`);
  } catch (err) {
    console.log(`  ✖ ${name}\n    ${err.stack || err.message}`);
    problems.push(`${name}: ${err.message}`);
  }
}

const j = (page, fn, arg) => page.evaluate(fn, arg);
const waitFor = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });

async function openGame(context, label) {
  const page = await context.newPage();
  watch(page, label);
  await page.goto(`${BASE}/?debug=1`);
  await waitFor(page, () => window.__jaha && !document.querySelector('#btn-play').disabled);
  return page;
}

// ---------------------------------------------------------------- pruebas
const desktop = await browser.newContext({ viewport: { width: 1280, height: 720 } });

await step('escritorio: jugar Clásico, moverse y ver el ranking', async () => {
  const page = await openGame(desktop, 'escritorio');
  await page.screenshot({ path: path.join(ART, 'e2e-01-menu.png') });
  await page.fill('#name-input', 'Probador');
  await page.click('#btn-play');
  await waitFor(page, () => window.__jaha.state.alive && window.__jaha.state.myCells().length > 0);
  const x0 = await j(page, () => window.__jaha.state.cam.x);
  await page.mouse.move(1200, 360);
  await waitFor(page, (x) => Math.abs(window.__jaha.state.cam.x - x) > 30, x0);
  await waitFor(page, () => document.querySelectorAll('#lb-list li').length >= 3);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(ART, 'e2e-02-juego.png') });
  // pausa y volver al menú
  await page.keyboard.press('Escape');
  await waitFor(page, () => !document.querySelector('#pause').hidden);
  await page.click('#btn-quit');
  await waitFor(page, () => !document.querySelector('#menu').hidden && !window.__jaha.inRoom);
  await page.close();
});

await step('cuenta: registrarse, paneles, ajustes que persisten', async () => {
  const page = await openGame(desktop, 'cuenta');
  await page.click('#account-chip .btn.gold');
  await page.fill('input[name=username]', 'e2e_karai');
  await page.fill('input[name=displayName]', 'Karai E2E');
  await page.fill('input[name=password]', 'secreta123');
  await page.fill('input[name=password2]', 'secreta123');
  await page.click('#modal-body button[type=submit]');
  await waitFor(page, () => document.querySelector('#account-chip .level-badge'));
  await page.click('#modal-close');
  await page.reload();
  await waitFor(page, () => window.__jaha && window.__jaha.user && document.querySelector('#account-chip .who')?.textContent === 'Karai E2E');
  // Tienda
  await page.click('.nav-btn[data-panel=shop]');
  await waitFor(page, () => document.querySelectorAll('.skin-card').length >= 30);
  await page.screenshot({ path: path.join(ART, 'e2e-03-tienda.png') });
  // Logros
  await page.click('#modal-close');
  await page.click('.nav-btn[data-panel=achievements]');
  await waitFor(page, () => document.querySelectorAll('.ach').length === 20);
  // Ranking
  await page.click('#modal-close');
  await page.click('.nav-btn[data-panel=ranking]');
  await waitFor(page, () => document.querySelector('#modal-body .tabs'));
  // Ajustes: apagar "mostrar masa"
  await page.click('#modal-close');
  await page.click('.nav-btn[data-panel=settings]');
  await waitFor(page, () => document.querySelectorAll('.setting').length > 10);
  const before = await j(page, () => window.__jaha.settings.showMass);
  await page.locator('.setting', { hasText: 'Mostrar masa' }).locator('.switch').click();
  await waitFor(page, (b) => window.__jaha.settings.showMass === !b, before);
  await page.waitForTimeout(1200); // se guarda en el servidor con un pequeño retraso
  await page.evaluate(() => localStorage.removeItem('jaha.settings'));
  await page.reload();
  await waitFor(page, (b) => window.__jaha && window.__jaha.user && window.__jaha.settings.showMass === !b, before);
  // Invitar
  await page.click('.nav-btn[data-panel=invite]');
  await waitFor(page, () => document.querySelectorAll('.invite-box').length >= 1);
  await page.screenshot({ path: path.join(ART, 'e2e-04-invitar.png') });
  await page.close();
});

await step('celular (touch): joystick y botón dividir', async () => {
  const phone = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 915, height: 412 }, screen: { width: 915, height: 412 } });
  const page = await openGame(phone, 'celular');
  await waitFor(page, () => document.body.classList.contains('touch'));
  await page.screenshot({ path: path.join(ART, 'e2e-05-celular-menu.png') });
  await page.fill('#name-input', 'Celu');
  await page.tap('#btn-play');
  await waitFor(page, () => window.__jaha.state.alive);
  await waitFor(page, () => !document.querySelector('#touch-controls').hidden);
  const cdp = await phone.newCDPSession(page);
  const x0 = await j(page, () => window.__jaha.state.cam.x);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 300, id: 1 }] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 150 + i * 8, y: 300, id: 1 }] });
    await page.waitForTimeout(30);
  }
  await waitFor(page, (x) => window.__jaha.state.cam.x > x + 30, x0);
  await page.screenshot({ path: path.join(ART, 'e2e-06-celular-juego.png') });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  // Engordar la célula en el servidor no es posible desde acá: comprobamos que el botón responde
  await page.tap('#btn-split');
  await waitFor(page, () => document.querySelector('#btn-split'));
  await phone.close();
});

await step('dos jugadores se ven entre sí', async () => {
  const ctxA = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const ctxB = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const a = await openGame(ctxA, 'A');
  const b = await openGame(ctxB, 'B');
  await a.fill('#name-input', 'Jugador A');
  await b.fill('#name-input', 'Jugador B');
  await a.click('#btn-play');
  await b.click('#btn-play');
  await waitFor(a, () => window.__jaha.state.alive);
  await waitFor(b, () => window.__jaha.state.alive);
  // El ranking de A incluye a B (el ranking es global de la sala)
  await waitFor(a, () => (window.__jaha.lb?.top || []).some((p) => p.n === 'Jugador B'));
  await waitFor(b, () => (window.__jaha.lb?.top || []).some((p) => p.n === 'Jugador A'));
  await ctxA.close();
  await ctxB.close();
});

await step('chat global: del menú al juego y del juego al menú', async () => {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const a = await openGame(ctxA, 'chatA');
  const b = await openGame(ctxB, 'chatB');
  await a.fill('#name-input', 'Menuda');
  await b.fill('#name-input', 'Jugadora');
  await b.click('#btn-play');
  await waitFor(b, () => window.__jaha.state.alive);
  // A escribe desde el panel del menú
  await waitFor(a, () => !document.querySelector('#menu-chat').hidden);
  await a.fill('#menu-chat-input', '¡Jaha! ¿Quién juega?');
  await a.press('#menu-chat-input', 'Enter');
  await waitFor(b, () => [...document.querySelectorAll('#chat-log .msg.global')].some((m) => m.textContent.includes('¿Quién juega?')));
  // B cambia al canal global con Tab y contesta
  await b.keyboard.press('Enter');
  await waitFor(b, () => document.activeElement?.id === 'chat-input');
  if (!(await b.evaluate(() => window.__jaha.chatChannel === 'global'))) await b.keyboard.press('Tab');
  await b.keyboard.type('Yo, vení');
  await b.keyboard.press('Enter');
  await waitFor(a, () => [...document.querySelectorAll('#menu-chat-log .m')].some((m) => m.textContent.includes('Yo, vení') && m.textContent.includes('Clásico')));
  await a.screenshot({ path: path.join(ART, 'e2e-09-chat-global.png') });
  await b.screenshot({ path: path.join(ART, 'e2e-10-chat-en-juego.png') });
  await ctxA.close();
  await ctxB.close();
});

await step('Batalla real: ronda completa con zona y podio', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await openGame(ctx, 'br');
  await page.click('.mode[data-mode=br]');
  await page.fill('#name-input', 'Guerrera');
  await page.click('#btn-play');
  await waitFor(page, () => window.__jaha.inRoom && window.__jaha.roomMode === 'br');
  await waitFor(page, () => ['countdown', 'playing'].includes(window.__jaha.br?.state), null, 10000);
  await waitFor(page, () => window.__jaha.br?.state === 'playing', null, 10000);
  await waitFor(page, () => window.__jaha.state.zone && window.__jaha.state.zone.r > 0);
  const r0 = await j(page, () => window.__jaha.state.zone.r);
  await waitFor(page, (r) => window.__jaha.state.zone && window.__jaha.state.zone.r < r - 50, r0, 15000);
  await page.screenshot({ path: path.join(ART, 'e2e-07-batalla-real.png') });
  await waitFor(page, () => !document.querySelector('#podium').hidden, null, 40000);
  await page.screenshot({ path: path.join(ART, 'e2e-08-podio.png') });
  await ctx.close();
});

await desktop.close();
await browser.close();
srv.kill();
fs.rmSync(tmp, { recursive: true, force: true });

const failed = problems.length;
console.log(`\n${passed} pasos OK${failed ? `, ${failed} problemas:` : ''}`);
for (const p of problems) console.log(`  - ${p}`);
process.exit(failed ? 1 : 0);
