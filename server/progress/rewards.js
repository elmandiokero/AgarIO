// Premios (XP y ₲) de una vida / ronda. Función pura.

/**
 * @param {object} s resumen de la vida (ver Room.endLife)
 * @param {object} cfg config.progression
 */
export function computeRewards(s, cfg) {
  const sec = Math.max(0, s.durationMs / 1000);
  const isBr = s.mode === 'br' && s.brPlace > 0;
  if (!isBr && sec < cfg.minLifeSeconds) {
    return { xp: 0, coins: 0, tooShort: true, breakdown: { mass: 0, kills: 0, time: 0, rank: 0 } };
  }
  const mass = Math.floor((s.maxMass || 0) / 8);
  const kills = 30 * (s.humanKills || 0) + 12 * (s.botKills || 0);
  const time = Math.floor(sec / 6);
  let rank = 0;
  if (s.mode === 'ffa' && s.bestRank > 0) {
    rank = s.bestRank === 1 ? 60 : s.bestRank <= 3 ? 30 : s.bestRank <= 10 ? 10 : 0;
  }
  if (isBr) {
    const p = s.brPlace;
    const n = s.brParticipants || 1;
    rank = p === 1 ? 250 : p <= 3 ? 120 : p <= 5 ? 60 : p <= n / 2 ? 25 : 0;
  }
  const xp = Math.min(cfg.maxXpPerLife, mass + kills + time + rank);
  return { xp, coins: xp * cfg.coinsPerXp, tooShort: false, breakdown: { mass, kills, time, rank } };
}
