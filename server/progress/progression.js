// Aplica el resultado de una vida a la cuenta: estadísticas, historial, XP, ₲, niveles, skins y logros.
// Todo en una sola transacción.
import { levelFromXp } from '../../shared/formulas.js';
import { skinsForLevelRange, SKIN_MAP } from '../../shared/catalog/skins.js';
import { ACHIEVEMENT_MAP } from '../../shared/catalog/achievements.js';
import { computeRewards } from './rewards.js';
import { evaluateAchievements } from './achievements.js';

export function createProgression(repos, config, clock = { now: () => Date.now() }) {
  const pcfg = config.progression;
  const achCfg = { championMin: config.br?.championMinParticipants ?? 4 };

  function unlockAchievements(userId, ids, now, out) {
    let coins = 0;
    for (const id of ids) {
      if (!repos.grantAchievement(userId, id, now)) continue;
      const a = ACHIEVEMENT_MAP[id];
      if (!a) continue;
      coins += a.coins || 0;
      out.achievements.push({ id, name: a.name, icon: a.icon, coins: a.coins || 0, skin: a.skin || null });
      if (a.skin && SKIN_MAP[a.skin] && repos.grantSkin(userId, a.skin, 'achievement', now)) out.skins.push(a.skin);
    }
    return coins;
  }

  function getUnlocked(userId) {
    return new Set(repos.getAchievements(userId).map((r) => r.achievement_id));
  }

  return {
    getUnlocked,

    /**
     * @param {number} userId
     * @param {object} s resumen de la vida
     */
    applyLifeResult(userId, s) {
      const now = clock.now();
      return repos.tx(() => {
        const user = repos.getUser(userId);
        if (!user) return null;
        const rewards = computeRewards(s, pcfg);
        const levelBefore = levelFromXp(user.xp);
        if (rewards.tooShort) {
          // Vida demasiado corta: no suma partidas, historial ni logros (evita farmear entrando y saliendo)
          return {
            rewards, xp: user.xp, coins: user.coins, levelBefore, levelAfter: levelBefore, levelUpCoins: 0,
            newSkins: [], newAchievements: [], achievementCoins: 0, ignored: true,
          };
        }
        const kills = (s.humanKills || 0) + (s.botKills || 0);
        repos.updateStats(userId, {
          add: {
            games_played: 1,
            games_ffa: s.mode === 'ffa' ? 1 : 0,
            games_br: s.mode === 'br' ? 1 : 0,
            deaths: s.reason === 'eaten' || s.reason === 'zone' ? 1 : 0,
            time_alive_ms: s.durationMs,
            total_mass_gained: s.massGained,
            food_eaten: s.foodEaten,
            cells_eaten: s.cellsEaten,
            players_eaten: s.humanKills,
            bots_eaten: s.botKills,
            viruses_popped: s.virusesPopped,
            splits: s.splits,
            ejects: s.ejects,
            times_top1_ffa: s.mode === 'ffa' && s.reachedTop1 ? 1 : 0,
            br_wins: s.mode === 'br' && s.brPlace === 1 ? 1 : 0,
            br_top3: s.mode === 'br' && s.brPlace > 0 && s.brPlace <= 3 ? 1 : 0,
            xp_earned_total: rewards.xp,
            coins_earned_total: rewards.coins,
          },
          max: { longest_life_ms: s.durationMs, max_mass: s.maxMass },
          min: {
            best_rank_ffa: s.mode === 'ffa' && s.bestRank > 0 ? s.bestRank : 0,
            best_br_place: s.mode === 'br' && s.brPlace > 0 ? s.brPlace : 0,
          },
        });
        repos.insertMatch({
          userId, mode: s.mode, startedAt: s.startedAt, endedAt: s.endedAt ?? now, durationMs: Math.round(s.durationMs),
          maxMass: Math.round(s.maxMass), finalMass: Math.round(s.finalMass || 0), kills: s.humanKills || 0,
          botKills: s.botKills || 0, foodEaten: s.foodEaten || 0, bestRank: s.bestRank || null,
          brPlace: s.brPlace || null, brParticipants: s.brParticipants || null, xp: rewards.xp, coins: rewards.coins,
          reason: s.reason, killerName: s.killerName || null,
        });

        let xp = user.xp + rewards.xp;
        let coins = user.coins + rewards.coins;
        if (rewards.coins) repos.ledger(userId, rewards.coins, 'partida', s.mode, now);
        const levelAfter = levelFromXp(xp);
        const out = { achievements: [], skins: [] };
        let levelUpCoins = 0;
        for (let l = levelBefore + 1; l <= levelAfter; l++) levelUpCoins += l * pcfg.levelUpCoinsPerLevel;
        if (levelUpCoins) {
          coins += levelUpCoins;
          repos.ledger(userId, levelUpCoins, 'nivel', String(levelAfter), now);
        }
        for (const skin of skinsForLevelRange(levelBefore, levelAfter)) {
          if (repos.grantSkin(userId, skin, 'level', now)) out.skins.push(skin);
        }

        // Logros: vida + totales; luego perfil (depende de monedas y skins ya actualizadas)
        const unlocked = getUnlocked(userId);
        const stats = repos.getStats(userId);
        const life = { ...s, maxMass: s.maxMass || 0 };
        let achCoins = unlockAchievements(userId, evaluateAchievements({ life, stats, cfg: achCfg }, unlocked), now, out);
        coins += achCoins;
        for (const a of out.achievements) unlocked.add(a.id);
        const profile = { coins, skinCount: repos.countSkins(userId) };
        const more = unlockAchievements(userId, evaluateAchievements({ profile }, unlocked), now, out);
        coins += more;
        achCoins += more;
        if (achCoins) repos.ledger(userId, achCoins, 'logros', null, now);

        repos.setXpCoins(userId, xp, coins);
        return {
          rewards,
          xp,
          coins,
          levelBefore,
          levelAfter,
          levelUpCoins,
          newSkins: out.skins,
          newAchievements: out.achievements,
          achievementCoins: achCoins,
        };
      });
    },

    /** Logros de perfil (monedas / skins), por ejemplo después de comprar. */
    checkProfile(userId) {
      const now = clock.now();
      return repos.tx(() => {
        const user = repos.getUser(userId);
        if (!user) return [];
        const unlocked = getUnlocked(userId);
        const ids = evaluateAchievements({ profile: { coins: user.coins, skinCount: repos.countSkins(userId) } }, unlocked);
        if (!ids.length) return [];
        const out = { achievements: [], skins: [] };
        const coins = unlockAchievements(userId, ids, now, out);
        if (coins) repos.addCoins(userId, coins, 'logros', null, now);
        return out.achievements;
      });
    },

    /**
     * Logros en vivo (durante la partida). Devuelve la lista de logros nuevos.
     * @param {Set<string>} unlocked se actualiza con los nuevos
     */
    checkLive(userId, life, unlocked) {
      const ids = evaluateAchievements({ life, cfg: achCfg }, unlocked, { live: true });
      if (!ids.length) return [];
      const now = clock.now();
      return repos.tx(() => {
        const out = { achievements: [], skins: [] };
        const coins = unlockAchievements(userId, ids, now, out);
        if (coins) repos.addCoins(userId, coins, 'logros', null, now);
        for (const id of ids) unlocked.add(id);
        return out.achievements;
      });
    },
  };
}
