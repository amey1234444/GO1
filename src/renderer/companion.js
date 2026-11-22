'use strict';
const el = id => document.getElementById(id);
let currentSessionId = null;
window.go1Companion.onSnapshot(snapshot => {
  const protection = snapshot.captureProtection;
  el('protectionState').textContent = protection?.enabled
    ? `Live protection ${protection.allApplied ? 'requested' : 'needs attention'} · transcription and enabled AI continue · receiver not verified`
    : 'Capture protection off · transcription and enabled AI continue';
  if (!snapshot || typeof snapshot !== 'object') return;
  if (currentSessionId && snapshot.sessionId !== currentSessionId) return;
  currentSessionId = snapshot.sessionId;
  el('role').textContent = snapshot.role || 'Session';
  el('language').textContent = 'Language: ' + (snapshot.language || 'Auto');
  el('transcript').textContent = snapshot.transcript || 'Waiting for speech...';
  el('question').hidden = !snapshot.question;
  el('question').textContent = snapshot.question || '';
  el('guidance').textContent = snapshot.guidance || 'No suggestions yet. Open the main GO1 window to review a question and request guidance.';
  el('guidanceStatus').textContent = snapshot.status || 'Listening...';
});
el('close').addEventListener('click', () => window.go1Companion.close());
el('focusMain').addEventListener('click', () => window.go1Companion.focusWorkspace());
el('privacy').addEventListener('click', () => window.go1Companion.stopAndMask());
el('opacity').addEventListener('input', event => {
  const value = Number(event.target.value);
  el('opacityValue').textContent = `${value}%`;
  window.go1Companion.setOpacity(value / 100).catch(() => {});
});
