'use strict';
/** A post-practice review window, never a hidden on-call assistant. */
function prepareReview(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid practice result.');
  if (input.isLive === true) throw new Error('Finish practice before opening review.');
  if (typeof input.text !== 'string' || input.text.length > 200000) throw new Error('Invalid transcript length.');
  const text = input.text.trim();
  if (!text) throw new Error('No completed transcript available.');
  const segments = Array.isArray(input.segments) ? input.segments.slice(0, 5000) : [];
  if (segments.length > 1000) throw new Error('Transcript has too many segments.');
  const safeSegments = segments.map(segment => {
    if (typeof segment?.text !== 'string' || segment.text.length > 5000) throw new Error('Invalid segment.');
    const startMs = Number(segment.startMs);
    const endMs = Number(segment.endMs);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs < startMs || endMs > 86400000) throw new Error('Invalid timestamps.');
    return { startMs, endMs, text: segment.text };
  });
  return {
    text, segments: safeSegments,
    language: typeof input.language === 'string' ? input.language.slice(0, 16) : 'unknown',
    durationMs: Number.isFinite(input.durationMs) ? Math.max(0, Math.min(input.durationMs, 86400000)) : 0
  };
}
function reviewAllowed({ paused, activeTranscription, liveSession } = {}) {
  return !paused && !activeTranscription && !liveSession;
}
module.exports = { prepareReview, reviewAllowed };
