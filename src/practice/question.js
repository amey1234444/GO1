'use strict';

/** A transparent, user-triggered coaching tool for calls where assistance is permitted. */
function suggestQuestion(result) {
  const segments = Array.isArray(result?.segments) ? result.segments : [];
  const raw = segments.length ? segments.slice(-8).map(s => s.text || '').join(' ') : String(result?.text || '');
  const text = raw.replace(/\s+/g, ' ').trim().slice(-1600);
  if (!text) return { text: '', detected: false };
  const sentences = text.match(/[^.?!。؟]+[.?!。؟]?/gu) || [text];
  const candidate = sentences.map(x => x.trim()).filter(Boolean).at(-1) || text;
  const cue = /\b(what|why|how|when|where|which|who|explain|describe|design|implement|compare|difference|could you|can you|would you|tell me|walk me through)\b|(?:क्या|कैसे|क्यों|कब|कहाँ|समझाइए|बताइए|काय|कसे|कसे कराल|कधी|का)/iu;
  return { text: candidate.slice(-1000), detected: /[?？؟]/u.test(candidate) || cue.test(candidate) };
}
if (typeof module !== 'undefined') module.exports = { suggestQuestion };
if (typeof window !== 'undefined') window.GO1Question = Object.freeze({ suggestQuestion });
