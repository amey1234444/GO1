'use strict';
const assert = require('node:assert/strict');
async function verifyWorkspace(api, until, screenshot = async () => {}) {
  await until(() => api("Boolean(window.GO1Library && window.GO1RichText && document.querySelector('#materialChoices p'))"));
  const errors = await api(`(async () => {
    window.__workspaceErrors=[]; window.addEventListener('error',e=>window.__workspaceErrors.push(e.message));
    showWorkspaceView('materials'); document.getElementById('newMaterial').click();
    document.getElementById('materialTitle').value='Release test resume';
    document.getElementById('materialText').value='Built Java services with PostgreSQL indexes.';
    document.getElementById('materialForm').requestSubmit(); return true;
  })()`); assert.equal(errors,true);
  await until(() => api("document.getElementById('materialList').textContent.includes('Release test resume')"));
  await screenshot('workspace-materials');
  await api(`(() => { showWorkspaceView('home'); document.querySelector('#materialChoices input').click();
    document.getElementById('answerLength').value='detailed'; document.getElementById('answerTone').value='technical';
    document.getElementById('savePracticeButton').click(); return true; })()`);
  await until(async()=> (await api('window.go1.loadPracticeProfile()')).answerLength==='detailed');
  await api(`(() => {showWorkspaceView('roles');document.getElementById('roleName').value='Release test role';document.getElementById('saveRole').click();return true;})()`);
  await until(() => api("document.getElementById('roleList').textContent.includes('Release test role')"));
  await screenshot('workspace-roles');
  await api(`(() => { showWorkspaceView('records'); document.getElementById('saveRecord').click(); return true; })()`);
  await until(() => api("document.getElementById('libraryStatus').textContent.includes('Finish a recording')"));
  await api(`(() => { renderResult({text:'I used SQL indexes for efficient lookups.',segments:[{text:'I used SQL indexes for efficient lookups.',startMs:0,endMs:4000}],durationMs:4000,language:'en'});
    document.getElementById('recordTitle').value='Release test session';document.getElementById('saveRecord').click();return true; })()`);
  await until(() => api("document.getElementById('recordList').textContent.includes('Release test session')"));
  await api("document.querySelector('#recordList button').click();true");
  assert.match(await api("document.getElementById('recordDetail').textContent"),/SQL indexes/);
  await screenshot('workspace-records');
  const rich = await api(`(() => { const el=document.createElement('div');window.GO1RichText.render(el,'# Heading\\n- **Point**\\n<script>alert(1)</script>\\n\`\`\`js\\nx < 5\\n\`\`\`');return {scripts:el.querySelectorAll('script').length,strong:el.querySelectorAll('strong').length,text:el.textContent};})()`);
  assert.equal(rich.scripts,0);assert.equal(rich.strong,1);assert.match(rich.text,/<script>/);
  // Real UI mask, not only invoking the backend gate.
  await api("enablePresentationPrivacy().then(()=>true)");
  assert.equal(await api("document.getElementById('materialList').textContent"),'');
  assert.equal(await api("document.getElementById('recordDetail').textContent"),'');
  assert.equal(await api("window.go1.workspaceList().then(()=>false,()=>true)"),true);
  await api("document.getElementById('exitPrivacyButton').click();true");
  await until(() => api("!state.privacyActive && document.getElementById('materialList').textContent.includes('Release test resume')"));
  const saved=await api('window.go1.workspaceList()');assert.equal(saved.roles[0].profile.answerLength,'detailed');assert.equal(saved.materials.length,1);assert.equal(saved.records.length,1);
  await api("showWorkspaceView('settings');document.querySelector('.device-settings').scrollIntoView();true");
  await screenshot('workspace-audio-settings');
  assert.deepEqual(await api('window.__workspaceErrors'),[]);
  await api("showWorkspaceView('home');true");
  return {materials:1,roles:1,records:1,richTextSafe:true,privacyCleared:true,scope:'Actual renderer and preload; transcript fixture, no hardware audio'};
}
module.exports = { verifyWorkspace };
