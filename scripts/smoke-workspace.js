'use strict';
// Real Electron UI integration, no extra browser automation dependency.
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { freePort } = require('../src/transcription/worker');
const { verifyWorkspace } = require('./workspace-ui-checks');
const output = path.resolve('out/workspace-evidence');
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
async function until(check, ms=20000){const end=Date.now()+ms;let error;while(Date.now()<end){try{const value=await check();if(value)return value;}catch(e){error=e;}await delay(100);}throw new Error('Readiness timeout: '+(error?.message||''));}
async function connect(url){
 const ws=new WebSocket(url);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 const pending=new Map();let next=0;
 ws.addEventListener('message',event=>{const msg=JSON.parse(event.data),p=pending.get(msg.id);if(!p)return;clearTimeout(p.timer);pending.delete(msg.id);if(msg.error)p.reject(new Error(msg.error.message));else p.resolve(msg.result);});
 ws.addEventListener('close',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Window closed'));}pending.clear();});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;const timer=setTimeout(()=>{pending.delete(id);reject(new Error(method+' timeout'));},30000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
 return {close:()=>ws.close(),call,async evaluate(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}};
}
(async()=>{
 await fs.mkdir(output,{recursive:true});const profile=await fs.mkdtemp(path.join(os.tmpdir(),'go1-ui-'));let child,client,logs='';
 const port=await freePort();
 async function launch(){child=spawn(require('electron'),['--no-sandbox','--disable-gpu',`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1',`--user-data-dir=${profile}`,path.resolve('.')],{stdio:['ignore','pipe','pipe']});child.stdout.on('data',x=>logs=(logs+x).slice(-100000));child.stderr.on('data',x=>logs=(logs+x).slice(-100000));child.on('error',e=>{logs+=e.message;});
 const target=await until(async()=>{if(child.exitCode!==null)throw new Error(logs);const r=await fetch(`http://127.0.0.1:${port}/json/list`);return (await r.json()).find(x=>x.url.endsWith('/index.html'));});client=await connect(target.webSocketDebuggerUrl);await until(()=>client.evaluate('Boolean(window.GO1Library)'));return client;}
 async function stop(){client?.close();if(child&&child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await until(()=>child.exitCode!==null||child.signalCode!==null);}}
 try{
 await launch();const result=await verifyWorkspace(expr=>client.evaluate(expr),until,async name=>{const shot=await client.call('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(output,name+'.png'),Buffer.from(shot.data,'base64'));});
 await stop();await launch();const saved=await client.evaluate('window.go1.workspaceList()');assert.equal(saved.materials.length,1);assert.equal(saved.records.length,1);assert.equal(saved.roles.length,1);assert.equal((await client.evaluate('window.go1.captureProtectionInfo()')).activity.liveSession,false);
 await client.evaluate(`(async()=>{const d=await window.go1.workspaceList();for(const kind of ['materials','roles','records'])for(const row of d[kind])await window.go1.workspaceDelete(kind,row.id);return true;})()`);
 assert.equal((await client.evaluate('window.go1.workspaceList()')).records.length,0);
 await fs.writeFile(path.join(output,'workspace-smoke.json'),JSON.stringify({status:'passed',...result,restartPersisted:true,deletionVerified:true},null,2));console.log('Workspace integration passed.');
 }finally{await fs.writeFile(path.join(output,'electron.log'),logs);await stop();await fs.rm(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
