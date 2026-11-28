'use strict';

const { buildFeedbackMessages, normalizeProfile } = require('./session');
const ENDPOINT = 'http://127.0.0.1:11434/api/chat';
const TAG_ENDPOINT = 'http://127.0.0.1:11434/api/tags';

async function localModelStatus({ fetchImpl = fetch, signal } = {}) {
  try {
    const response = await fetchImpl(TAG_ENDPOINT, { signal });
    if (!response.ok) return { online: false, models: [], message: `Ollama returned HTTP ${response.status}.` };
    const body = await response.json();
    const models = Array.isArray(body.models) ? body.models.map(m => String(m.name || '')).filter(Boolean).slice(0, 100) : [];
    return { online: true, models };
  } catch {
    return { online: false, models: [], message: 'Ollama is not running. Install Ollama and pull qwen3:4b to enable optional local AI coaching.' };
  }
}

async function generatePracticeFeedback({ profile, transcript, signal, onChunk = () => {}, fetchImpl = fetch, timeoutMs = 90000 }) {
  const normalized = normalizeProfile(profile);
  const messages = buildFeedbackMessages(normalized, transcript);
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason || new Error('Canceled.'));
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error('Local AI inference timed out.')), timeoutMs);
  let response, reader;
  const cancelRead = () => { if (reader) void reader.cancel(controller.signal.reason).catch(() => {}); };
  controller.signal.addEventListener('abort', cancelRead, { once: true });
  try {
    response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: normalized.model, messages, stream: true, options: { temperature: 0.25, num_predict: 850 } }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}. Check that model '${normalized.model}' is installed.`);
    if (!response.body || typeof response.body.getReader !== 'function') throw new Error('Local AI response is not streamable.');
    controller.signal.throwIfAborted();
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let partial = '', text = '', completed = false, bytes = 0;
    const consume = line => {
      if (!line.trim()) return;
      let obj;
      try { obj = JSON.parse(line); } catch { throw new Error('Malformed response from local model.'); }
      if (obj.error) throw new Error(String(obj.error));
      if (typeof obj.message?.content === 'string') {
        text += obj.message.content;
        if (text.length > 24000) throw new Error('Practice feedback is too long.');
        onChunk(obj.message.content);
      }
      if (obj.done === true) {
        if (obj.done_reason === 'length') throw new Error('Practice feedback reached its response limit. Use a shorter transcript.');
        completed = true;
      }
    };
    while (!completed) {
      const { done, value } = await reader.read();
      controller.signal.throwIfAborted();
      if (done) { partial += decoder.decode(); consume(partial); break; }
      bytes += value.byteLength;
      if (bytes > 2_000_000) throw new Error('Local AI response exceeds size limit.');
      partial += decoder.decode(value, { stream: true });
      let split;
      while ((split = partial.indexOf('\n')) >= 0) {
        const line = partial.slice(0, split); partial = partial.slice(split + 1); consume(line);
      }
    }
    if (!completed) throw new Error('The local model stopped before completing its response.');
    if (!text.trim()) throw new Error('The local model returned an empty response.');
    return text.trim();
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', cancelRead);
    if (reader) { try { await reader.cancel(); } catch {} reader.releaseLock(); }
    else { try { await response?.body?.cancel(); } catch {} }
  }
}
module.exports = { ENDPOINT, TAG_ENDPOINT, localModelStatus, generatePracticeFeedback };
