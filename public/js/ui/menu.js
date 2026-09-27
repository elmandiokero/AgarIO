// Menú principal: nombre, skin, modo de juego, cuenta y botones.
import { $, $$, h, clear } from './dom.js';
import { formatGs, formatThousands, hueColor } from '/shared/formulas.js';
import { skinUrl } from '/shared/catalog/skins.js';
import { storageGet } from '../settings-store.js';
import { PHRASES, TIPS, pick } from '../i18n.js';

export class Menu {
  constructor(app) {
    this.app = app;
    this.root = $('#menu');
    this.nameInput = $('#name-input');
    this.skinPreview = $('#skin-preview');
    this.btnPlay = $('#btn-play');
    this.error = $('#menu-error');
    this.chip = $('#account-chip');
    this.status = $('#conn-status');
    this.connected = false;

    this.nameInput.value = storageGet('jaha.name', '');
    this.nameInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        app.play();
      }
    });
    this.skinPreview.addEventListener('click', () => app.openPanel('shop'));
    this.btnPlay.addEventListener('click', () => app.play());
    for (const b of $$('.mode', this.root)) b.addEventListener('click', () => app.selectMode(b.dataset.mode));
    for (const b of $$('.nav-btn', this.root)) b.addEventListener('click', () => app.openPanel(b.dataset.panel));
    $('#tagline').textContent = `${pick(PHRASES.welcome)} ${pick(TIPS)}`;
    this.selectMode(app.mode);
  }

  show(on) {
    this.root.hidden = !on;
    if (on) $('#tagline').textContent = `${pick(PHRASES.welcome)} ${pick(TIPS)}`;
  }

  get name() {
    return this.nameInput.value.trim();
  }

  selectMode(mode) {
    for (const b of $$('.mode', this.root)) b.setAttribute('aria-checked', String(b.dataset.mode === mode));
    this.updatePlayLabel();
  }

  setConnected(state) {
    this.connected = state === 'ok';
    this.status.className = `conn-status${state === 'ok' ? ' ok' : state === 'bad' ? ' bad' : ''}`;
    this.status.title = state === 'ok' ? 'Conectado' : state === 'bad' ? 'Sin conexión' : 'Conectando…';
    this.updatePlayLabel();
  }

  updatePlayLabel() {
    const b = this.btnPlay;
    if (!this.connected) {
      b.disabled = true;
      b.textContent = 'Conectando…';
      return;
    }
    b.disabled = false;
    b.textContent = this.app.mode === 'br' ? '¡Jaha! Entrar a la Batalla' : '¡Jaha! Jugar';
  }

  setError(text) {
    this.error.hidden = !text;
    this.error.textContent = text || '';
  }

  updateRooms(rooms) {
    if (!rooms) return;
    const ffa = rooms.ffa;
    const br = rooms.br;
    const ffaBtn = $('.mode[data-mode="ffa"]', this.root);
    const brBtn = $('.mode[data-mode="br"]', this.root);
    ffaBtn.hidden = !ffa;
    brBtn.hidden = !br;
    if (ffa) $('#mode-ffa-info').textContent = `👥 ${ffa.humans} ${ffa.humans === 1 ? 'persona' : 'personas'} · 🤖 ${ffa.bots}`;
    if (br) {
      let t;
      if (br.state === 'lobby') t = br.startsIn !== null ? `⏱ Empieza en ${Math.ceil(br.startsIn / 1000)} s · ${br.queued} en espera` : `Sala abierta · 🤖 ${br.bots} bots`;
      else if (br.state === 'countdown') t = '¡Arrancando!';
      else if (br.state === 'playing') t = `En curso · ${br.alive} vivos`;
      else t = 'Terminando ronda…';
      $('#mode-br-info').textContent = t;
    }
    if (!ffa && br && this.app.mode === 'ffa') this.app.selectMode('br');
    if (!br && ffa && this.app.mode === 'br') this.app.selectMode('ffa');
  }

  updateSkin(skinId, hue = 170) {
    this.skinPreview.style.backgroundColor = hueColor(hue);
    this.skinPreview.style.backgroundImage = skinId ? `url(${skinUrl(skinId)})` : 'none';
  }

  updateAccount(user) {
    const c = clear(this.chip);
    if (!user) {
      this.nameInput.disabled = false;
      this.nameInput.title = '';
      if (!this.nameInput.value) this.nameInput.value = storageGet('jaha.name', '');
      c.append(
        h('div', { class: 'grow' }, h('div', { class: 'who' }, '👤 Invitado'), h('small', { class: 'muted' }, 'Con cuenta guardás tu progreso')),
        h('button', { class: 'btn small', onclick: () => this.app.openPanel('account', { tab: 'login' }) }, 'Ingresar'),
        h('button', { class: 'btn gold small', onclick: () => this.app.openPanel('account', { tab: 'register' }) }, 'Crear cuenta')
      );
      return;
    }
    this.nameInput.value = user.displayName;
    this.nameInput.disabled = true;
    this.nameInput.title = 'Podés cambiar tu nombre en Cuenta';
    const pct = user.xpNeed ? Math.round((user.xpInto / user.xpNeed) * 100) : 100;
    c.append(
      h('span', { class: 'level-badge', title: 'Nivel' }, String(user.level)),
      h(
        'div',
        { class: 'grow' },
        h('div', { class: 'who' }, user.displayName),
        h('div', { class: 'xp-bar', title: user.xpNeed ? `${formatThousands(user.xpInto)} / ${formatThousands(user.xpNeed)} XP` : 'Nivel máximo' }, h('i', { style: { width: `${pct}%` } }))
      ),
      h('span', { class: 'coins', title: 'Guaraníes' }, formatGs(user.coins)),
      h('button', { class: 'btn small', onclick: () => this.app.openPanel('account') }, 'Perfil')
    );
  }
}
