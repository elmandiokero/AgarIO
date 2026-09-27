// Reloj inyectable (los tests usan uno manual).
export const systemClock = {
  now: () => Date.now(),
  perf: () => performance.now(),
};

export function createManualClock(start = 1_700_000_000_000) {
  let t = start;
  return {
    now: () => t,
    perf: () => t,
    advance(ms) { t += ms; },
    set(ms) { t = ms; },
  };
}
