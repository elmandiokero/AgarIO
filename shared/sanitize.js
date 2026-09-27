// Saneamiento de nombres y chat. Permite ñ, acentos y g̃ (guaraní),
// elimina caracteres invisibles/de control y limita el "zalgo".
import { LIMITS } from './constants.js';

const INVISIBLE = /[\u0000-\u001f\u007f-\u009f­؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁯ㅤ﻿ﾠ￰-￻]/gu;
const COMBINING = /\p{M}/u;

let segmenter = null;
function getSegmenter() {
  if (segmenter === null) {
    segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('es', { granularity: 'grapheme' }) : false;
  }
  return segmenter;
}

export function graphemes(s) {
  const seg = getSegmenter();
  if (seg) return Array.from(seg.segment(s), (x) => x.segment);
  return Array.from(s);
}

export function graphemeLength(s) {
  return graphemes(s).length;
}

/** Quita control/invisibles y deja como máximo una marca combinante por letra. */
function stripWeird(s, allowed) {
  s = String(s ?? '').normalize('NFC').replace(INVISIBLE, '');
  let out = '';
  let marks = 0;
  for (const ch of s) {
    if (COMBINING.test(ch)) {
      if (marks >= 1) continue;
      marks++;
      out += ch;
      continue;
    }
    marks = 0;
    if (allowed && !allowed.test(ch)) continue;
    out += ch;
  }
  return out.replace(/\s+/g, ' ').trim();
}

const NAME_CHARS = /[\p{L}\p{N} ._\-'!?¡¿#*+~^()]/u;

export function cleanName(raw, max = LIMITS.NAME_MAX) {
  let s = stripWeird(raw, NAME_CHARS);
  const g = graphemes(s);
  if (g.length > max) s = g.slice(0, max).join('').trim();
  return s;
}

const CHAT_CHARS = /[\p{L}\p{N}\p{P}\p{S} ]/u;

export function cleanChat(raw, max = LIMITS.CHAT_MAX) {
  let s = stripWeird(raw, CHAT_CHARS);
  const g = graphemes(s);
  if (g.length > max) s = g.slice(0, max).join('');
  return s;
}

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' };

/** Normaliza para filtrar: minúsculas, sin acentos, sin leetspeak, sin separadores. */
export function normalizeForFilter(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[013457@$!]/g, (c) => LEET[c] || c);
}

/** Palabras bloqueadas por defecto (se pueden agregar más en config.json → chat.badWords). */
export const DEFAULT_BAD_WORDS = [
  'puta', 'puto', 'putita', 'mierda', 'pelotudo', 'boludo', 'culiado', 'culiao', 'hdp', 'hijodeputa',
  'maricon', 'nazi', 'hitler', 'nigger', 'nigga', 'faggot', 'retrasado', 'mogolico', 'tavyrona',
  'fuck', 'shit', 'bitch', 'cunt', 'ndevy', 'nderakore', 'nde rakore', 'nde tavy',
];

/**
 * Filtro simple. Las palabras cortas (menos de 5 letras) sólo se detectan como palabra
 * completa para evitar falsos positivos (ej. "computadora").
 */
export function createWordFilter(extra = []) {
  const words = [...DEFAULT_BAD_WORDS, ...extra]
    .map((w) => normalizeForFilter(w).replace(/[^a-zñ ]/g, '').trim())
    .filter(Boolean);
  const tokenize = (text) => normalizeForFilter(text).replace(/[^a-zñ]+/g, ' ').trim();
  const hit = (tokenStr) => {
    const tokens = tokenStr.split(' ');
    const joined = ` ${tokenStr} `;
    for (const w of words) {
      if (w.includes(' ')) {
        if (joined.includes(` ${w} `) || tokens.join('').includes(w.replace(/ /g, ''))) return true;
      } else if (w.length < 5) {
        if (tokens.includes(w)) return true;
      } else if (tokens.some((t) => t.includes(w))) {
        return true;
      }
    }
    return false;
  };
  return {
    /** true si el texto contiene alguna palabra bloqueada */
    test(text) {
      const t = tokenize(text);
      if (!t) return false;
      // También sin espacios para nombres tipo "Hijo_De_Puta"
      return hit(t) || hit(t.replace(/ /g, ''));
    },
    /** Reemplaza palabras bloqueadas por *** (palabra por palabra). */
    censor(text) {
      const out = text
        .split(/(\s+)/)
        .map((tok) => {
          const t = tokenize(tok);
          return t && hit(t) ? '*'.repeat(Math.min(Math.max(tok.length, 3), 6)) : tok;
        })
        .join('');
      // Frases de varias palabras: se tapa todo el mensaje
      return this.test(out) ? '***' : out;
    },
  };
}

export const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,16}$/;
