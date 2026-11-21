'use strict';
// Trusted allowlist: never accept arbitrary URL or filename from the renderer.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const MODEL_CATALOG = Object.freeze({
  base: { file: 'ggml-base.bin', minBytes: 100_000_000, maxBytes: 250_000_000, url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin' },
  small: { file: 'ggml-small.bin', minBytes: 350_000_000, maxBytes: 700_000_000, url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin' },
  medium: { file: 'ggml-medium.bin', minBytes: 1_000_000_000, maxBytes: 2_200_000_000, url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin' },
  'large-v3-turbo': { file: 'ggml-large-v3-turbo.bin', minBytes: 900_000_000, maxBytes: 2_200_000_000, url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin' },
  silero: { file: 'ggml-silero-v6.2.0.bin', minBytes: 100_000, maxBytes: 100_000_000, url: 'https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin' }
});
function modelState(dir, catalog = MODEL_CATALOG) {
  return Object.fromEntries(Object.entries(catalog).map(([id, meta]) => {
    const full = path.join(dir, meta.file);
    let installed = false;
    try { const size = fs.statSync(full).size; installed = size >= meta.minBytes && size <= meta.maxBytes; } catch {}
    return [id, { installed, filename: meta.file }];
  }));
}
class ModelManager {
  constructor({ directory, fetchFn = fetch, onProgress = () => {}, catalog = MODEL_CATALOG }) {
    this.directory = directory; this.fetchFn = fetchFn; this.onProgress = onProgress; this.catalog = catalog;
    this.controller = null; this.activeId = null;
  }
  async install(id) {
    if (!this.catalog[id]) throw new Error('Unknown model.');
    if (this.controller) throw new Error('A model is already downloading.');
    const item = this.catalog[id];
    const controller = new AbortController();
    this.controller = controller; this.activeId = id;
    await fsp.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const destination = path.join(this.directory, item.file);
    const temporary = `${destination}.${randomUUID()}.part`;
    try {
      const state = modelState(this.directory, this.catalog);
      if (state[id].installed) return { id, installed: true, cached: true };
      const response = await this.fetchFn(item.url, { signal: controller.signal, redirect: 'follow' });
      if (!response.ok || !response.body) throw new Error(`Model download failed: HTTP ${response.status}`);
      const length = Number(response.headers?.get('content-length')) || null;
      if (length && (length < item.minBytes || length > item.maxBytes)) throw new Error('Unexpected model download size.');
      const handle = await fsp.open(temporary, 'wx', 0o600);
      let written = 0;
      try {
        for await (const part of response.body) {
          if (controller.signal.aborted) throw new Error('Download cancelled.');
          const b = Buffer.from(part);
          written += b.length;
          if (written > item.maxBytes) throw new Error('Model download exceeds expected maximum.');
          let offset = 0;
          while (offset < b.length) {
            const { bytesWritten } = await handle.write(b, offset, b.length - offset);
            if (!bytesWritten) throw new Error('Failed to write model download.');
            offset += bytesWritten;
          }
          this.onProgress({ id, written, total: length });
        }
        await handle.sync();
      } finally { await handle.close(); }
      if (written < item.minBytes) throw new Error('Model file is incomplete.');
      // Most current Whisper ggml model files start with little-endian `ggml` magic.
      const fd = await fsp.open(temporary, 'r');
      try {
        const magic = Buffer.alloc(4); await fd.read(magic, 0, 4, 0);
        if (id !== 'silero' && magic.toString('ascii') !== 'lmgg') throw new Error('Invalid Whisper model header.');
      } finally { await fd.close(); }
      await fsp.rename(temporary, destination);
      return { id, installed: true, cached: false };
    } catch (error) {
      if (controller.signal.aborted) throw new Error('Download cancelled.');
      throw error;
    } finally {
      await fsp.rm(temporary, { force: true }).catch(() => {});
      this.controller = null; this.activeId = null;
    }
  }
  cancel() { this.controller?.abort(); }
}
module.exports = { MODEL_CATALOG, modelState, ModelManager };
