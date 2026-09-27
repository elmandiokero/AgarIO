// Pantallas: muerte / resultado, sala de espera de Batalla real, podio y pausa.
import { $, h, clear } from './dom.js';
import { formatThousands, formatDuration, formatGs, hueColor } from '/shared/formulas.js';
import { skinUrl, SKIN_MAP } from '/shared/catalog/skins.js';
import { PHRASES, REASONS, pick } from '../i18n.js';

function stat(label, value) {
  return h('div', { class: 'stat' }, h('b', null, value), h('small', null, label));
}

export function rewardsBlock(result, { onRegister } = {}) {
  const box = h('div', { class: 'rewards' });
  if (!result) return box;
  const r = result.rewards || { xp: 0, coins: 0 };
  if (r.tooShort) {
    box.append(h('div', { class: 'reward-note' }, 'Sobreviví al menos 15 segundos para ganar premios.'));
    return box;
  }
  if (result.guest) {
    box.append(
      h('div', { class: 'reward-line' }, 'Hubieras ganado ', h('span', { class: 'xp' }, `+${r.xp} XP`), ' y ', h('span', { class: 'gs' }, `+${formatGs(r.coins)}`)),
      h('div', { class: 'reward-note' }, 'Creá una cuenta gratis para guardar tus premios, stats, skins y logros.')
    );
    if (onRegister) box.append(h('button', { class: 'btn gold small', onclick: onRegister }, '✨ Crear cuenta'));
    return box;
  }
  box.append(h('div', { class: 'reward-line' }, h('span', { class: 'xp' }, `+${r.xp} XP`), '   ', h('span', { class: 'gs' }, `+${formatGs(r.coins)}`)));
  const badges = h('div', { class: 'reward-badges' });
  if (result.levelAfter > result.levelBefore) {
    badges.append(h('span', { class: 'badge' }, `⬆️ ¡Nivel ${result.levelAfter}! +${formatGs(result.levelUpCoins)}`));
  }
  for (const a of result.newAchievements || []) badges.append(h('span', { class: 'badge' }, `${a.icon} ${a.name}`));
  for (const s of result.newSkins || []) badges.append(h('span', { class: 'badge' }, `🎨 Skin nueva: ${SKIN_MAP[s]?.name || s}`));
  if (badges.children.length) box.append(badges);
  box.append(h('div', { class: 'reward-note' }, `Tenés ${formatGs(result.coins)}`));
  return box;
}

export class Screens {
  constructor(app) {
    this.app = app;
    this.death = $('#death');
    this.lobby = $('#br-lobby');
    this.podium = $('#podium');
    this.pause = $('#pause');
    $('#btn-respawn').addEventListener('click', () => app.respawnOrQueue());
    $('#btn-spectate').addEventListener('click', () => app.spectate());
    $('#btn-to-menu').addEventListener('click', () => app.leaveToMenu());
    $('#btn-lobby-leave').addEventListener('click', () => app.leaveToMenu());
    $('#btn-resume').addEventListener('click', () => app.togglePause(false));
    $('#btn-quit').addEventListener('click', () => {
      app.togglePause(false);
      app.leaveToMenu();
    });
    $('#btn-pause-settings').addEventListener('click', () => app.openPanel('settings'));
  }

  hideAll() {
    this.death.hidden = true;
    this.lobby.hidden = true;
    this.podium.hidden = true;
    this.pause.hidden = true;
  }

  showDeath(msg) {
    const s = msg.summary || {};
    const isBr = msg.mode === 'br';
    let title;
    if (isBr && msg.win) title = `🏆 ${pick(PHRASES.win)}`;
    else if (isBr && msg.place) title = `Puesto #${msg.place} de ${msg.of}`;
    else if (msg.reason === 'zone') title = pick(PHRASES.deathZone);
    else title = pick(PHRASES.death);
    $('#death-title').textContent = title;
    let sub = REASONS[msg.reason] || '';
    if (msg.reason === 'eaten' && msg.killer) sub = `Te comió ${msg.killer}${s.killerIsBot ? ' 🤖' : ''}`;
    $('#death-sub').textContent = sub;
    const grid = clear($('#death-stats'));
    grid.append(
      stat('Tiempo vivo', formatDuration(s.durationMs || 0)),
      stat('Masa máxima', formatThousands(s.maxMass || 0)),
      stat('Chipitas', formatThousands(s.foodEaten || 0)),
      stat('Jugadores comidos', formatThousands((s.humanKills || 0) + (s.botKills || 0)))
    );
    if (isBr && msg.place) grid.append(stat('Puesto', `#${msg.place}/${msg.of}`));
    else if (s.bestRank) grid.append(stat('Mejor puesto', `#${s.bestRank}`));
    clear($('#death-rewards')).append(rewardsBlock(msg.result, { onRegister: () => this.app.openPanel('account', { tab: 'register' }) }));
    $('#btn-respawn').hidden = isBr;
    $('#btn-spectate').textContent = isBr ? 'Mirar la ronda' : 'Espectar';
    this.death.hidden = false;
  }

  hideDeath() {
    this.death.hidden = true;
  }

  showLobby(br) {
    if (!br) return;
    const text = $('#lobby-text');
    const sub = $('#lobby-sub');
    if (br.state === 'lobby') {
      if (br.endsIn !== null) text.textContent = `¡Empieza en ${Math.ceil(br.endsIn / 1000)} s!`;
      else text.textContent = 'Esperando jugadores…';
      const bots = this.app.rooms?.br?.bots ?? 0;
      sub.textContent = `${br.queued} ${br.queued === 1 ? 'persona anotada' : 'personas anotadas'} + ${bots} bots · ¡Invitá a tus amigos!`;
    }
    this.lobby.hidden = false;
  }

  hideLobby() {
    this.lobby.hidden = true;
  }

  showPodium(br, myResult) {
    const wrap = clear($('#podium-places'));
    const byPlace = new Map((br.podium || []).map((p) => [p.place, p]));
    for (const place of [2, 1, 3]) {
      const p = byPlace.get(place);
      if (!p) continue;
      const ball = h('div', { class: 'ball' });
      ball.style.backgroundColor = hueColor(p.hue);
      if (p.skin) ball.style.backgroundImage = `url(${skinUrl(p.skin)})`;
      wrap.append(
        h('div', { class: `podium-place p${place}` }, ball, h('div', { class: 'pname' }, `${p.name}${p.bot ? ' 🤖' : ''}`), h('div', { class: 'step' }, String(place)))
      );
    }
    const sub = $('#podium-sub');
    clear(sub);
    if (myResult) {
      sub.append(h('div', null, `Tu puesto: #${myResult.place} de ${myResult.of}`));
      sub.append(rewardsBlock(myResult.result, { onRegister: () => this.app.openPanel('account', { tab: 'register' }) }));
    } else {
      sub.append('La próxima ronda arranca en unos segundos…');
    }
    this.death.hidden = true;
    this.lobby.hidden = true;
    this.podium.hidden = false;
  }

  hidePodium() {
    this.podium.hidden = true;
  }

  setPause(on) {
    this.pause.hidden = !on;
  }
}
