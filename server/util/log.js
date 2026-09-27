// Logger mínimo con hora local.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
let current = LEVELS[process.env.JAHA_LOG_LEVEL] ?? LEVELS.info;

function ts() {
  const d = new Date();
  return d.toTimeString().slice(0, 8);
}

export const log = {
  setLevel(name) { current = LEVELS[name] ?? current; },
  debug: (...a) => { if (current <= LEVELS.debug) console.log(`[${ts()}]`, ...a); },
  info: (...a) => { if (current <= LEVELS.info) console.log(`[${ts()}]`, ...a); },
  warn: (...a) => { if (current <= LEVELS.warn) console.warn(`[${ts()}] ⚠`, ...a); },
  error: (...a) => { if (current <= LEVELS.error) console.error(`[${ts()}] ✖`, ...a); },
};
