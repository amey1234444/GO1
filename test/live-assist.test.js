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
  await assert.rejects(generateLiveGuidance({profile,question:'Explain indexing?',signal:controller.signal,fetchImpl:async(_url,{signal})=>{signal.throwIfAborted();return {ok:false,status:500};}}),/abort/i);
});

function timedStream() {
  let streamController, canceled = false;
  const encoder = new TextEncoder();
  const body = new ReadableStream({start(c){streamController=c;},cancel(){canceled=true;}});
  return {
    fetchImpl: async()=>({ok:true,body}),
    send: obj=>streamController.enqueue(encoder.encode(JSON.stringify(obj)+'\n')),
    finish: ()=>streamController.close(),
    canceled: ()=>canceled
  };
}
const flush = () => new Promise(resolve=>setImmediate(resolve));
test('live guidance accepts progressing output beyond the idle deadline',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const stream=timedStream();
  const result=generateLiveGuidance({profile,question:'Explain caching?',fetchImpl:stream.fetchImpl,timeoutMs:100,maxDurationMs:500});
  await flush();
  for(let i=0;i<4;i++){
    t.mock.timers.tick(80);stream.send({message:{content:'word '}});await flush();
  }
  stream.send({done:true});stream.finish();
  assert.equal(await result,'word word word word');
});
test('live guidance cancels a stalled reader and releases its lock',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const stream=timedStream();
  const result=generateLiveGuidance({profile,question:'Explain caching?',fetchImpl:stream.fetchImpl,timeoutMs:100,maxDurationMs:500});
  const rejected=assert.rejects(result,/stalled/);
  await flush();stream.send({message:{content:'partial'}});await flush();
  t.mock.timers.tick(101);await rejected;assert.equal(stream.canceled(),true);
});
test('live guidance enforces a total deadline even while tokens arrive',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const stream=timedStream();
  const result=generateLiveGuidance({profile,question:'Explain caching?',fetchImpl:stream.fetchImpl,timeoutMs:100,maxDurationMs:250});
  const rejected=assert.rejects(result,/time limit/);await flush();
  for(let i=0;i<3;i++){t.mock.timers.tick(80);stream.send({message:{content:'word '}});await flush();}
  t.mock.timers.tick(11);await rejected;assert.equal(stream.canceled(),true);
});
test('stop cancels an in-flight live stream without delivering later output',async()=>{
  const stream=timedStream(),controller=new AbortController(),chunks=[];
  const result=generateLiveGuidance({profile,question:'Explain caching?',fetchImpl:stream.fetchImpl,signal:controller.signal,onChunk:value=>chunks.push(value)});
  const rejected=assert.rejects(result,/Stopped/);await flush();
  stream.send({message:{content:'partial'}});await flush();
  controller.abort(new Error('Stopped.'));await rejected;
  assert.equal(stream.canceled(),true);assert.deepEqual(chunks,['partial']);
});
test('image guidance sends reviewed image bytes only to the local model after capability checks',async()=>{
  const calls=[],encoder=new TextEncoder();
  const fetchImpl=async(url,options)=>{
    calls.push(url);
    if(url.endsWith('/api/tags'))return {ok:true,json:async()=>({models:[{name:'vision:latest'}]})};
    if(url.endsWith('/api/show'))return {ok:true,json:async()=>({capabilities:['vision','completion']})};
    const body=JSON.parse(options.body);assert.deepEqual(body.messages.at(-1).images,['cG5n']);
    return {ok:true,body:new ReadableStream({start(c){c.enqueue(encoder.encode('{"message":{"content":"Reviewed image"},"done":true}\n'));c.close();}})};
  };
  const answer=await generateLiveGuidance({profile:{...profile,model:'vision'},question:'Explain this image?',imageBase64:'cG5n',fetchImpl});
  assert.equal(answer,'Reviewed image');assert.equal(calls.length,3);
  assert.ok(calls.every(url=>url.startsWith('http://127.0.0.1:11434/')));
});
