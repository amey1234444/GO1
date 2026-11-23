'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {requireLocalVisionModel}=require('../src/practice/vision-model');
test('vision requests require an installed local model declaring image support',async()=>{
 const seen=[];
 const fetchImpl=async(url,options)=>{seen.push(url);return {ok:true,json:async()=>url.endsWith('/tags')?{models:[{name:'vision:latest'}]}:{capabilities:['completion','vision']}};};
 await requireLocalVisionModel('vision',{fetchImpl});assert.equal(seen.length,2);
 const remote=async()=>({ok:true,json:async()=>({models:[{name:'vision:latest',remote_host:'https://example.com'}]})});
 await assert.rejects(requireLocalVisionModel('vision',{fetchImpl:remote}),/cloud-backed/);
 const textOnly=async url=>({ok:true,json:async()=>url.endsWith('/tags')?{models:[{name:'text:latest'}]}:{capabilities:['completion']}});
 await assert.rejects(requireLocalVisionModel('text',{fetchImpl:textOnly}),/image support/);
 await assert.rejects(requireLocalVisionModel('missing',{fetchImpl:textOnly}),/Install/);
});
