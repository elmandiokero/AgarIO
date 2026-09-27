import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanName, cleanChat, graphemeLength, createWordFilter, USERNAME_RE } from '../../shared/sanitize.js';
import { validateSettings, DEFAULT_SETTINGS } from '../../shared/settings-schema.js';

test('nombres: quita invisibles, respeta ñ y g̃, limita largo', () => {
  assert.equal(cleanName('  Ka​rai\u0000  Pedro  '), 'Karai Pedro');
  assert.equal(cleanName('Ñandutí g̃'), 'Ñandutí g̃');
  assert.equal(graphemeLength(cleanName('x'.repeat(40))), 16);
  assert.equal(cleanName('‮admin'), 'admin');
  const zalgo = cleanName('Z̴̡̛a̷');
  assert.ok(zalgo.length <= 4, 'como máximo una marca por letra');
  assert.equal(cleanName('<script>'), 'script');
});

test('chat: limita y limpia', () => {
  assert.equal(cleanChat('hola\n\tche'), 'hola che');
  assert.equal(graphemeLength(cleanChat('a'.repeat(500))), 120);
});

test('filtro de palabras sin falsos positivos comunes', () => {
  const f = createWordFilter(['chuchi']);
  assert.equal(f.test('computadora'), false);
  assert.equal(f.test('Karai Pedro'), false);
  assert.equal(f.test('Hijo_De_Puta'), true);
  assert.equal(f.test('p u t 4'), true);
  assert.equal(f.test('m1erd4'), true);
  assert.equal(f.test('chuchi'), true);
  assert.equal(f.censor('hola puta'), 'hola ****');
});

test('usuarios válidos', () => {
  assert.ok(USERNAME_RE.test('karai_pedro'));
  assert.ok(!USERNAME_RE.test('ab'));
  assert.ok(!USERNAME_RE.test('con espacio'));
});

test('ajustes: lista blanca y rangos', () => {
  const s = validateSettings({ theme: 'tierra', volume: 7, showMass: 'si', hack: true, quality: 'ultra' });
  assert.equal(s.theme, 'tierra');
  assert.equal(s.volume, 1);
  assert.equal(s.showMass, DEFAULT_SETTINGS.showMass);
  assert.equal(s.quality, DEFAULT_SETTINGS.quality);
  assert.equal('hack' in s, false);
  assert.deepEqual(validateSettings(null), { ...DEFAULT_SETTINGS });
});
