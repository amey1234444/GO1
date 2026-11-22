'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { suggestQuestion, buildGuidanceMessages, generateLiveGuidance, ENDPOINT } = require('../src/practice/live-assist');
const { DEFAULT_PROFILE } = require('../src/practice/session');
const profile = { ...DEFAULT_PROFILE, role: 'Backend Developer', jobDescription: 'Spring Boot, Redis, PostgreSQL', language: 'hi' };

test('question extraction uses the latest spoken question rather than all history', () => {
  assert.deepEqual(suggestQuestion({segments:[{text:'Good morning.'},{text:'How would you prevent duplicate reservations?'}]}), {text:'How would you prevent duplicate reservations?',detected:true});
  assert.equal(suggestQuestion({segments:[{text:'We have a production service.'}]}).detected,false);
  assert.equal(suggestQuestion({segments:[{text:'डेटाबेस इंडेक्स कैसे काम करता है'}]}).detected,true);
  assert.equal(suggestQuestion({text:''}).text,'');
});
test('live prompts ground language, role, and context while separating data from instructions', () => {
  const messages=buildGuidanceMessages(profile,'Explain indexes','Interviewer: Tell me about B trees.');
  assert.equal(messages.length,2);
  assert.equal(messages[0].role,'system');
  const data=JSON.parse(messages[1].content);
  assert.equal(data.role,'Backend Developer');
  assert.equal(data.requestedLanguage,'Hindi');
  assert.match(data.jobDescription,/PostgreSQL/);
  assert.equal(data.question,'Explain indexes');
  assert.throws(()=>buildGuidanceMessages(profile,'hi'),/question/);
  assert.throws(()=>buildGuidanceMessages(profile,'valid question','a'.repeat(12001)),/Context/);
});
test('local Ollama live guidance streams text and returns completed answer', async () => {
  const encoder=new TextEncoder(); const chunks=[];
  const fetchImpl=async (url, options)=>{
    assert.equal(url,ENDPOINT);
    assert.equal(options.method,'POST');
    assert.equal(JSON.parse(options.body).model,'qwen3:4b');
    return {ok:true,body:new ReadableStream({start(c){
      c.enqueue(encoder.encode('{"message":{"content":"First"},"done":false}\n{"message":{"content":" response"},"done":false}\n'));
      c.enqueue(encoder.encode('{"done":true}\n'));c.close();
    }})};
  };
  const result=await generateLiveGuidance({profile,question:'What is a B-tree index?',fetchImpl,onChunk:v=>chunks.push(v)});
  assert.equal(result,'First response');
  assert.deepEqual(chunks,['First',' response']);
});
test('live guidance handles provider error and interrupted stream',async()=>{
  await assert.rejects(generateLiveGuidance({profile,question:'Explain caching?',fetchImpl:async()=>({ok:false,status:404})}),/HTTP 404/);
  const encoder=new TextEncoder();
  await assert.rejects(generateLiveGuidance({profile,question:'Explain caching?',fetchImpl:async()=>({ok:true,body:new ReadableStream({start(c){c.enqueue(encoder.encode('{"message":{"content":"partial"}}\n'));c.close();}})})}),/did not complete/);
});
test('canceled live guidance fails without claiming a complete response',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(generateLiveGuidance({profile,question:'Explain indexing?',signal:controller.signal,fetchImpl:async(_url,{signal})=>{if(signal.aborted)throw new Error('Aborted.');return {ok:false,status:500};}}),/Aborted/);
});
