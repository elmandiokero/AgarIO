// Personalidades de los bots.
export const PROFILES = {
  tranqui: { id: 'tranqui', reactionMs: 600, viewMul: 0.6, aggression: 0, ignoreThreat: 0.3, huntBias: 0.35, virusLookahead: false, zoneEarly: false },
  normal: { id: 'normal', reactionMs: 350, viewMul: 0.85, aggression: 0.2, ignoreThreat: 0.05, huntBias: 0.75, virusLookahead: false, zoneEarly: false },
  capo: { id: 'capo', reactionMs: 180, viewMul: 1.0, aggression: 0.6, ignoreThreat: 0, huntBias: 1, virusLookahead: true, zoneEarly: true },
};

export function pickProfile(rng, mix = { tranqui: 0.5, normal: 0.35, capo: 0.15 }) {
  const total = Object.values(mix).reduce((a, b) => a + b, 0) || 1;
  let r = rng.next() * total;
  for (const [id, w] of Object.entries(mix)) {
    r -= w;
    if (r <= 0 && PROFILES[id]) return PROFILES[id];
  }
  return PROFILES.normal;
}
