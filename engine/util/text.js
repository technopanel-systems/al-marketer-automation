// Text utilities for Arabic/English evidence: normalisation, quote verification, script ratio, number extraction.

const ARABIC_DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;
const BIDI_MARKS = /[​-‏‪-‮⁦-⁩﻿]/g;
const ARABIC_INDIC = /[٠-٩]/g;
const PERSIAN_DIGITS = /[۰-۹]/g;

export function toWesternDigits(text) {
  return String(text ?? '')
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(PERSIAN_DIGITS, (d) => String(d.charCodeAt(0) - 0x06f0));
}

// Normalises text so a quote matches its source despite diacritics, letter variants, digits, punctuation and spacing.
export function normalizeForMatch(text) {
  return toWesternDigits(String(text ?? '').normalize('NFKC'))
    .replace(BIDI_MARKS, '')
    .replace(ARABIC_DIACRITICS, '')
    .replace(TATWEEL, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase()
    .replace(/[،؛؟٫٬.,;:!?'"`’‘“”«»()\[\]{}<>|/\\\-–—_*#@~^+=%&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const MIN_QUOTE_CHARS = 8;

// A quote is verified when its normalised form appears in the normalised source text.
export function verifyQuote(quote, sourceText) {
  const q = normalizeForMatch(quote);
  if (q.length < MIN_QUOTE_CHARS) return { ok: false, reason: 'quote too short' };
  const src = normalizeForMatch(sourceText);
  if (src.includes(q)) return { ok: true };
  // Allow an ellipsis-joined quote ("part one ... part two") when every part is long enough and present in order.
  const parts = String(quote).split(/\.{3}|…/).map(normalizeForMatch).filter(Boolean);
  if (parts.length > 1 && parts.every((p) => p.length >= MIN_QUOTE_CHARS)) {
    let from = 0;
    for (const p of parts) {
      const at = src.indexOf(p, from);
      if (at < 0) return { ok: false, reason: 'quote not found in source' };
      from = at + p.length;
    }
    return { ok: true };
  }
  return { ok: false, reason: 'quote not found in source' };
}

const ARABIC_LETTER = /[ء-يٮ-ۓۺ-ۿ]/g;
const LATIN_LETTER = /[A-Za-z]/g;

export function scriptCounts(text) {
  const s = String(text ?? '');
  return { arabic: (s.match(ARABIC_LETTER) || []).length, latin: (s.match(LATIN_LETTER) || []).length };
}

// Share of Arabic letters among Arabic + Latin letters, after removing allowed Latin terms (brands, platforms).
export function arabicRatio(text, allowedLatinTerms = []) {
  let s = String(text ?? '').replace(/https?:\/\/\S+|www\.\S+|\S+@\S+/g, ' ');
  for (const term of [...allowedLatinTerms].sort((a, b) => b.length - a.length)) {
    if (!term) continue;
    s = s.split(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')).join(' ');
  }
  const { arabic, latin } = scriptCounts(s);
  return arabic + latin === 0 ? 1 : arabic / (arabic + latin);
}

// Numbers as they appear in text (Arabic-Indic digits converted). "5–6" yields 5 and 6; "1,200" yields 1200; "3.5" yields 3.5.
export function extractNumbers(text) {
  const s = toWesternDigits(text).replace(/(\d)[,٬](\d{3})/g, '$1$2');
  return (s.match(/\d+(?:[.٫]\d+)?/g) || []).map((n) => Number(n.replace('٫', '.')));
}

export function wordCount(text) {
  return String(text ?? '').replace(/\[\[|\]\]/g, '').trim().split(/\s+/).filter(Boolean).length;
}
