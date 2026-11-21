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

// whisper-server may emit upstream whisper.cpp JSON or OpenAI-style verbose JSON.
function normalizeServerResponse(payload) {
  if (Array.isArray(payload?.transcription)) return normalizeWhisperJson(payload);
  if (!payload || typeof payload !== 'object') throw new Error('Invalid Whisper server result.');
  const entries = Array.isArray(payload.segments) ? payload.segments : [];
  const segments = entries.map(s => {
    const from = Number(s.start ?? s.start_ms / 1000);
    const to = Number(s.end ?? s.end_ms / 1000);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
    return { startMs: Math.round(from * 1000), endMs: Math.round(to * 1000), text: String(s.text || '').trim() };
  }).filter(s => s && s.text);
  return {
    language: String(payload.language || payload.result?.language || 'unknown'),
    text: String(payload.text ?? segments.map(s => s.text).join(' ')).trim(),
    segments,
    durationMs: segments.length ? Math.max(...segments.map(s => s.endMs)) : Math.max(0, Math.round((Number(payload.duration) || 0) * 1000)),
    timestampQuality: segments.length ? 'segment' : 'unavailable'
  };
}
module.exports.normalizeServerResponse = normalizeServerResponse;
