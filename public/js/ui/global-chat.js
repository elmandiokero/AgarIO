// Chat global del menú: panel fijo en pantallas grandes, hoja deslizable con botón en celulares.
import { $, h, clear } from './dom.js';

function hhmm(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function globalLine(m) {
  if (m.sys) return h('div', { class: 'm sys' }, m.text);
  return h(
    'div',
    { class: 'm' },
    h('span', { class: 'time' }, hhmm(m.ts)),
    h('span', { class: `from${m.admin ? ' adm' : m.reg ? ' reg' : ''}` }, m.from),
    m.where ? h('span', { class: 'where' }, `· ${m.where}`) : null,
    ': ',
    m.text
  );
}

export class GlobalChatView {
  constructor(app) {
    this.app = app;
    this.root = $('#menu-chat');
    this.log = $('#menu-chat-log');
    this.form = $('#menu-chat-form');
    this.input = $('#menu-chat-input');
    this.btn = $('#menu-chat-btn');
    this.badge = $('#menu-chat-badge');
    this.onlineEl = $('#online-count');
    this.unread = 0;
    this.wide = window.matchMedia('(min-width: 1200px)');

    this.form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const text = this.input.value.trim();
      if (!text) return;
      app.sendGlobal(text);
      this.input.value = '';
    });
    this.btn.addEventListener('click', () => this.open());
    $('#menu-chat-close').addEventListener('click', () => this.close());
    this.render([]);
  }

  /** ¿El usuario lo está viendo? */
  visible() {
    return !this.app.inRoom && (this.wide.matches || this.root.classList.contains('open'));
  }

  isSheetOpen() {
    return this.root.classList.contains('open');
  }

  open() {
    this.root.classList.add('open');
    this.unread = 0;
    this.updateBadge();
    this.scrollDown();
    setTimeout(() => this.input.focus(), 50);
  }

  close() {
    this.root.classList.remove('open');
    this.input.blur();
  }

  setEnabled(on) {
    this.root.hidden = !on;
    this.btn.hidden = !on;
  }

  scrollDown() {
    this.log.scrollTop = this.log.scrollHeight;
  }

  render(msgs) {
    clear(this.log);
    if (!msgs.length) {
      this.log.append(h('div', { class: 'empty' }, '¡Mba\'éichapa! Todavía no hay mensajes. Saludá a todos 👋'));
      return;
    }
    for (const m of msgs) this.log.append(globalLine(m));
    this.scrollDown();
  }

  add(m) {
    const empty = this.log.querySelector('.empty');
    if (empty) empty.remove();
    const nearBottom = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 60;
    this.log.append(globalLine(m));
    while (this.log.children.length > 100) this.log.firstChild.remove();
    if (nearBottom) this.scrollDown();
    if (!this.visible() && !m.sys && m.id) {
      this.unread++;
      this.updateBadge();
    }
  }

  updateBadge() {
    this.badge.hidden = this.unread === 0;
    this.badge.textContent = this.unread > 99 ? '99+' : String(this.unread);
  }

  setOnline(n) {
    this.onlineEl.textContent = `● ${n} ${n === 1 ? 'conectado' : 'conectados'}`;
  }
}
