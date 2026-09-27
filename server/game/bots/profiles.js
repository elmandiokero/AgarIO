// Personalidades de los bots y niveles de dificultad.
//
//  reactionMs   cada cuánto piensa un plan nuevo
//  viewMul      qué tan lejos "ve" (multiplica su campo visual)
//  aggression   probabilidad de dividirse para atacar cuando hay oportunidad segura
//  huntBias     cuánto le interesan las presas frente a la comida
//  caution      cuánto pesa el peligro (más alto = más miedoso)
//  noise        error de puntería (radianes aprox.)
//  shoot        probabilidad de dispararle un cactus a un jugador grande cuando se puede
//  doubleSplit  puede dividirse dos veces para alcanzar presas lejanas
//  predict      anticipa hacia dónde se mueven los demás
//  reflex       distancia (px) a la que reacciona al instante ante un peligro
export const PROFILES = {
  tranqui: { id: 'tranqui', reactionMs: 520, viewMul: 0.8, aggression: 0.05, huntBias: 0.35, caution: 1.25, noise: 0.22, shoot: 0, doubleSplit: false, predict: false, reflex: 60 },
  normal: { id: 'normal', reactionMs: 320, viewMul: 0.95, aggression: 0.3, huntBias: 0.8, caution: 1.0, noise: 0.12, shoot: 0.15, doubleSplit: false, predict: true, reflex: 110 },
  cazador: { id: 'cazador', reactionMs: 240, viewMul: 1.05, aggression: 0.65, huntBias: 1.35, caution: 0.8, noise: 0.08, shoot: 0.35, doubleSplit: true, predict: true, reflex: 140 },
  capo: { id: 'capo', reactionMs: 170, viewMul: 1.15, aggression: 0.55, huntBias: 1.1, caution: 1.1, noise: 0.04, shoot: 0.7, doubleSplit: true, predict: true, reflex: 200 },
};

export const DIFFICULTY = {
  facil: { reaction: 1.45, aggression: 0.45, caution: 0.85, noise: 1.8, view: 0.85, shoot: 0 },
  normal: { reaction: 1, aggression: 1, caution: 1, noise: 1, view: 1, shoot: 1 },
  dificil: { reaction: 0.75, aggression: 1.3, caution: 1.1, noise: 0.5, view: 1.1, shoot: 1.3 },
};

/** Aplica la dificultad global a una personalidad. */
export function withDifficulty(profile, difficulty = 'normal') {
  const d = DIFFICULTY[difficulty] || DIFFICULTY.normal;
  return {
    ...profile,
    reactionMs: profile.reactionMs * d.reaction,
    aggression: Math.min(1, profile.aggression * d.aggression),
    caution: profile.caution * d.caution,
    noise: profile.noise * d.noise,
    viewMul: profile.viewMul * d.view,
    shoot: Math.min(1, profile.shoot * d.shoot),
    difficulty: DIFFICULTY[difficulty] ? difficulty : 'normal',
  };
}

export function pickProfile(rng, mix = { tranqui: 0.35, normal: 0.35, cazador: 0.15, capo: 0.15 }, difficulty = 'normal') {
  const entries = Object.entries(mix).filter(([id, w]) => PROFILES[id] && w > 0);
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let chosen = PROFILES.normal;
  if (total > 0) {
    let r = rng.next() * total;
    for (const [id, w] of entries) {
      r -= w;
      if (r <= 0) {
        chosen = PROFILES[id];
        break;
      }
    }
  }
  return withDifficulty(chosen, difficulty);
}
