'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { acquire, release } = require('../src/audio/capture-stream');
class Track extends EventTarget { constructor(kind='audio'){super();this.kind=kind;this.readyState='live';this.enabled=true;} stop(){this.readyState='ended';} }
class Stream { constructor(tracks=[new Track()]){this.tracks=tracks;}getTracks(){return this.tracks;}getAudioTracks(){return this.tracks.filter(x=>x.kind==='audio');}getVideoTracks(){return this.tracks.filter(x=>x.kind==='video');} }
function fixture(){
 const mic=new Stream(), system=new Stream([new Track(),new Track('video')]); let context, constraints;
 class Context { constructor(){context=this;this.gains=[];}createMediaStreamDestination(){return {stream:new Stream()};}createGain(){const gain={gain:{value:1},connect(){}};this.gains.push(gain);return gain;}createMediaStreamSource(){return {connect(){}};}async resume(){}async close(){this.closed=true;} }
 return {mic,system,context:()=>context,constraints:()=>constraints,options:{source:'both',deviceId:'selected-mic',requestMicrophone:async()=>true,prepareSystemAudio:async()=>{},allowed:()=>true,AudioContextImpl:Context,MediaStreamImpl:Stream,mediaDevices:{getDisplayMedia:async()=>system,getUserMedia:async x=>{constraints=x;return mic;}}}};
}
test('combined capture owns and releases both sources and does not monitor speakers',async()=>{
 const f=fixture(), result=await acquire(f.options);assert.equal(f.constraints().audio.deviceId.exact,'selected-mic');assert.equal(f.system.getVideoTracks()[0].enabled,false);assert.deepEqual(f.context().gains.map(x=>x.gain.value),[.5,.5]);release(result);assert.ok([...f.mic.getTracks(),...f.system.getTracks(),...result.getTracks()].every(x=>x.readyState==='ended'));assert.equal(f.context().closed,true);
});
test('second source denial cleans up acquired system tracks',async()=>{
 const f=fixture();f.options.requestMicrophone=async()=>false;await assert.rejects(acquire(f.options),/denied/);assert.ok(f.system.getTracks().every(x=>x.readyState==='ended'));
});
test('privacy change during permission acquisition never returns active capture',async()=>{
 const f=fixture();let allowed=true;f.options.allowed=()=>allowed;f.options.mediaDevices.getUserMedia=async()=>{allowed=false;return f.mic;};await assert.rejects(acquire(f.options),/cancelled/);assert.ok([...f.system.getTracks(),...f.mic.getTracks()].every(x=>x.readyState==='ended'));
});
test('ended physical source ends mixed input and releases all resources for reconnect',async()=>{
 const f=fixture(),result=await acquire(f.options);let ended=false;result.getAudioTracks()[0].addEventListener('ended',()=>{ended=true;});f.mic.getAudioTracks()[0].dispatchEvent(new Event('ended'));assert.equal(ended,true);assert.equal(f.context().closed,true);assert.equal(f.system.getAudioTracks()[0].readyState,'ended');
});
