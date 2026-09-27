// Paneles del menú: Cuenta, Tienda, Logros, Ranking, Ajustes, Invitar y Cómo jugar.
import { h, clear, toast } from './dom.js';
import { api } from '../api.js';
import { SKINS, SKIN_MAP, RARITY, skinUrl, FREE_SKINS } from '/shared/catalog/skins.js';
import { ACHIEVEMENTS } from '/shared/catalog/achievements.js';
import { formatGs, formatThousands, formatDuration, hueColor } from '/shared/formulas.js';
import { DEFAULT_SETTINGS } from '/shared/settings-schema.js';
import { TIPS } from '../i18n.js';

function skinImg(id, cls = '') {
  if (!id) return h('span', { class: `mini-skin ${cls}`, style: { background: hueColor(170) } });
  return h('img', { class: `mini-skin ${cls}`, src: skinUrl(id), alt: '', loading: 'lazy' });
}

function formError(err) {
  return h('p', { class: 'error' }, err.message || 'Error');
}

// ------------------------------------------------------------------ Cuenta

export function renderAccount(app, body, { tab = 'login' } = {}) {
  clear(body);
  if (!app.user) {
    const tabs = h('div', { class: 'tabs' });
    const content = h('div');
    const mk = (id, label) =>
      h('button', { class: `tab${tab === id ? ' active' : ''}`, onclick: () => renderAccount(app, body, { tab: id }) }, label);
    tabs.append(mk('login', 'Ingresar'), mk('register', 'Crear cuenta'));
    body.append(tabs, content);
    if (tab === 'register') content.append(registerForm(app, body));
    else content.append(loginForm(app, body));
    return;
  }
  body.append(h('p', { class: 'muted' }, 'Cargando perfil…'));
  api
    .get('/me')
    .then(({ user }) => {
      app.setUser(user);
      clear(body).append(profileView(app, user, body));
    })
    .catch((err) => clear(body).append(formError(err)));
}

function loginForm(app, body) {
  const user = h('input', { name: 'username', autocomplete: 'username', maxlength: 32, required: true });
  const pass = h('input', { name: 'password', type: 'password', autocomplete: 'current-password', maxlength: 128, required: true });
  const err = h('div');
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Ingresar');
  const form = h(
    'form',
    { class: 'form', autocomplete: 'on' },
    h('label', null, 'Usuario'),
    user,
    h('label', null, 'Contraseña'),
    pass,
    btn,
    err,
    h('p', { class: 'hint' }, '¿Te olvidaste la contraseña? Pedile al admin del servidor que la resetee.')
  );
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    btn.disabled = true;
    clear(err);
    try {
      const r = await api.post('/auth/login', { username: user.value.trim(), password: pass.value });
      await app.onLoggedIn(r.token, r.user);
      toast({ icon: '👋', title: `¡Mba'éichapa, ${r.user.displayName}!` });
      renderAccount(app, body);
    } catch (e) {
      err.append(formError(e));
    } finally {
      btn.disabled = false;
    }
  });
  setTimeout(() => user.focus(), 50);
  return form;
}

function registerForm(app, body) {
  const user = h('input', { name: 'username', autocomplete: 'username', maxlength: 16, required: true, pattern: '[A-Za-z0-9_.\\-]{3,16}' });
  const display = h('input', { name: 'displayName', maxlength: 24, placeholder: 'Opcional (ej. Karai Juan)' });
  const pass = h('input', { name: 'password', type: 'password', autocomplete: 'new-password', minlength: 6, maxlength: 128, required: true });
  const pass2 = h('input', { name: 'password2', type: 'password', autocomplete: 'new-password', minlength: 6, maxlength: 128, required: true });
  const err = h('div');
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Crear cuenta');
  const form = h(
    'form',
    { class: 'form' },
    h('label', null, 'Usuario (para ingresar)'),
    user,
    h('p', { class: 'hint' }, 'De 3 a 16 letras, números, punto, guion o guion bajo.'),
    h('label', null, 'Nombre en el juego'),
    display,
    h('label', null, 'Contraseña'),
    pass,
    h('label', null, 'Repetí la contraseña'),
    pass2,
    btn,
    err,
    h('p', { class: 'hint' }, 'Tu cuenta se guarda en este servidor. Empezás con ₲ 5.000 de regalo 🎁')
  );
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    clear(err);
    if (pass.value !== pass2.value) {
      err.append(h('p', { class: 'error' }, 'Las contraseñas no coinciden.'));
      return;
    }
    btn.disabled = true;
    try {
      const r = await api.post('/auth/register', { username: user.value.trim(), password: pass.value, displayName: display.value.trim() || undefined });
      await app.onLoggedIn(r.token, r.user);
      toast({ icon: '🎉', title: `¡Bienvenido/a, ${r.user.displayName}!`, sub: 'Tu cuenta está lista. ¡Jaha!' });
      renderAccount(app, body);
    } catch (e) {
      err.append(formError(e));
    } finally {
      btn.disabled = false;
    }
  });
  setTimeout(() => user.focus(), 50);
  return form;
}

function profileView(app, user, body) {
  const s = user.stats || {};
  const wrap = h('div');
  const pct = user.xpNeed ? Math.round((user.xpInto / user.xpNeed) * 100) : 100;
  wrap.append(
    h(
      'div',
      { class: 'profile-top' },
      user.equippedSkin ? h('img', { src: skinUrl(user.equippedSkin), alt: '' }) : h('span', { class: 'mini-skin', style: { width: '64px', height: '64px' } }),
      h(
        'div',
        { style: { flex: 1, minWidth: 0 } },
        h('div', { style: { fontSize: '1.3rem', fontWeight: 900 } }, user.displayName),
        h('div', { class: 'muted' }, `@${user.username}${user.isAdmin ? ' · admin' : ''}`),
        h('div', { class: 'row', style: { marginTop: '6px' } }, h('span', { class: 'level-badge' }, String(user.level)), h('div', { style: { flex: 1 } }, h('div', { class: 'xp-bar' }, h('i', { style: { width: `${pct}%` } })), h('small', { class: 'muted' }, user.xpNeed ? `${formatThousands(user.xpInto)} / ${formatThousands(user.xpNeed)} XP` : 'Nivel máximo')), h('span', { class: 'coins' }, formatGs(user.coins)))
      )
    )
  );
  wrap.append(
    h(
      'div',
      { class: 'stat-grid' },
      statBox('Partidas', formatThousands(s.games_played || 0)),
      statBox('Masa máxima', formatThousands(s.max_mass || 0)),
      statBox('Jugadores comidos', formatThousands(s.players_eaten || 0)),
      statBox('Bots comidos', formatThousands(s.bots_eaten || 0)),
      statBox('Chipitas', formatThousands(s.food_eaten || 0)),
      statBox('Cactus explotados', formatThousands(s.viruses_popped || 0)),
      statBox('Tiempo jugado', formatDuration(s.time_alive_ms || 0)),
      statBox('Vida más larga', formatDuration(s.longest_life_ms || 0)),
      statBox('Mejor puesto (Clásico)', s.best_rank_ffa ? `#${s.best_rank_ffa}` : '—'),
      statBox('Veces #1', formatThousands(s.times_top1_ffa || 0)),
      statBox('Victorias BR', formatThousands(s.br_wins || 0)),
      statBox('Podios BR', formatThousands(s.br_top3 || 0))
    )
  );
  // Historial
  const hist = h('div', null, h('h3', { class: 'section-title' }, 'Últimas partidas'), h('p', { class: 'muted' }, 'Cargando…'));
  wrap.append(hist);
  api
    .get('/matches')
    .then(({ matches }) => {
      hist.lastChild.remove();
      if (!matches.length) {
        hist.append(h('p', { class: 'muted' }, 'Todavía no jugaste. ¡Jaha!'));
        return;
      }
      const table = h('table', { class: 'table' }, h('tr', null, h('th', null, 'Modo'), h('th', null, 'Cuándo'), h('th', { class: 'num' }, 'Masa'), h('th', { class: 'num' }, 'Kills'), h('th', { class: 'num' }, 'Puesto'), h('th', { class: 'num' }, 'Premio')));
      for (const m of matches.slice(0, 12)) {
        const when = new Date(m.ended_at);
        table.append(
          h(
            'tr',
            null,
            h('td', null, m.mode === 'br' ? '🌵 BR' : '🥯 Clásico'),
            h('td', null, `${when.toLocaleDateString('es-PY')} ${when.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}`),
            h('td', { class: 'num' }, formatThousands(m.max_mass)),
            h('td', { class: 'num' }, String(m.kills + m.bot_kills)),
            h('td', { class: 'num' }, m.br_place ? `#${m.br_place}/${m.br_participants}` : m.best_rank ? `#${m.best_rank}` : '—'),
            h('td', { class: 'num' }, formatGs(m.coins))
          )
        );
      }
      hist.append(table);
    })
    .catch(() => {});

  // Cambiar nombre / contraseña / salir
  const nameInput = h('input', { value: user.displayName, maxlength: 24 });
  const nameErr = h('div');
  const nameForm = h('form', { class: 'form' }, h('label', null, 'Nombre en el juego'), h('div', { class: 'row' }, nameInput, h('button', { class: 'btn small', type: 'submit' }, 'Guardar')), nameErr);
  nameForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    clear(nameErr);
    try {
      const r = await api.put('/me', { displayName: nameInput.value.trim() });
      app.setUser(r.user);
      toast({ icon: '✅', title: 'Nombre actualizado' });
    } catch (e) {
      nameErr.append(formError(e));
    }
  });
  const cur = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Contraseña actual' });
  const next = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Contraseña nueva (mín. 6)' });
  const passErr = h('div');
  const passForm = h('form', { class: 'form' }, h('label', null, 'Cambiar contraseña'), cur, next, h('button', { class: 'btn small', type: 'submit' }, 'Cambiar'), passErr);
  passForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    clear(passErr);
    try {
      const r = await api.post('/auth/password', { current: cur.value, next: next.value });
      api.setToken(r.token);
      cur.value = '';
      next.value = '';
      toast({ icon: '🔒', title: 'Contraseña cambiada' });
    } catch (e) {
      passErr.append(formError(e));
    }
  });
  wrap.append(
    h('h3', { class: 'section-title' }, 'Cuenta'),
    h('div', { class: 'col' }, nameForm, passForm, h('button', { class: 'btn ghost', onclick: () => app.logout().then(() => renderAccount(app, body)) }, 'Cerrar sesión'))
  );
  return wrap;
}

function statBox(label, value) {
  return h('div', { class: 'stat' }, h('b', null, value), h('small', null, label));
}

// ------------------------------------------------------------------ Tienda

export function renderShop(app, body) {
  clear(body).append(h('p', { class: 'muted' }, 'Cargando tienda…'));
  api
    .get('/shop')
    .then((data) => drawShop(app, body, data))
    .catch((err) => clear(body).append(formError(err)));
}

function drawShop(app, body, data) {
  clear(body);
  const logged = !!app.user;
  const current = app.currentSkin();
  body.append(
    h(
      'div',
      { class: 'shop-head' },
      h('div', null, logged ? h('span', { class: 'coins', style: { fontSize: '1.3rem' } }, formatGs(data.coins)) : h('span', { class: 'muted' }, 'Jugando como invitado: sólo skins gratis.')),
      logged ? h('span', { class: 'muted' }, `Nivel ${data.level}`) : h('button', { class: 'btn gold small', onclick: () => app.openPanel('account', { tab: 'register' }) }, '✨ Crear cuenta')
    )
  );
  const groups = [
    ['Gratis', (s) => s.free],
    ['Tienda', (s) => s.price],
    ['Por nivel (mitología guaraní)', (s) => s.level],
    ['Por logros', (s) => s.achievement],
  ];
  // "Sin skin"
  const noSkin = h(
    'div',
    { class: `skin-card${current === '' ? ' equipped' : ''}` },
    h('span', { class: 'mini-skin', style: { width: '84px', height: '84px', background: hueColor(170), margin: 0 } }),
    h('div', { class: 'name' }, 'Color liso'),
    h('div', { class: 'desc' }, 'Sin dibujo, sólo tu color.'),
    h('button', { class: 'btn small', disabled: current === '', onclick: () => equip('') }, current === '' ? 'En uso ✓' : 'Usar')
  );
  for (const [title, test] of groups) {
    const grid = h('div', { class: 'skin-grid' });
    if (title === 'Gratis') grid.append(noSkin);
    for (const s of data.skins.filter(test)) grid.append(skinCard(s));
    body.append(h('h3', { class: 'section-title' }, title), grid);
  }

  function skinCard(s) {
    const owned = s.owned || (!logged && s.free);
    const inUse = current === s.id;
    const rar = RARITY[s.rarity] || RARITY.comun;
    const card = h(
      'div',
      { class: `skin-card${inUse ? ' equipped' : ''}${owned ? '' : ' locked'}` },
      h('img', { src: skinUrl(s.id), alt: s.name, loading: 'lazy' }),
      h('div', { class: 'rarity', style: { color: rar.color } }, rar.name),
      h('div', { class: 'name' }, s.name),
      h('div', { class: 'desc' }, s.desc)
    );
    if (owned) {
      card.append(h('button', { class: 'btn small', disabled: inUse, onclick: () => equip(s.id) }, inUse ? 'En uso ✓' : 'Usar'));
    } else if (s.canBuy) {
      card.append(h('button', { class: 'btn gold small', onclick: () => buy(s) }, `Comprar ${formatGs(s.price)}`));
    } else {
      if (s.price) card.append(h('div', { class: 'coins' }, formatGs(s.price)));
      card.append(h('div', { class: 'lock' }, `🔒 ${s.lockedReason || 'Bloqueada'}`));
    }
    return card;
  }

  async function buy(s) {
    if (!confirm(`¿Comprar "${s.name}" por ${formatGs(s.price)}?`)) return;
    try {
      const r = await api.post('/shop/buy', { skinId: s.id });
      toast({ icon: '🛍️', title: `¡Compraste ${s.name}!`, sub: `Te quedan ${formatGs(r.coins)}` });
      for (const a of r.achievements || []) app.onAchievement(a);
      if (app.user) app.user.coins = r.coins;
      await equip(s.id, true);
      app.refreshUser();
      drawShop(app, body, { ...data, coins: r.coins, skins: r.skins });
    } catch (e) {
      toast({ icon: '⚠️', title: e.message, error: true });
    }
  }

  async function equip(id, silent = false) {
    try {
      await app.setSkin(id);
      if (!silent) {
        drawShop(app, body, {
          ...data,
          skins: data.skins.map((x) => ({ ...x, equipped: x.id === id })),
        });
      }
    } catch (e) {
      toast({ icon: '⚠️', title: e.message, error: true });
    }
  }
}

// ------------------------------------------------------------------ Logros

export function renderAchievements(app, body) {
  clear(body);
  const unlocked = new Map((app.user?.achievements || []).map((a) => [a.id, a.at]));
  const done = unlocked.size;
  body.append(
    h('p', { class: 'muted' }, app.user ? `Desbloqueaste ${done} de ${ACHIEVEMENTS.length} logros.` : 'Creá una cuenta para guardar tus logros. ¡Cada uno te da guaraníes!')
  );
  const list = h('div', { class: 'ach-list' });
  for (const a of ACHIEVEMENTS) {
    const at = unlocked.get(a.id);
    list.append(
      h(
        'div',
        { class: `ach${at ? '' : ' locked'}` },
        h('div', { class: 'icon' }, a.icon),
        h(
          'div',
          null,
          h('div', { class: 't' }, a.name),
          h('div', { class: 'd' }, a.desc),
          h('div', { class: 'rw' }, `+${formatGs(a.coins)}${a.skin ? ` · skin ${SKIN_MAP[a.skin]?.name || a.skin}` : ''}`),
          at ? h('div', { class: 'd' }, `✓ ${new Date(at).toLocaleDateString('es-PY')}`) : null
        )
      )
    );
  }
  body.append(list);
  if (app.user) {
    api
      .get('/me')
      .then(({ user }) => {
        const before = unlocked.size;
        app.setUser(user);
        if ((user.achievements || []).length !== before) renderAchievements(app, body);
      })
      .catch(() => {});
  }
}

// ------------------------------------------------------------------ Ranking

export function renderRanking(app, body, metric = 'xp') {
  clear(body).append(h('p', { class: 'muted' }, 'Cargando ranking…'));
  api
    .get(`/leaderboard?by=${encodeURIComponent(metric)}&limit=30`)
    .then((data) => {
      clear(body);
      const tabs = h('div', { class: 'tabs' });
      for (const [k, label] of Object.entries(data.metrics)) {
        tabs.append(h('button', { class: `tab${k === data.metric ? ' active' : ''}`, onclick: () => renderRanking(app, body, k) }, label));
      }
      body.append(tabs);
      if (!data.top.length) {
        body.append(h('p', { class: 'muted' }, 'Todavía no hay nadie en el ranking. ¡Creá una cuenta y sé el primero!'));
        return;
      }
      const fmt = (v) => (data.metric === 'time' ? formatDuration(v) : formatThousands(v));
      const table = h('table', { class: 'table' }, h('tr', null, h('th', null, '#'), h('th', null, 'Jugador'), h('th', { class: 'num' }, 'Nivel'), h('th', { class: 'num' }, data.label)));
      for (const r of data.top) {
        table.append(
          h(
            'tr',
            { class: r.you ? 'you' : null },
            h('td', null, r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : String(r.rank)),
            h('td', null, skinImg(r.skin), r.displayName),
            h('td', { class: 'num' }, String(r.level)),
            h('td', { class: 'num' }, fmt(r.value))
          )
        );
      }
      body.append(table);
      if (data.me && !data.top.some((r) => r.you)) {
        body.append(h('p', { class: 'muted', style: { textAlign: 'center' } }, `Tu puesto: #${data.me.rank} (${fmt(data.me.value)})`));
      }
    })
    .catch((err) => clear(body).append(formError(err)));
}

// ------------------------------------------------------------------ Ajustes

export function renderSettings(app, body) {
  clear(body);
  const s = app.settings;
  const wrap = h('div', { class: 'settings' });
  const toggle = (key, label, sub) => {
    const input = h('input', { type: 'checkbox' });
    input.checked = !!s[key];
    input.addEventListener('change', () => app.updateSettings({ [key]: input.checked }));
    return h('label', { class: 'setting' }, h('span', { class: 'lbl' }, label, sub ? h('span', { class: 'sub' }, sub) : null), h('span', { class: 'switch' }, input, h('span')));
  };
  const select = (key, label, options, sub) => {
    const sel = h('select', null, ...options.map(([v, t]) => h('option', { value: v }, t)));
    sel.value = s[key];
    sel.addEventListener('change', () => app.updateSettings({ [key]: sel.value }));
    return h('label', { class: 'setting' }, h('span', { class: 'lbl' }, label, sub ? h('span', { class: 'sub' }, sub) : null), sel);
  };
  const range = h('input', { type: 'range', min: 0, max: 1, step: 0.05 });
  range.value = s.volume;
  range.addEventListener('input', () => app.updateSettings({ volume: Number(range.value) }));

  wrap.append(
    h('h3', { class: 'section-title' }, 'Pantalla'),
    select('theme', 'Tema', [['dark', 'Noche'], ['light', 'Día'], ['tierra', 'Tierra colorada']]),
    select('quality', 'Calidad gráfica', [['auto', 'Automática'], ['high', 'Alta'], ['medium', 'Media'], ['low', 'Baja (celulares viejos)']]),
    toggle('showNames', 'Mostrar nombres'),
    toggle('showMass', 'Mostrar masa'),
    toggle('showSkins', 'Mostrar skins'),
    toggle('showGrid', 'Mostrar cuadrícula'),
    toggle('showMinimap', 'Mostrar minimapa'),
    toggle('showChat', 'Mostrar chat'),
    toggle('showBotTag', 'Marcar a los bots', 'Muestra "BOT" sobre los bots'),
    toggle('showFps', 'Mostrar FPS y ping'),
    h('h3', { class: 'section-title' }, 'Sonido y vibración'),
    h('label', { class: 'setting' }, h('span', { class: 'lbl' }, 'Volumen'), range),
    toggle('vibration', 'Vibrar en el celular'),
    h('h3', { class: 'section-title' }, 'Celular'),
    select('joystickSide', 'Joystick', [['left', 'A la izquierda'], ['right', 'A la derecha']]),
    select('joystickMode', 'Tipo de joystick', [['floating', 'Flotante (donde tocás)'], ['fixed', 'Fijo']]),
    select('buttonSize', 'Tamaño de botones', [['s', 'Chicos'], ['m', 'Medianos'], ['l', 'Grandes']]),
    h('div', { class: 'row buttons' }, h('button', { class: 'btn ghost small', onclick: () => { app.updateSettings({ ...DEFAULT_SETTINGS }); renderSettings(app, body); } }, 'Restablecer')),
    h('p', { class: 'hint', style: { textAlign: 'center' } }, app.user ? 'Los ajustes se guardan en tu cuenta.' : 'Los ajustes se guardan en este navegador.')
  );
  body.append(wrap);
}

// ------------------------------------------------------------------ Invitar

export function renderInvite(app, body) {
  clear(body).append(h('p', { class: 'muted' }, 'Buscando direcciones…'));
  api
    .get('/server-info')
    .then((info) => {
      clear(body);
      const boxes = h('div', { class: 'invite' });
      const copyBtn = (url) =>
        h('button', {
          class: 'btn small',
          onclick: async () => {
            try {
              await navigator.clipboard.writeText(url);
              toast({ icon: '📋', title: 'Link copiado' });
            } catch {
              prompt('Copiá este link:', url);
            }
          },
        }, 'Copiar link');
      if (info.publicUrl) {
        boxes.append(
          h('div', { class: 'invite-box' }, h('b', null, '🌎 Por Internet'), h('p', { class: 'hint' }, 'Para amigos en cualquier lugar (datos móviles u otra WiFi).'), h('img', { src: `/api/qr.svg?target=public&t=${Date.now()}`, alt: 'QR' }), h('code', null, info.publicUrl), copyBtn(info.publicUrl))
        );
      } else {
        boxes.append(h('div', { class: 'invite-box' }, h('b', null, '🌎 Por Internet'), h('p', { class: 'muted' }, 'El túnel no está activo. En la PC del servidor abrí 2-INICIAR.bat para tener un link público.')));
      }
      info.lanUrls.slice(0, 2).forEach((url, i) => {
        boxes.append(
          h('div', { class: 'invite-box' }, h('b', null, '📶 Misma WiFi'), h('p', { class: 'hint' }, 'Para los que están conectados a tu misma red.'), h('img', { src: `/api/qr.svg?target=lan${i}`, alt: 'QR' }), h('code', null, url), copyBtn(url))
        );
      });
      body.append(h('p', null, 'Escaneá el código con la cámara del celular o compartí el link:'), boxes);
    })
    .catch((err) => clear(body).append(formError(err)));
}

// ------------------------------------------------------------------ Cómo jugar

export function renderHelp(app, body) {
  clear(body);
  const li = (a, b) => h('tr', null, h('td', null, h('b', null, a)), h('td', null, b));
  body.append(
    h('p', null, 'Sos una célula en un mapa lleno de chipitas 🥯. Comé para crecer y comete a los que sean más chicos que vos. ¡Cuidado con los más grandes!'),
    h('h3', { class: 'section-title' }, 'En la PC'),
    h('table', { class: 'table' }, li('Mouse', 'Mover'), li('Espacio', 'Dividirte (para atacar)'), li('W (mantener)', 'Expulsar masa'), li('Enter', 'Chat'), li('Esc', 'Pausa / menú')),
    h('h3', { class: 'section-title' }, 'En el celular'),
    h('table', { class: 'table' }, li('Joystick', 'Mové el dedo en la mitad de la pantalla'), li('Dividir', 'Botón rojo'), li('Expulsar', 'Botón azul (mantener)'), li('💬', 'Chat')),
    h('h3', { class: 'section-title' }, 'Modos'),
    h('p', null, h('b', null, '🥯 Clásico: '), 'todos contra todos, sin fin. Hay bots siempre para que nunca estés solo.'),
    h('p', null, h('b', null, '🌵 Batalla real: '), 'rondas donde la zona se achica. Si quedás afuera (en rojo), perdés masa. ¡El último que queda gana!'),
    h('h3', { class: 'section-title' }, 'Consejos'),
    h('ul', null, ...TIPS.map((t) => h('li', null, t))),
    h('h3', { class: 'section-title' }, 'Mini diccionario'),
    h('table', { class: 'table' }, li('Jaha', '¡Vamos!'), li("Mba'éichapa", '¿Qué tal?'), li('Aguyje', 'Gracias'), li('Iporã', '¡Qué lindo! / ¡Bien!'), li('Mbarete', 'Fuerte'), li('Tuicha', 'Grande'), li('Chake', '¡Cuidado!'))
  );
}

export const PANELS = {
  account: { title: '👤 Cuenta', render: renderAccount },
  shop: { title: '🛍️ Tienda de skins', render: renderShop },
  achievements: { title: '🏅 Logros', render: renderAchievements },
  ranking: { title: '🏆 Ranking', render: renderRanking },
  settings: { title: '⚙️ Ajustes', render: renderSettings },
  invite: { title: '📲 Invitar amigos', render: renderInvite },
  help: { title: '❓ Cómo jugar', render: renderHelp },
};

export { FREE_SKINS, SKINS };
