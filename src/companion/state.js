'use strict';

// Only bounded, plain-text data is sent to the independent companion window.
// Capture exclusion is owned separately by the window protection controller.
const MAX_TRANSCRIPT = 1800;
const MAX_GUIDANCE = 16000;
function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(-max);
}
function opacityFromInput(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error('Invalid window opacity.');
  return Math.round(Math.max(0.58, Math.min(1, numeric)) * 100) / 100;
}
function freshCompanionState({ role = '', language = 'auto', sessionId = '', assistancePermitted = false } = {}) {
  return {
    role: cleanText(role, 120), language: cleanText(language, 10),
    sessionId: cleanText(sessionId, 80), assistancePermitted: assistancePermitted === true,
    transcript: '', question: '', guidance: '',
    status: 'Listening. Use GO1 to request permitted guidance.'
  };
}
function updateTranscript(state, text) { return { ...state, transcript: cleanText(text, MAX_TRANSCRIPT) }; }
function updateQuestion(state, text) { return { ...state, question: cleanText(text, 2000) }; }
function addGuidance(state, delta) {
  const piece = cleanText(delta, 4096);
  return { ...state, guidance: (state.guidance + piece).slice(0, MAX_GUIDANCE) };
}
module.exports = { MAX_TRANSCRIPT, MAX_GUIDANCE, cleanText, opacityFromInput, freshCompanionState, updateTranscript, updateQuestion, addGuidance };
