'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { opacityFromInput, cleanText, freshCompanionState, updateQuestion, updateTranscript, addGuidance } = require('../src/companion/state');

test('opacity is clamped to a readable range', () => {
  assert.equal(opacityFromInput(0.94), 0.94);
  assert.equal(opacityFromInput(0), 0.82);
  assert.equal(opacityFromInput(8), 1);
  assert.throws(() => opacityFromInput('NaN'));
});
test('short-text data is strictly bounded and plain', () => {
  assert.equal(cleanText('x\u0001y', 20), 'xy');
  assert.equal(cleanText('a'.repeat(100), 8).length, 8);
});
test('companion state never stores unbounded session text', () => {
  let state = freshCompanionState({ role: 'SDE', language: 'en', sessionId: 'session-1', assistancePermitted: true });
  state = updateTranscript(state, 'a'.repeat(2500));
  state = updateQuestion(state, 'q'.repeat(3000));
  state = addGuidance(state, 'z'.repeat(30000));
  assert.equal(state.role, 'SDE');
  assert.equal(state.transcript.length, 1800);
  assert.equal(state.question.length, 2000);
  assert.ok(state.guidance.length <= 16000);
});
test('companion retains restricted preload alongside shared capture protection', () => {
  const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '../src/renderer/companion-preload.js'), 'utf8');
  assert.match(main, /companion-preload\.js/);
  assert.match(main, /closeCompanion\(\)/);
  assert.match(main, /activatePresentationPrivacy/);
  assert.match(main, /contentProtection.register\(window, 'companion'\)/);
  assert.doesNotMatch(preload, /getUserMedia|desktopCapturer|nodeIntegration/);
});
