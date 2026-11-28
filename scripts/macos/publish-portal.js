'use strict';
// CI uses short-lived GitHub OIDC tokens. No portal password or static upload
// key is present in the repository, workflow, logs or generated artifacts.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { version } = require('../../package.json');
const ORIGIN = 'https://go1-release-desk.velvetywoodpecker16.chatgpt.site';
const mode = process.argv[2] || 'report';
const runId = process.env.GITHUB_RUN_ID;
let token, tokenAt = 0;
async function authorize() {
  if (token && Date.now() - tokenAt < 120000) return token;
  const url = new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
  url.searchParams.set('audience', ORIGIN);
  const response = await fetch(url, { headers: { Authorization: 'Bearer ' + process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('GitHub could not issue publisher identity: HTTP ' + response.status);
  token = (await response.json()).value; tokenAt = Date.now();
  if (!token) throw new Error('GitHub returned an empty publisher identity.');
  return token;
}
async function request(route, body, method = 'POST') {
  // Only retry idempotent part writes / reports. Initiation and completion
  // failures must be inspected; blind retries could replace a completed upload.
  const retryable = route === '/api/ci/report' || route.startsWith('/api/ci/part/');
  for (let attempt=0;;attempt++) {
    try {
      const raw = Buffer.isBuffer(body);
      const response = await fetch(ORIGIN + route, { method, headers: { Authorization: 'Bearer ' + await authorize(), 'Content-Type': raw ? 'application/octet-stream' : 'application/json' }, body: raw ? body : JSON.stringify(body), signal: AbortSignal.timeout(120000) });
      const data = await response.json();
      if (!response.ok) throw new Error('Portal: HTTP ' + response.status + ': ' + (data.error || 'Request failed'));
      return data;
    } catch (error) { if (!retryable || attempt >= 2) throw error; }
  }
}
async function readJson(file) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; } }
async function report(status) {
  const smoke = await readJson('out/release-evidence/packaged-smoke.json');
  const stages = await readJson('out/release-evidence/stage-results.json');
  const steps = smoke?.steps || [];
  let error = smoke?.error || '';
  if (!error && status === 'failure') {
    const failure = stages?.find(s => s.outcome === 'failure');
    if (failure) {
      const log = await fs.readFile('out/release-evidence/' + failure.id + '.log', 'utf8').catch(() => '');
      // Only logs from checks, native compilation and app validation are captured.
      // Signing/notarization credentials are never collected by this publisher.
      error = failure.name + ' failed.\n' + log.slice(-10000);
    } else error = 'The macOS workflow failed before packaged validation completed. Expand workflow steps for the failing stage.';
  }
  await request('/api/ci/report', {version,status,title:'GO1 '+version+' · Apple Silicon',error,steps});
}
async function upload() {
  const integrity = await readJson('out/distribution/package-integrity.json');
  const smoke = await readJson('out/distribution/packaged-smoke.json');
  if (!integrity || smoke?.status !== 'passed' || integrity.sourceCommit !== process.env.GITHUB_SHA || smoke.sourceCommit !== process.env.GITHUB_SHA) throw new Error('Refusing to publish an unverified build.');
  const file = path.join('out/distribution', path.basename(integrity.dmg.filename));
  const bytes = await fs.readFile(file);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== integrity.dmg.sha256 || sha256 !== smoke.dmg.sha256) throw new Error('DMG checksum changed after validation.');
  await request('/api/ci/upload', {filename:path.basename(file),version,bytes:bytes.length,sha256,smokeStatus:smoke.status,notarized:integrity.signing.developerIdNotarized});
  const parts=[];
  for(let offset=0,part=1;offset<bytes.length;offset+=8*1024*1024,part++) {
    parts.push(await request('/api/ci/part/'+part,bytes.subarray(offset,offset+8*1024*1024),'PUT'));
    console.log('Uploaded part '+part+' of '+Math.ceil(bytes.length/(8*1024*1024)));
  }
  const result=await request('/api/ci/complete',{parts});
  console.log('Protected release published: '+result.id);
  if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,'\nDownload GO1 after signing in: '+ORIGIN+'\n');
}
(async()=>{
  if (!runId || process.env.GITHUB_REF !== 'refs/heads/main' || !['push','workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME)) throw new Error('Publishing is only permitted from main branch CI.');
  if(mode==='upload')await upload();
  else await report(mode==='start'?'building':process.env.GO1_BUILD_STATUS||'failure');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
