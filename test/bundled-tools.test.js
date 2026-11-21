'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {resolveExecutable}=require('../src/transcription/engine');
test('Mac package uses bundled Whisper before tools found on PATH',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'go1-native-'));
  try {
    const bin=path.join(dir,'native','bin');
    const local=path.join(dir,'fallback');
    fs.mkdirSync(bin,{recursive:true});fs.mkdirSync(local);
    const tool=path.join(bin,'whisper-server');
    fs.writeFileSync(tool,'tool',{mode:0o755});
    fs.writeFileSync(path.join(local,'whisper-server'),'fallback',{mode:0o755});
    assert.equal(resolveExecutable('whisper-server',null,{platform:'darwin',resourcePath:dir,searchDirectories:[local]}),tool);
    fs.unlinkSync(tool);
    assert.equal(resolveExecutable('whisper-server',null,{platform:'darwin',resourcePath:dir,searchDirectories:[local]}),path.join(local,'whisper-server'));
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('Explicit override takes precedence, Windows never uses the Mac app bundle',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'go1-override-'));
  try {
    const bin=path.join(dir,'native','bin');fs.mkdirSync(bin,{recursive:true});
    const tool=path.join(bin,'ffmpeg');fs.writeFileSync(tool,'tool',{mode:0o755});
    assert.equal(resolveExecutable('ffmpeg',tool,{platform:'darwin',resourcePath:dir,searchDirectories:[]}),tool);
    assert.equal(resolveExecutable('ffmpeg',null,{platform:'win32',resourcePath:dir,searchDirectories:[]}),null);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
