'use strict';
const el = id => document.getElementById(id);
let currentSessionId = null, compact = false, allowed = false, busy = false, requesting = false;
function updateAsk() {
  el('ask').disabled = !allowed || busy || requesting || el('questionInput').value.trim().length < 4;
  el('ask').textContent = busy || requesting ? 'Thinking…' : 'Ask AI ↗';
  el('askHint').textContent = allowed ? '⌘ / Ctrl + Enter to ask' : 'Enable AI when starting your session';
}
function surface(value) {
  const numeric = Number(value);
  const opacity = Number.isFinite(numeric) ? Math.max(.58, Math.min(1, numeric)) : .86;
  document.documentElement.style.setProperty('--surface-opacity', String(opacity));
  el('opacity').value = String(Math.round(opacity * 100));
  el('opacityValue').textContent = `${Math.round(opacity * 100)}%`;
}
window.go1Companion.onSnapshot(snapshot => {
  if (!snapshot || typeof snapshot !== 'object') return;
  if (currentSessionId && snapshot.sessionId !== currentSessionId) return;
  currentSessionId = snapshot.sessionId;
  const input = snapshot.inputState || 'ready';
  const inputLabels = { starting: 'Starting', muted: 'Input muted', disconnected: 'Input lost', suspended: 'Audio paused' };
  el('inputStateLabel').textContent = inputLabels[input] || (snapshot.audioLevel > 0.004 ? 'Hearing audio' : 'Waiting for audio');
  const notices = { starting: 'Preparing audio input…', muted: 'Input is muted. The session stays open.', disconnected: 'Input disconnected. Open the workspace ↗ and reconnect audio.', suspended: 'Audio paused by the system. Open the workspace ↗ to reconnect.' };
  el('audioStatus').textContent = notices[input] || snapshot.transcriptionWarning || 'Silence is normal. Your session stays open.';
  const protection = snapshot.captureProtection;
  el('protectionState').textContent = protection?.enabled
    ? protection.allApplied ? 'Protection requested · check receiver' : 'Protection needs attention'
    : 'Capture protection off';
  compact = snapshot.compact === true;
  el('companionApp').classList.toggle('compact', compact);
  el('compact').textContent = compact ? '+' : '−';
  el('compact').setAttribute('aria-expanded', String(!compact));
  el('compact').setAttribute('aria-label', compact ? 'Expand companion' : 'Collapse to toolbar');
  el('compact').title = compact ? 'Expand companion' : 'Collapse to toolbar';
  surface(snapshot.surfaceOpacity ?? .86);
  allowed = snapshot.assistancePermitted === true;
  busy = protection?.activity?.aiRunning === true;
  el('role').textContent = snapshot.role || 'Your session';
  el('language').textContent = (snapshot.language || 'Auto').toUpperCase();
  el('transcript').textContent = snapshot.transcript || 'Listening for your first words…';
  el('transcript').classList.toggle('empty', !snapshot.transcript);
  el('question').hidden = !snapshot.question;
  el('question').textContent = snapshot.question || '';
  el('guidance').textContent = snapshot.guidance || 'A little clarity, right when you need it.\nAsk about your conversation below.';
  el('guidance').classList.toggle('empty', !snapshot.guidance);
  el('guidanceStatus').textContent = snapshot.status || 'Ask a question when you need a hand.';
  updateAsk();
});
function report(error) { el('guidanceStatus').textContent = String(error.message || error); }
el('close').addEventListener('click', () => window.go1Companion.close().catch(report));
el('focusMain').addEventListener('click', () => window.go1Companion.focusWorkspace().catch(report));
el('privacy').addEventListener('click', () => window.go1Companion.stopAndMask().catch(report));
el('compact').addEventListener('click', () => window.go1Companion.setCompact(!compact).catch(report));
el('opacity').addEventListener('input', event => {
  const value = Number(event.target.value) / 100;
  surface(value); window.go1Companion.setOpacity(value).catch(report);
});
el('questionInput').addEventListener('input', updateAsk);
el('questionInput').addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); el('askForm').requestSubmit(); }
});
el('askForm').addEventListener('submit', async event => {
  event.preventDefault();
  const question = el('questionInput').value.trim();
  if (!allowed || busy || requesting || question.length < 4) return;
  requesting = true; updateAsk();
  try { await window.go1Companion.ask(question); }
  catch (error) { report(error); }
  finally { requesting = false; updateAsk(); }
});
