// Reglas de logros. scope:
//  - life: se evalúa con los datos de la vida actual (también en vivo, 1 vez por segundo)
//  - total: con las estadísticas acumuladas
//  - profile: con el perfil (monedas, skins)

export const RULES = {
  primer_bocado: { scope: 'life', test: ({ life }) => life.cellsEaten >= 1 },
  mbarete: { scope: 'life', test: ({ life }) => life.maxMass >= 1000 },
  tuicha: { scope: 'life', test: ({ life }) => life.maxMass >= 5000 },
  karai_guasu: { scope: 'life', test: ({ life }) => life.maxMass >= 10000 },
  cazador: { scope: 'life', test: ({ life }) => life.humanKills + life.botKills >= 10 },
  dividir_conquistar: { scope: 'life', test: ({ life }) => !!life.splitKill },
  sobreviviente: { scope: 'life', test: ({ life }) => life.durationMs >= 10 * 60 * 1000 },
  numero_uno: { scope: 'life', test: ({ life }) => life.mode === 'ffa' && !!life.reachedTop1 },
  venganza: { scope: 'life', test: ({ life }) => !!life.revenge },
  campeon_br: { scope: 'life', end: true, test: ({ life, cfg }) => life.mode === 'br' && life.brPlace === 1 && life.brParticipants >= (cfg?.championMin ?? 4) },
  podio: { scope: 'life', end: true, test: ({ life }) => life.mode === 'br' && life.brPlace > 0 && life.brPlace <= 3 && life.brParticipants >= 3 },
  noctambulo: { scope: 'life', test: ({ life }) => life.hourLocal >= 0 && life.hourLocal < 5 },
  chipero: { scope: 'total', test: ({ stats }) => stats.food_eaten >= 1000 },
  chipero_guasu: { scope: 'total', test: ({ stats }) => stats.food_eaten >= 10000 },
  tuna_poty: { scope: 'total', test: ({ stats }) => stats.viruses_popped >= 25 },
  jaguarete: { scope: 'total', test: ({ stats }) => stats.players_eaten + stats.bots_eaten >= 100 },
  terere_rupa: { scope: 'total', test: ({ stats }) => stats.games_played >= 10 },
  vicio: { scope: 'total', test: ({ stats }) => stats.games_played >= 100 },
  ahorrista: { scope: 'profile', test: ({ profile }) => profile.coins >= 100000 },
  coleccionista: { scope: 'profile', test: ({ profile }) => profile.skinCount >= 10 },
};

/**
 * Devuelve los ids de logros recién cumplidos.
 * @param {{life?: object, stats?: object, profile?: object, cfg?: object}} ctx
 * @param {Set<string>} unlocked ya desbloqueados
 * @param {{live?: boolean}} opts live = sólo reglas de la vida que no requieren fin de ronda
 */
export function evaluateAchievements(ctx, unlocked, { live = false } = {}) {
  const out = [];
  for (const [id, rule] of Object.entries(RULES)) {
    if (unlocked.has(id)) continue;
    if (rule.scope === 'life' && !ctx.life) continue;
    if (rule.scope === 'total' && !ctx.stats) continue;
    if (rule.scope === 'profile' && !ctx.profile) continue;
    if (live && (rule.scope !== 'life' || rule.end)) continue;
    try {
      if (rule.test(ctx)) out.push(id);
    } catch {
      /* datos incompletos: ignorar */
    }
  }
  return out;
}
