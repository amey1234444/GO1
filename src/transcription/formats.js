'use strict';

function normalizeWhisperJson(payload) {
  if (!payload || !Array.isArray(payload.transcription)) {
    throw new Error('Unexpected whisper.cpp JSON output: no transcription array.');
  }
  const segments = payload.transcription.map((item) => {
    const startMs = Number(item.offsets?.from);
    const endMs = Number(item.offsets?.to);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
      throw new Error('Unexpected timestamp in whisper.cpp JSON output.');
    }
    return {
      startMs: Math.max(0, Math.round(startMs)),
      endMs: Math.max(0, Math.round(endMs)),
      text: String(item.text ?? '').trim()
    };
  }).filter(segment => segment.text.length > 0);
  // Whisper usually includes appropriate spacing in each segment's original text.
  // Preserve it to avoid joining words in Latin scripts or inserting spaces into CJK.
  const fullText = payload.transcription.map(s => String(s.text ?? '')).join('').trim();
  return {
    language: String(payload.result?.language || payload.params?.language || 'unknown'),
    text: fullText,
    segments,
    durationMs: segments.length ? Math.max(...segments.map(s => s.endMs)) : 0
  };
}

function formatTimestamp(milliseconds, decimalMark = ',') {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new Error('Invalid timestamp');
  const ms = Math.floor(milliseconds);
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const remainder = ms % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}${decimalMark}${String(remainder).padStart(3, '0')}`;
}

function exportTranscript(result, format) {
  if (!result || !Array.isArray(result.segments)) throw new Error('Missing transcript');
  const segments = result.segments;
  if (format === 'txt') return result.text || segments.map(s => s.text).join(' ');
  if (format === 'json') return JSON.stringify(result, null, 2);
  if (format === 'srt') {
    return segments.map((s, i) => `${i + 1}\n${formatTimestamp(s.startMs)} --> ${formatTimestamp(s.endMs)}\n${s.text}`).join('\n\n') + (segments.length ? '\n' : '');
  }
  if (format === 'vtt') {
    return 'WEBVTT\n\n' + segments.map(s => `${formatTimestamp(s.startMs, '.')} --> ${formatTimestamp(s.endMs, '.')}\n${s.text}`).join('\n\n') + (segments.length ? '\n' : '');
  }
  throw new Error('Unsupported export format');
}

module.exports = { normalizeWhisperJson, exportTranscript, formatTimestamp };
