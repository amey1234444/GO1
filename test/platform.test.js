'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveExecutable } = require('../src/transcription/engine');
const { supportedSources } = require('../src/privacy/platform');

test('Windows resolves .exe native binaries from configured paths', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'go1-win-'));
  try {
    const exe = path.join(dir, 'whisper-server.exe');
    fs.writeFileSync(exe, 'placeholder', { mode: 0o755 });
    assert.equal(resolveExecutable('whisper-server', undefined, { platform: 'win32', searchDirectories: [dir] }), exe);
    assert.equal(resolveExecutable('not-a-binary', undefined, { platform: 'win32', searchDirectories: [dir] }), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('macOS resolves normal executable filenames', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'go1-mac-'));
  try {
    const exe = path.join(dir, 'whisper-cli');
    fs.writeFileSync(exe, 'placeholder', { mode: 0o755 });
    assert.equal(resolveExecutable('whisper-cli', undefined, { platform: 'darwin', searchDirectories: [dir] }), exe);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Windows does not promise macOS system playback capture', () => {
  assert.deepEqual(supportedSources('win32'), { microphone:true, importAudio:true, systemAudio:false, presentationPrivacy:true, guaranteedCaptureExclusion:false });
  assert.equal(supportedSources('darwin').systemAudio, true);
  assert.equal(supportedSources('darwin').guaranteedCaptureExclusion, false);
});
