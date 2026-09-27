// Silencia sólo el aviso "SQLite is an experimental feature" de node:sqlite.
// Debe importarse antes de cargar node:sqlite (que se carga con import() dinámico).
const original = process.emitWarning;
if (!original.__jahaPatched) {
  const patched = function (warning, ...args) {
    const msg = typeof warning === 'string' ? warning : warning?.message || '';
    const type = typeof args[0] === 'string' ? args[0] : args[0]?.type || warning?.name;
    if (type === 'ExperimentalWarning' && /sqlite/i.test(msg)) return;
    return original.call(process, warning, ...args);
  };
  patched.__jahaPatched = true;
  process.emitWarning = patched;
}
