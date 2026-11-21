'use strict';

// Deterministic, local feedback only: no AI assessment and no claims about correctness.
function tokenize(text) {
  const value = String(text || '');
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('und', { granularity: 'word' });
    return [...segmenter.segment(value)].filter(x => x.isWordLike).map(x => x.segment);
  }
  return value.match(/[\p{L}\p{N}]+/gu) || [];
}
function analysePractice(result) {
  const text = String(result?.text || '').trim();
  const words = tokenize(text);
  const durationMs = Math.max(0, Number(result?.durationMs) || 0);
  if (!text || !words.length || durationMs < 1000) {
    return { ready: false, wordCount: words.length, durationMs, wordsPerMinute: null, fillerCount: 0, feedback: 'Complete a spoken practice response to see local pacing and clarity observations.' };
  }
  const wordCount = words.length;
  const wordsPerMinute = Math.round(wordCount / (durationMs / 60000));
  const englishFillers = text.match(/\b(?:um+|uh+|erm+|hmm+|you know)\b/giu) || [];
  const otherFillers = text.match(/(?:मतलब|म्हणजे)/gu) || [];
  const fillerCount = englishFillers.length + otherFillers.length;
  let pace = 'Measured pace includes pauses and silence during the recording.';
  if (wordsPerMinute > 180) pace = 'Your overall pace is fast; try leaving space between key ideas.';
  else if (wordsPerMinute < 90) pace = 'Your overall pace is measured; check whether your answer could be more concise.';
  const detail = fillerCount > 2 ? ` ${fillerCount} possible filler expressions were detected; review them in the transcript.` : ' Review the transcript for structure and factual accuracy.';
  return { ready: true, wordCount, durationMs, wordsPerMinute, fillerCount, feedback: pace + detail };
}
module.exports = { tokenize, analysePractice };
