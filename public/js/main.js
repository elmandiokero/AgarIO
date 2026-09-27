// Jaha.io — controlador principal del cliente.
import { api } from './api.js';
import { Net } from './net.js';
import { GameState } from './state.js';
import { Sfx } from './audio.js';
import { Renderer } from './render/renderer.js';
import { Minimap } from './render/minimap.js';
import { setupDesktopInput } from './input/desktop.js';
import { setupTouchInput } from './input/touch.js';
import { Hud } from './ui/hud.js';
import { Screens } from './ui/screens.js';
import { Menu } from './ui/menu.js';
import { PANELS } from './ui/panels.js';
import { $, toast, clear } from './ui/dom.js';
import { loadLocalSettings, saveLocalSettings, applySettingsToDom, storageGet, storageSet } from './settings-store.js';
import { validateSettings } from '/shared/settings-schema.js';
import { SKIN_MAP, FREE_SKINS, DEFAULT_SKIN } from '/shared/catalog/skins.js';
import { formatGs, levelProgress } from '/shared/formulas.js';
import { PHRASES, pick } from './i18n.js';

function sessionGet(k) {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
}
function sessionSet(k, v) {
  try {
    if (v) sessionStorage.setItem(k, v);
    else sessionStorage.removeItem(k);
  } catch {
    /* ignorar */
  }
}

class App {
  constructor() {
    this.settings = loadLocalSettings();
    this.user = null;
    this.rooms = null;
    this.mode = storageGet('jaha.mode', 'ffa') === 'br' ? 'br' : 'ffa';
    this.state = new GameState();
    this.net = new Net();
    this.sfx = new Sfx();
    this.inRoom = false;
    this.roomMode = null;
    this.dead = false;
    this.spectating = false;
    this.paused = false;
    this.chatOpen = false;
    this.touchMode = false;
    this.lb = null;
    this.br = null;
    this.prevBrState = null;
    this.lastBrResult = null;
    this.showBotTag = true;
    this.resumeKey = sessionGet('jaha.resume');
    this.awaitingResume = false;
    this.lastFrame = performance.now();
    this.modalClose = null;

    this.renderer = new Renderer($('#game'), this);
    this.minimap = new Minimap($('#minimap'), this);
    this.hud = new Hud(this);
    this.screens = new Screens(this);
    this.menu = new Menu(this);
    setupDesktopInput(this);
    setupTouchInput(this);
    applySettingsToDom(this.settings);
    this.sfx.setVolume(this.settings.volume);

    $('#modal-close').addEventListener('click', () => this.closeModal());
    $('#modal').addEventListener('click', (ev) => {
      if (ev.target.id === 'modal') this.closeModal();
    });
    $('#btn-rotate-ok').addEventListener('click', () => {
      sessionSet('jaha.rotateOk', '1');
      this.checkRotate();
    });
    window.addEventListener('resize', () => {
      clearTimeout(this.viewTimer);
      this.viewTimer = setTimeout(() => {
        this.sendView();
        this.checkRotate();
      }, 250);
    });
    // Desbloquear el audio con el primer gesto
    const unlock = () => this.sfx.unlock();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.inRoom) this.net.eject(false);
    });

    this.wireNet();
  }

  // ------------------------------------------------------------------ arranque

  async start() {
    if (api.token) {
      try {
        const { user } = await api.get('/me');
        this.setUser(user, { applySettings: true });
      } catch (err) {
        if (err.status === 401) api.setToken(null);
      }
    }
    this.menu.updateAccount(this.user);
    this.menu.updateSkin(this.currentSkin());
    this.net.helloExtra = () => {
      const extra = {};
      if (api.token) extra.token = api.token;
      if (this.resumeKey) {
        extra.resume = this.resumeKey;
        this.awaitingResume = true;
      }
      return extra;
    };
    this.menu.setConnected('connecting');
    this.net.connect();
    requestAnimationFrame((t) => this.loop(t));
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    // gancho para pruebas automáticas (?debug=1)
    if (new URLSearchParams(location.search).has('debug')) window.__jaha = this;
  }

  wireNet() {
    const n = this.net;
    n.on('open', () => this.menu.setConnected('connecting'));
    n.on('close', ({ code }) => {
      this.menu.setConnected('bad');
      if (code === 4002) return;
      if (this.inRoom) this.hud.setCenter('Reconectando…');
    });
    n.on('welcome', (msg) => {
      this.menu.setConnected('ok');
      this.rooms = msg.rooms;
      this.menu.updateRooms(msg.rooms);
      if (msg.title) {
        document.title = msg.title;
        $('#server-title').textContent = msg.title;
      }
      if (msg.tokenInvalid) {
        api.setToken(null);
        this.setUser(null);
      }
      if (this.awaitingResume) {
        // si en 2 s no volvimos a la partida, al menú
        clearTimeout(this.resumeTimer);
        this.resumeTimer = setTimeout(() => {
          if (this.awaitingResume) this.resumeFailed();
        }, 2000);
      } else if (this.inRoom) {
        this.resumeFailed();
      }
    });
    n.on('resume', (msg) => {
      if (!msg.ok) this.resumeFailed();
    });
    n.on('authed', (msg) => {
      if (msg.user && this.user) this.user.level = msg.user.level;
    });
    n.on('rooms', (msg) => {
      this.rooms = msg.rooms;
      this.menu.updateRooms(msg.rooms);
    });
    n.on('joined', (msg) => this.onJoined(msg));
    n.on('respawned', () => {
      this.shieldUntil = performance.now() + 3000;
      this.dead = false;
      this.spectating = false;
      this.screens.hideDeath();
      this.hud.showSpectate(false);
    });
    n.on('snapshot', (snap) => {
      if (!this.inRoom) return;
      this.state.applySnapshot(snap);
    });
    n.on('lb', (msg) => {
      this.lb = msg;
      if (this.inRoom) this.hud.updateLeaderboard(msg);
    });
    n.on('chat', (msg) => this.inRoom && this.hud.addChat(msg));
    n.on('feed', (msg) => this.inRoom && this.hud.addFeed(msg));
    n.on('dead', (msg) => this.onDead(msg));
    n.on('saved', (msg) => {
      const r = msg.result;
      if (r && !r.guest && r.rewards?.xp) toast({ icon: '💾', title: `Partida guardada: +${r.rewards.xp} XP`, sub: `+${formatGs(r.rewards.coins)}` });
      if (r && !r.guest) this.applyResult(r, { notify: true });
    });
    n.on('ach', (msg) => this.onAchievement(msg, true, true, true));
    n.on('br', (msg) => this.onBr(msg));
    n.on('spectating', (msg) => this.hud.showSpectate(true, msg.name));
    n.on('left', (msg) => {
      if (msg.rooms) {
        this.rooms = msg.rooms;
        this.menu.updateRooms(msg.rooms);
      }
    });
    n.on('err', (msg) => {
      if (msg.code === 'version') {
        toast({ icon: '🔄', title: 'Hay una versión nueva', sub: 'Recargando…' });
        setTimeout(() => location.reload(), 1500);
        return;
      }
      if (msg.code === 'kicked') {
        this.exitRoom();
        toast({ icon: '🚪', title: msg.msg, error: true });
        return;
      }
      if (!this.inRoom) this.menu.setError(msg.msg);
      else toast({ icon: '⚠️', title: msg.msg, error: true });
    });
  }

  // ------------------------------------------------------------------ bucle

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(100, now - this.lastFrame);
    this.lastFrame = now;
    this.renderer.frame(now, dt);
    if (!this.inRoom) return;
    this.minimap.draw(now);
    this.hud.updateScore(now);
    if (this.state.events.length) {
      for (const ev of this.state.events) this.sfx.play(ev);
      this.state.events.length = 0;
    }
    if (this.state.alive && !this.state.frozen) {
      let dx = 0, dy = 0;
      if (this.paused) {
        dx = 0;
        dy = 0;
      } else if (this.joy?.active) {
        const hv = this.renderer.halfView;
        dx = this.joy.vx * hv.w;
        dy = this.joy.vy * hv.h;
      } else if (!this.touchMode && this.pointer) {
        const d = this.renderer.screenToWorldDelta(this.pointer.x, this.pointer.y);
        dx = d.dx;
        dy = d.dy;
      }
      this.net.sendMove(dx, dy, now);
    }
  }

  // ------------------------------------------------------------------ partida

  canPlayFromKeyboard() {
    return !this.isModalOpen() && this.net.connected && !this.inRoom;
  }

  selectMode(mode) {
    this.mode = mode;
    storageSet('jaha.mode', mode);
    this.menu.selectMode(mode);
  }

  play() {
    if (!this.net.connected || this.inRoom) return;
    this.sfx.unlock();
    this.sfx.play('click');
    const name = this.menu.name;
    if (!this.user) storageSet('jaha.name', name);
    this.menu.setError('');
    this.net.send({ t: 'join', mode: this.mode, name, skin: this.currentSkin(), aspect: this.renderer.aspect });
    if (this.touchMode) this.goFullscreen();
  }

  goFullscreen() {
    const el = document.documentElement;
    try {
      if (!document.fullscreenElement && el.requestFullscreen) {
        el.requestFullscreen({ navigationUI: 'hide' })
          .then(() => screen.orientation?.lock?.('landscape').catch(() => {}))
          .catch(() => {});
      }
    } catch {
      /* no soportado (iPhone) */
    }
  }

  onJoined(msg) {
    clearTimeout(this.resumeTimer);
    this.awaitingResume = false;
    this.inRoom = true;
    this.roomMode = msg.mode;
    this.resumeKey = msg.resumeKey;
    sessionSet('jaha.resume', msg.resumeKey);
    this.showBotTag = msg.showBotTag !== false;
    this.state.reset(msg.world, msg.pid);
    this.renderer.resetCamera();
    this.hud.reset();
    this.hud.show(true);
    this.menu.show(false);
    this.screens.hideAll();
    this.closeModal();
    this.dead = false;
    this.spectating = false;
    this.paused = false;
    this.prevBrState = null;
    this.lastBrResult = null;
    this.lb = null;
    this.shieldUntil = msg.mode === 'ffa' && !msg.resumed ? performance.now() + 3000 : 0;
    this.sendView();
    this.checkRotate();
    if (msg.mode === 'br' && msg.br) this.onBr(msg.br);
    if (msg.resumed) toast({ icon: '🔌', title: '¡Volviste a la partida!' });
  }

  resumeFailed() {
    clearTimeout(this.resumeTimer);
    this.awaitingResume = false;
    this.resumeKey = null;
    sessionSet('jaha.resume', null);
    if (this.inRoom) {
      this.exitRoom();
      toast({ icon: '📡', title: 'Se cortó la conexión', sub: 'Tu partida anterior terminó.' });
    }
  }

  exitRoom() {
    this.inRoom = false;
    this.roomMode = null;
    this.dead = false;
    this.spectating = false;
    this.paused = false;
    this.resumeKey = null;
    sessionSet('jaha.resume', null);
    this.closeChat();
    this.state.reset();
    this.hud.show(false);
    this.screens.hideAll();
    this.menu.show(true);
    this.checkRotate();
    this.net.send({ t: 'rooms' });
    this.refreshUser();
  }

  leaveToMenu() {
    this.net.send({ t: 'leave' });
    this.exitRoom();
  }

  sendView() {
    if (this.inRoom) this.net.send({ t: 'view', aspect: this.renderer.aspect });
  }

  split() {
    if (!this.inRoom || !this.state.alive || this.paused) return;
    this.net.split();
    this.sfx.play('split');
  }

  eject(on) {
    if (!this.inRoom) return;
    if (on && (!this.state.alive || this.paused)) return;
    this.net.eject(on);
    if (on) this.sfx.play('eject');
  }

  spectate() {
    this.net.send({ t: 'spectate' });
    this.spectating = true;
    this.screens.hideDeath();
    this.hud.showSpectate(true);
    $('#btn-spec-play').hidden = this.roomMode === 'br';
  }

  respawnOrQueue() {
    if (!this.inRoom) return;
    if (this.roomMode === 'br') {
      this.net.send({ t: 'respawn' });
      return;
    }
    this.net.send({ t: 'respawn', skin: this.currentSkin(), name: this.user ? undefined : this.menu.name });
  }

  onDead(msg) {
    if (!this.inRoom) return;
    this.dead = true;
    this.net.eject(false);
    const r = msg.result;
    // La pantalla de muerte / podio ya muestra nivel, logros y skins nuevas
    if (r && !r.guest) this.applyResult(r, { notify: false });
    if (msg.mode === 'br') {
      this.lastBrResult = { place: msg.place, of: msg.of, result: r };
      if (msg.reason === 'win' || msg.reason === 'survived') {
        this.sfx.play(msg.win ? 'level' : 'ach');
        return; // se muestra en el podio
      }
    }
    this.sfx.play('death');
    this.screens.showDeath(msg);
    this.hud.showSpectate(false);
  }

  applyResult(r, { notify = true } = {}) {
    if (!this.user) return;
    this.user.coins = r.coins;
    this.user.xp = r.xp;
    const lp = levelProgress(r.xp);
    Object.assign(this.user, { level: lp.level, xpInto: lp.into, xpNeed: lp.need });
    if (r.levelAfter > r.levelBefore) {
      this.sfx.play('level');
      if (notify) toast({ icon: '⬆️', title: `${pick(PHRASES.levelup)} Nivel ${r.levelAfter}`, sub: `+${formatGs(r.levelUpCoins)}` });
    }
    for (const a of r.newAchievements || []) this.onAchievement(a, false, notify);
    if (notify) for (const s of r.newSkins || []) toast({ icon: '🎨', title: `¡Skin nueva: ${SKIN_MAP[s]?.name || s}!`, sub: 'Equipala en la tienda' });
    this.menu.updateAccount(this.user);
  }

  /**
   * @param {boolean} sound
   * @param {boolean} notify  mostrar el cartelito
   * @param {boolean} live    true si viene en vivo (las monedas todavía no están sumadas en this.user)
   */
  onAchievement(a, sound = true, notify = true, live = false) {
    if (sound) this.sfx.play('ach');
    if (notify) toast({ icon: a.icon || '🏅', title: `${pick(PHRASES.ach)} ${a.name}`, sub: a.coins ? `+${formatGs(a.coins)}${a.skin ? ' · ¡y una skin!' : ''}` : '' });
    if (this.user) {
      this.user.achievements = this.user.achievements || [];
      if (!this.user.achievements.some((x) => x.id === a.id)) this.user.achievements.push({ id: a.id, at: Date.now() });
      if (live && a.coins) {
        this.user.coins += a.coins;
        this.menu.updateAccount(this.user);
      }
    }
  }

  onBr(br) {
    if (!br) return;
    this.br = br;
    if (!this.inRoom || this.roomMode !== 'br') return;
    const prev = this.prevBrState;
    this.prevBrState = br.state;
    const you = br.you || {};
    this.hud.updateBrBanner(br, you.state === 'playing');
    switch (br.state) {
      case 'lobby':
        this.dead = false;
        this.spectating = false;
        this.screens.hideDeath();
        this.screens.hidePodium();
        this.hud.showSpectate(false);
        this.hud.setCenter('');
        this.screens.showLobby(br);
        break;
      case 'countdown': {
        this.screens.hideLobby();
        this.screens.hidePodium();
        this.screens.hideDeath();
        this.hud.showSpectate(false);
        this.dead = false;
        const s = Math.ceil((br.endsIn || 0) / 1000);
        if (s > 0) {
          this.hud.setCenter(String(s), true);
          this.sfx.play('count');
        }
        break;
      }
      case 'playing':
        this.screens.hideLobby();
        this.screens.hidePodium();
        if (prev === 'countdown') {
          this.hud.setCenter("¡Jaha!", true);
          this.sfx.play('go');
          setTimeout(() => this.hud.lastCenter === "¡Jaha!" && this.hud.setCenter(''), 1200);
        } else if (prev === null && you.state === 'queued') {
          this.hud.setCenter('');
        }
        if (you.state === 'queued' && !this.dead) {
          this.hud.showSpectate(true);
          $('#spectate-name').textContent = 'Ronda en curso — entrás en la próxima';
          $('#btn-spec-play').hidden = true;
        }
        break;
      case 'ended':
        this.hud.setCenter('');
        this.hud.showSpectate(false);
        if (prev !== 'ended') {
          this.screens.showPodium(br, this.lastBrResult);
          this.lastBrResult = null;
        }
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------------ chat / pausa / paneles

  openChat() {
    if (!this.inRoom || !this.settings.showChat) return;
    this.chatOpen = true;
    this.hud.openChat();
  }

  closeChat() {
    this.chatOpen = false;
    this.hud.closeChat();
  }

  togglePause(on) {
    if (!this.inRoom) return;
    this.paused = on ?? !this.paused;
    if (this.paused) this.net.eject(false);
    this.screens.setPause(this.paused);
  }

  isModalOpen() {
    return !$('#modal').hidden;
  }

  openPanel(name, opts = {}) {
    const p = PANELS[name];
    if (!p) return;
    this.sfx.unlock();
    $('#modal-title').textContent = p.title;
    const body = clear($('#modal-body'));
    $('#modal').hidden = false;
    p.render(this, body, opts);
  }

  closeModal() {
    $('#modal').hidden = true;
    clear($('#modal-body'));
  }

  // ------------------------------------------------------------------ cuenta / skins / ajustes

  currentSkin() {
    if (this.user) return this.user.equippedSkin ?? DEFAULT_SKIN;
    const s = storageGet('jaha.skin', DEFAULT_SKIN);
    return s === '' || FREE_SKINS.includes(s) ? s : DEFAULT_SKIN;
  }

  async setSkin(id) {
    if (this.user) {
      await api.post('/skins/equip', { skinId: id });
      this.user.equippedSkin = id;
    } else {
      if (id !== '' && !FREE_SKINS.includes(id)) throw new Error('Creá una cuenta para usar esa skin.');
      storageSet('jaha.skin', id);
    }
    this.menu.updateSkin(id);
  }

  setUser(user, { applySettings = false } = {}) {
    this.user = user;
    this.menu.updateAccount(user);
    this.menu.updateSkin(this.currentSkin());
    if (user && user.settings && applySettings) {
      this.settings = validateSettings(user.settings);
      saveLocalSettings(this.settings);
      applySettingsToDom(this.settings);
      this.sfx.setVolume(this.settings.volume);
    }
  }

  async refreshUser() {
    if (!api.token) return;
    try {
      const { user } = await api.get('/me');
      this.setUser(user);
    } catch (err) {
      if (err.status === 401) {
        api.setToken(null);
        this.setUser(null);
      }
    }
  }

  async onLoggedIn(token, user) {
    api.setToken(token);
    try {
      const r = await api.get('/me');
      user = r.user;
    } catch {
      /* usar el que vino */
    }
    this.setUser(user, { applySettings: false });
    // Guardar en la cuenta los ajustes actuales del navegador
    api.put('/settings', { settings: this.settings }).catch(() => {});
    this.net.send({ t: 'auth', token });
  }

  async logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignorar */
    }
    api.setToken(null);
    this.setUser(null);
    this.net.send({ t: 'auth', token: null });
    toast({ icon: '👋', title: '¡Nos vemos! Aguyje por jugar.' });
  }

  updateSettings(patch) {
    const prevQuality = this.settings.quality;
    this.settings = validateSettings({ ...this.settings, ...patch });
    saveLocalSettings(this.settings);
    applySettingsToDom(this.settings);
    this.sfx.setVolume(this.settings.volume);
    if (prevQuality !== this.settings.quality) {
      this.renderer.autoLow = false;
      this.renderer.resize();
    }
    if (this.user) {
      clearTimeout(this.settingsTimer);
      this.settingsTimer = setTimeout(() => api.put('/settings', { settings: this.settings }).catch(() => {}), 700);
    }
  }

  checkRotate() {
    const portrait = window.innerHeight > window.innerWidth;
    const show = this.inRoom && this.touchMode && portrait && !sessionGet('jaha.rotateOk');
    $('#rotate-hint').hidden = !show;
  }

  onTouchModeChanged() {
    this.checkRotate();
  }
}

const app = new App();
app.start();
