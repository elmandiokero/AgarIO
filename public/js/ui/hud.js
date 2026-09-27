// HUD: ranking en vivo, puntaje, chat, feed de muertes, banner de Batalla real, espectador.
import { $, h, clear } from './dom.js';
import { formatThousands, formatDuration } from '/shared/formulas.js';

export class Hud {
  constructor(app) {
    this.app = app;
    this.root = $('#hud');
    this.lbList = $('#lb-list');
    this.lbMe = $('#lb-me');
    this.scoreMass = $('#score-mass');
    this.scoreRank = $('#score-rank');
    this.feed = $('#killfeed');
    this.chat = $('#chat');
    this.chatLog = $('#chat-log');
    this.chatForm = $('#chat-form');
    this.chatInput = $('#chat-input');
    this.brBanner = $('#br-banner');
    this.center = $('#center-text');
    this.specBar = $('#spectate-bar');
    this.specName = $('#spectate-name');
    this.fpsEl = $('#fps');
    this.lastScore = 0;
    this.lastCenter = '';

    this.chatChannel = $('#chat-channel');
    this.chatForm.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const text = this.chatInput.value.trim();
      if (text) {
        if (app.chatChannel === 'global') app.sendGlobal(text);
        else app.net.send({ t: 'chat', text });
      }
      this.chatInput.value = '';
      app.closeChat();
    });
    this.chatInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Tab') {
        ev.preventDefault();
        app.toggleChatChannel();
      }
    });
    // Tocar el botón de canal no debe cerrar el chat
    this.chatChannel.addEventListener('pointerdown', (ev) => ev.preventDefault());
    this.chatChannel.addEventListener('click', () => {
      app.toggleChatChannel();
      this.chatInput.focus();
    });
    this.chatInput.addEventListener('blur', () => setTimeout(() => app.chatOpen && document.activeElement !== this.chatInput && app.closeChat(), 150));
    $('#btn-chat').addEventListener('click', () => (app.chatOpen ? app.closeChat() : app.openChat()));
    $('#btn-pause').addEventListener('click', () => app.togglePause());
    $('#btn-spec-next').addEventListener('click', () => app.net.send({ t: 'spectate_next' }));
    $('#btn-spec-play').addEventListener('click', () => app.respawnOrQueue());
  }

  show(on) {
    this.root.hidden = !on;
  }

  reset() {
    clear(this.lbList);
    clear(this.feed);
    this.lbMe.textContent = '';
    this.scoreMass.textContent = '0';
    this.scoreRank.textContent = '';
    this.brBanner.hidden = true;
    this.specBar.hidden = true;
    this.setCenter('');
  }

  updateLeaderboard(lb) {
    const myPid = this.app.state.myPid;
    const frag = document.createDocumentFragment();
    for (const p of lb.top) {
      const li = h('li', { class: p.pid === myPid ? 'me' : null }, p.n || 'Anónimo');
      if (p.b && this.app.settings.showBotTag && this.app.showBotTag !== false) li.append(h('span', { class: 'bot' }, '🤖'));
      frag.append(li);
    }
    clear(this.lbList).append(frag);
    const inTop = lb.top.some((p) => p.pid === myPid);
    this.lbMe.textContent = lb.rank && !inTop ? `#${lb.rank} de ${lb.total} — vos` : '';
    this.scoreRank.textContent = lb.rank ? `Puesto #${lb.rank} de ${lb.total}` : '';
  }

  updateScore(now) {
    if (now - this.lastScore < 200) return;
    this.lastScore = now;
    const st = this.app.state;
    const m = st.myMass();
    this.scoreMass.textContent = st.alive ? `Masa ${formatThousands(Math.round(m))}` : '';
    if (!this.fpsEl.hidden) this.fpsEl.textContent = `${this.app.renderer.fps} FPS · ${this.app.net.rtt} ms`;
  }

  setChannel(ch) {
    const g = ch === 'global';
    this.chatChannel.textContent = g ? '🌎 Global' : '🏠 Sala';
    this.chatChannel.classList.toggle('global', g);
    this.chatInput.placeholder = g ? 'Mensaje para todos… (Tab cambia)' : 'Mensaje a la sala… (Tab cambia)';
  }

  addChat(msg) {
    const line = h('div', { class: `msg${msg.sys ? ' sys' : ''}${msg.admin ? ' adm' : ''}${msg.global ? ' global' : ''}` });
    if (msg.sys) line.textContent = msg.global ? `🌎 ${msg.text}` : msg.text;
    else {
      if (msg.global) line.append(h('span', { class: 'ch' }, '🌎'));
      line.append(h('span', { class: 'from' }, `${msg.from}${msg.bot && this.app.settings.showBotTag ? ' 🤖' : ''}: `), msg.text);
    }
    this.chatLog.append(line);
    while (this.chatLog.children.length > 30) this.chatLog.firstChild.remove();
  }

  openChat() {
    this.chat.classList.add('open');
    this.chatInput.focus();
  }

  closeChat() {
    this.chat.classList.remove('open');
    this.chatInput.blur();
  }

  addFeed(msg) {
    let text;
    if (msg.k) text = `${msg.k} se comió a ${msg.v}`;
    else if (msg.r === 'zone') text = `${msg.v} quedó afuera de la zona`;
    else text = `${msg.v} fue eliminado`;
    this.feed.append(h('div', null, text));
    while (this.feed.children.length > 5) this.feed.firstChild.remove();
    setTimeout(() => this.feed.firstChild && this.feed.children.length && this.feed.firstChild.remove(), 6500);
  }

  setCenter(text, pop = false) {
    if (text === this.lastCenter) return;
    this.lastCenter = text;
    this.center.textContent = text;
    if (pop && text) {
      this.center.classList.remove('pop');
      void this.center.offsetWidth;
      this.center.classList.add('pop');
    }
  }

  updateBrBanner(br, inPlay) {
    const b = this.brBanner;
    if (!br || br.state === 'lobby') {
      b.hidden = true;
      return;
    }
    b.hidden = false;
    clear(b);
    if (br.state === 'countdown') {
      b.append(h('span', null, `Ronda #${br.round} · ${br.participants} jugadores`));
      return;
    }
    if (br.state === 'ended') {
      b.append(h('span', null, 'Ronda terminada'));
      return;
    }
    b.append(h('span', { class: 'alive' }, `🟢 ${br.alive} vivos`));
    if (br.phase) {
      const secs = br.phase.endsIn !== null ? formatDuration(br.phase.endsIn) : '';
      const label = br.phase.stage === 'shrink' ? 'La zona se achica' : br.phase.stage === 'final' ? 'Zona final' : 'Próxima zona en';
      b.append(' · ', h('span', { class: br.phase.stage === 'shrink' ? 'warn' : null }, `${label} ${br.phase.stage === 'final' ? '' : secs}`));
      b.append(h('div', { style: { fontSize: '0.75rem', opacity: 0.8 } }, `Fase ${br.phase.i}/${br.phase.n}${inPlay ? '' : ' · mirando'}`));
    }
  }

  showSpectate(on, name = null) {
    this.specBar.hidden = !on;
    if (name) this.specName.textContent = `Mirando a ${name}`;
    else if (on) this.specName.textContent = 'Mirando al líder';
  }
}
