'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeProfile, DEFAULT_PROFILE, buildFeedbackMessages, validateTranscript } = require('../src/practice/session');
const { localModelStatus, generatePracticeFeedback, ENDPOINT } = require('../src/practice/local-coach');
const mock = { ...DEFAULT_PROFILE, role: 'Backend Engineer', roleDescription: 'Design secure APIs', jobDescription: 'Build Spring Boot services and PostgreSQL schemas.', language: 'hi', mode: 'technical' };

test('practice profile validates role, long descriptions, language and local model', () => {
  assert.equal(normalizeProfile(mock).language, 'hi');
  assert.throws(() => normalizeProfile({ ...mock, role: '' }), /Role/);
  assert.throws(() => normalizeProfile({ ...mock, jobDescription: 'z'.repeat(10001) }), /Job description/);
  assert.throws(() => normalizeProfile({ ...mock, language: 'xx' }), /Unsupported language/);
  assert.throws(() => normalizeProfile({ ...mock, model: 'http://evil.example/x?key=1' }), /Invalid local model name/);
  assert.equal(normalizeProfile({ ...mock, mode: 'coding' }).mode, 'coding');
});
test('coach instructions are separated from untrusted session details', () => {
  const messages = buildFeedbackMessages(mock, 'I would implement a B-tree index for the requested query.');
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /consensual mock interview/);
  assert.equal(JSON.parse(messages[1].content).jobDescription, mock.jobDescription);
  assert.equal(JSON.parse(messages[1].content).language, 'Hindi');
  assert.throws(() => validateTranscript('hey'), /completed practice transcript/);
});
test('Ollama status uses loopback and lists installed models', async () => {
  const calls=[];
  const status=await localModelStatus({ fetchImpl: async url => { calls.push(url); return { ok:true, json:async()=>({models:[{name:'qwen3:4b'},{name:'gemma3:4b'}]}) }; } });
  assert.equal(status.online,true);
  assert.deepEqual(status.models,['qwen3:4b','gemma3:4b']);
  assert.equal(calls[0], 'http://127.0.0.1:11434/api/tags');
});
test('practice feedback streams and finishes only after Ollama done', async () => {
  const chunks=[];
  const encoder=new TextEncoder();
  const fakeFetch=async (url,options) => {
    assert.equal(url,ENDPOINT);
    assert.equal(JSON.parse(options.body).model,'qwen3:4b');
    return { ok:true, body:new ReadableStream({
      start(controller){
        controller.enqueue(encoder.encode('{"message":{"content":"What went well"},"done":false}\n'));
        controller.enqueue(encoder.encode('{"message":{"content":": Solid reasoning"},"done":false}\n{"done":true}\n'));
        controller.close();
      }
    })};
  };
  const result=await generatePracticeFeedback({profile:mock,transcript:'I explained when to use a database index for select queries.',fetchImpl:fakeFetch,onChunk:chunk=>chunks.push(chunk)});
  assert.equal(result,'What went well: Solid reasoning');
  assert.equal(chunks.join(''),'What went well: Solid reasoning');
});
test('incomplete local AI stream is rejected without claiming completion', async () => {
  const encoder=new TextEncoder();
  await assert.rejects(generatePracticeFeedback({
    profile:mock, transcript:'A longer mock interview answer for the local practice coach.',
    fetchImpl:async()=>({ok:true,body:new ReadableStream({start(c){c.enqueue(encoder.encode('{"message":{"content":"unfinished"}}\n'));c.close();}})})
  }),/before completing/);
});
test('Ollama unavailable is reported clearly', async()=>{
  const status=await localModelStatus({fetchImpl:async()=>{throw new Error('ECONNREFUSED');}});
  assert.equal(status.online,false);
  assert.match(status.message,/not running/);
});
