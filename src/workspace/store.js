'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { normalizeProfile } = require('../practice/session');
const { prepareReview } = require('../practice/review-policy');
const LIMIT = 12 * 1024 * 1024;
function text(value, max, name) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Invalid ${name}.`);
  return value.trim();
}
function normalize(kind, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid item.');
  const title = text(input.title, 160, 'title');
  if (kind === 'roles') return { title, profile: normalizeProfile(input.profile) };
  if (kind === 'materials') {
    if (!['resume', 'knowledge'].includes(input.type)) throw new Error('Invalid material type.');
    return { title, type: input.type, text: text(input.text, 100000, 'document text') };
  }
  if (kind === 'records') return { title, result: prepareReview(input.result), profile: normalizeProfile(input.profile), feedback: typeof input.feedback === 'string' ? input.feedback.slice(0, 20000) : '' };
  throw new Error('Unknown collection.');
}
class WorkspaceStore {
  constructor(directory) { this.file = path.join(directory, 'workspace.json'); this.queue = Promise.resolve(); }
  async read() {
    let raw;
    try { const stat = await fs.stat(this.file); if (stat.size > LIMIT) throw new Error('Workspace exceeds its storage limit.'); raw = await fs.readFile(this.file, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return { schema: 1, roles: [], materials: [], records: [] }; throw error; }
    const data = JSON.parse(raw);
    if (data.schema !== 1) throw new Error('Unsupported workspace format; the existing file has been preserved.');
    for (const kind of ['roles', 'materials', 'records']) {
      if (!Array.isArray(data[kind]) || data[kind].length > 100) throw new Error('Invalid workspace collection.');
      data[kind] = data[kind].map(row => ({ ...normalize(kind, row), id: text(row.id, 80, 'id'), updatedAt: text(row.updatedAt, 40, 'date') }));
    }
    return data;
  }
  async snapshot() { await this.queue.catch(() => {}); return this.read(); }
  mutate(operation, validate = () => {}) {
    const job = this.queue.catch(() => {}).then(async () => {
      validate();
      const data = await this.read();
      const result = operation(data);
      const raw = JSON.stringify(data);
      if (Buffer.byteLength(raw) > LIMIT) throw new Error('Workspace is full. Export and delete older records first.');
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const temp = `${this.file}.${randomUUID()}.tmp`;
      try { await fs.writeFile(temp, raw, { mode: 0o600 }); validate(); await fs.rename(temp, this.file); }
      finally { await fs.rm(temp, { force: true }); }
      return result;
    });
    this.queue = job;
    return job;
  }
  put(kind, input, validate) {
    const value = normalize(kind, input);
    return this.mutate(data => {
      const rows = data[kind];
      const index = input.id ? rows.findIndex(row => row.id === input.id) : -1;
      if (input.id && index < 0) throw new Error('Item no longer exists.');
      if (index < 0 && rows.length >= 100) throw new Error('Collection limit reached (100 items).');
      const row = { ...value, id: index < 0 ? randomUUID() : input.id, updatedAt: new Date().toISOString() };
      if (index < 0) rows.unshift(row); else rows[index] = row;
      return row;
    }, validate);
  }
  remove(kind, id, validate) {
    if (!['roles', 'materials', 'records'].includes(kind)) throw new Error('Unknown collection.');
    return this.mutate(data => { const index = data[kind].findIndex(row => row.id === id); if (index < 0) throw new Error('Item no longer exists.'); data[kind].splice(index, 1); return true; }, validate);
  }
}
// Local lexical retrieval. It does not claim embedding or semantic search parity.
function retrieveMaterials(materials, ids, question, budget = 6000) {
  const words = [...new Set(question.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [])];
  const chunks = materials.filter(row => ids.includes(row.id)).flatMap(row => {
    const pieces = row.text.match(/[\s\S]{1,1200}/g) || [];
    return pieces.map((content, index) => ({ title: row.title, part: index + 1, content, score: words.reduce((n, word) => n + (content.toLocaleLowerCase().includes(word) ? 1 : 0), 0) }));
  }).sort((a, b) => b.score - a.score);
  const selected = [];
  for (const chunk of chunks) {
    if (budget <= 0) break;
    const content = chunk.content.slice(0, budget); budget -= content.length;
    selected.push({ title: chunk.title, part: chunk.part, content });
  }
  return selected;
}
module.exports = { WorkspaceStore, retrieveMaterials };
