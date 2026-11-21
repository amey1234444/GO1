'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadProcessor() {
  const messages = [];
  let Class;
  const sandbox = {
    sampleRate: 48000,
    AudioWorkletProcessor: class {
      constructor() { this.port = { postMessage: message => messages.push(message), onmessage: null }; }
    },
    registerProcessor: (id, ctor) => { assert.equal(id, 'go1-pcm16-resampler'); Class = ctor; }
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/renderer/pcm-worklet.js'), 'utf8');
  vm.runInNewContext(source, sandbox, { filename: 'pcm-worklet.js' });
  return { processor: new Class(), messages };
}

test('AudioWorklet emits bounded audio level readings and PCM chunks', () => {
  const { processor, messages } = loadProcessor();
  const frame = new Float32Array(128).fill(0.2);
  for (let i = 0; i < 64; i++) processor.process([[frame]]);
  const levels = messages.filter(m => m.type === 'level');
  assert.ok(levels.length >= 2);
  assert.ok(levels.every(m => Math.abs(m.rms - 0.2) < 0.002));
  processor.port.onmessage({ data: { type: 'flush' } });
  const bytes = messages.filter(m => m.type === 'pcm').flatMap(m => Array.from(m.bytes));
  assert.ok(bytes.length >= 2700 && bytes.length <= 2800);
  assert.ok(messages.some(m => m.type === 'flushed'));
});

test('AudioWorklet emits zero level readings for silence', () => {
  const { processor, messages } = loadProcessor();
  for (let i = 0; i < 24; i++) processor.process([[new Float32Array(128)]]);
  assert.equal(messages.find(m => m.type === 'level').rms, 0);
});
