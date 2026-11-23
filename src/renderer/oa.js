'use strict';
// Same-window practice editor. No hidden polling, extra BrowserWindow or remote API.
const oa = { image:null, original:null, crop:null, start:null, selecting:false, busy:false, running:false, epoch:0, requestId:null };
let workspaceMode = 'interview';
function oaStatus(text) { $('oaStatus').textContent=text; }
function updateOaControls() {
  const active=state.privacyActive || oa.busy || oa.running;
  for(const id of ['oaCapture','oaImport','oaRefresh','oaDisplay']) $(id).disabled=active;
  for(const id of ['oaSave','oaClear','oaResetCrop']) $(id).disabled=active || !oa.image;
  $('oaApplyCrop').disabled=active || !oa.crop;
  $('oaAsk').disabled=active || !oa.image || !$('oaConsent').checked || $('oaModel').value.trim().length<1 || $('oaQuestion').value.trim().length<4;
  $('oaCancel').hidden=!oa.running;
  $('oaModel').disabled=active; $('oaQuestion').disabled=active; $('oaConsent').disabled=active;
}
function selectWorkspaceMode(mode) {
  if (!['interview','oa'].includes(mode)) return;
  if (state.recording || state.starting || state.stopping || state.busy || oa.busy || oa.running) {
    $('workspaceModeStatus').textContent='Finish or stop the current capture/analysis before switching modes.';return;
  }
  workspaceMode=mode;
  $('interviewModePanel').hidden=mode!=='interview'; $('oaModePanel').hidden=mode!=='oa';
  for(const [id,value] of [['interviewModeTab','interview'],['oaModeTab','oa']]) {$(id).classList.toggle('active',mode===value);$(id).setAttribute('aria-selected',String(mode===value));}
  $('workspaceModeStatus').textContent=mode==='oa'?'OA practice · explicit screenshots, local analysis, no automatic audio.':'Interview · live captions and optional permitted guidance.';
  try{localStorage.setItem('go1-workspace-mode',mode);}catch{}
  if(mode==='oa') void refreshOaDisplays();
}
$('interviewModeTab').addEventListener('click',()=>selectWorkspaceMode('interview'));
$('oaModeTab').addEventListener('click',()=>selectWorkspaceMode('oa'));
async function refreshVisibility() {
  try{const info=await window.go1.visibilityInfo();const key=navigator.platform.includes('Mac')?'⌘D':'Ctrl+D';
    $('hideAppButton').textContent='Hide / restore · '+key;
    $('hideAppButton').disabled=!info.registered;
    $('visibilityStatus').textContent=info.registered?'Press '+key+' again to restore. Processing continues while hidden.':key+' is unavailable, possibly used by another app. Relaunch after freeing the shortcut.';
  }catch(error){$('visibilityStatus').textContent=error.message;}
}
$('hideAppButton').addEventListener('click',()=>window.go1.toggleVisibility().catch(error=>{$('visibilityStatus').textContent=error.message;}));
async function refreshOaDisplays(){
  try{const displays=await window.go1.captureDisplays();const selected=$('oaDisplay').value;$('oaDisplay').replaceChildren();
    for(const display of displays){const option=document.createElement('option');option.value=display.id;option.textContent=display.label+' · '+display.width+' × '+display.height;$('oaDisplay').append(option);}
    if(displays.some(display=>display.id===selected))$('oaDisplay').value=selected;
  }catch(error){oaStatus(error.message);}
}
function drawOaImage(){
  if(!oa.image)return;
  const canvas=$('oaCanvas');if(canvas.width!==oa.image.width || canvas.height!==oa.image.height){canvas.width=oa.image.width;canvas.height=oa.image.height;}
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(oa.image,0,0);
  if(oa.crop){const r=oa.crop;ctx.fillStyle='rgba(25,220,130,.14)';ctx.fillRect(r.x,r.y,r.width,r.height);ctx.strokeStyle='#39e991';ctx.lineWidth=Math.max(2,canvas.width/600);ctx.strokeRect(r.x,r.y,r.width,r.height);}
  canvas.classList.toggle('selecting',oa.selecting);
}
async function loadOaImage(dataUrl, original=true){
  const epoch=oa.epoch;const image=new Image();image.src=dataUrl;await image.decode();
  if(epoch!==oa.epoch || state.privacyActive)return;
  if(image.width*image.height>12000000)throw new Error('Image exceeds 12 megapixels.');
  oa.image=image;if(original)oa.original=dataUrl;oa.crop=null;oa.start=null;oa.selecting=original;
  $('oaPreview').hidden=false;drawOaImage();updateOaControls();
}
function oaPng(){const canvas=document.createElement('canvas');canvas.width=oa.image.width;canvas.height=oa.image.height;canvas.getContext('2d').drawImage(oa.image,0,0);return canvas.toDataURL('image/png');}
function clearOa(){
  oa.epoch++;oa.requestId=null;oa.image=null;oa.original=null;oa.crop=null;oa.start=null;oa.selecting=false;oa.running=false;
  const canvas=$('oaCanvas');canvas.width=1;canvas.height=1;canvas.classList.remove('selecting');$('oaPreview').hidden=true;
  $('oaAnswer').textContent='';$('oaAnswer').hidden=true;$('oaFile').value='';oaStatus('Image and answer cleared.');updateOaControls();
}
$('oaCapture').addEventListener('click',async()=>{
  if(oa.busy || state.privacyActive)return;const epoch=oa.epoch;oa.busy=true;updateOaControls();oaStatus('Capturing the selected display…');
  try{const result=await window.go1.captureDisplay($('oaDisplay').value);if(epoch!==oa.epoch || state.privacyActive)return;
    await loadOaImage(result.dataUrl);oaStatus('Drag over the preview, then choose Use selection. Escape cancels selection.');
  }catch(error){if(epoch===oa.epoch)oaStatus(error.message);}finally{oa.busy=false;updateOaControls();}
});
$('oaRefresh').addEventListener('click',refreshOaDisplays);
$('oaImport').addEventListener('click',()=>$('oaFile').click());
$('oaFile').addEventListener('change',async()=>{
  const file=$('oaFile').files[0];if(!file || state.privacyActive)return;const epoch=oa.epoch;oa.busy=true;updateOaControls();
  try{if(!['image/png','image/jpeg'].includes(file.type) || file.size>6*1024*1024)throw new Error('Choose a PNG or JPEG up to 6 MiB.');
    const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Could not read the image.'));reader.readAsDataURL(file);});
    if(epoch!==oa.epoch || state.privacyActive)return;await loadOaImage(dataUrl);oaStatus('Image imported. Drag to select the relevant region.');
  }catch(error){if(epoch===oa.epoch)oaStatus(error.message);}finally{oa.busy=false;$('oaFile').value='';updateOaControls();}
});
function cropPoint(event){const r=$('oaCanvas').getBoundingClientRect();return {point:{x:event.clientX-r.left,y:event.clientY-r.top},display:{width:r.width,height:r.height}};}
$('oaCanvas').addEventListener('pointerdown',event=>{
  if(event.button!==0 || !oa.selecting || !oa.image || oa.running || state.privacyActive)return;
  event.currentTarget.focus();oa.start=cropPoint(event).point;oa.crop=null;event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault();
});
$('oaCanvas').addEventListener('pointermove',event=>{
  if(!oa.start || !oa.image)return;const next=cropPoint(event);oa.crop=window.GO1Crop.imageCrop(oa.start,next.point,next.display,oa.image);drawOaImage();updateOaControls();
});
$('oaCanvas').addEventListener('pointerup',event=>{
  if(!oa.start)return;const next=cropPoint(event);oa.crop=window.GO1Crop.imageCrop(oa.start,next.point,next.display,oa.image);oa.start=null;
  if(oa.crop)oa.selecting=false;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);drawOaImage();updateOaControls();
});
function cancelCrop(){oa.start=null;oa.crop=null;oa.selecting=false;drawOaImage();updateOaControls();}
$('oaCanvas').addEventListener('pointercancel',cancelCrop);
window.addEventListener('blur',()=>{if(oa.start)cancelCrop();});
$('oaCanvas').addEventListener('keydown',event=>{if(event.key==='Escape'){cancelCrop();oaStatus('Selection cancelled. The image is retained.');}});
$('oaApplyCrop').addEventListener('click',async()=>{
  if(!oa.crop || !oa.image)return;const r=oa.crop,canvas=document.createElement('canvas');canvas.width=r.width;canvas.height=r.height;
  canvas.getContext('2d').drawImage(oa.image,r.x,r.y,r.width,r.height,0,0,r.width,r.height);
  await loadOaImage(canvas.toDataURL('image/png'),false);oaStatus('Selected '+r.width+' × '+r.height+' pixels. Ready to review or save.');
});
$('oaResetCrop').addEventListener('click',async()=>{if(oa.original){await loadOaImage(oa.original);oaStatus('Original restored. Drag to select another region.');}});
$('oaClear').addEventListener('click',clearOa);
$('oaSave').addEventListener('click',async()=>{try{if(await window.go1.saveImage(oaPng()))oaStatus('Selected image saved.');}catch(error){oaStatus(error.message);}});
for(const id of ['oaModel','oaQuestion','oaConsent'])$(id).addEventListener('input',updateOaControls);
$('oaAsk').addEventListener('click',async()=>{
  if(!oa.image || oa.running || !$('oaConsent').checked || state.privacyActive)return;
  const epoch=oa.epoch;oa.requestId=crypto.randomUUID();oa.running=true;updateOaControls();$('oaAnswer').textContent='';$('oaAnswer').hidden=false;oaStatus('Analysing with your local vision model…');
  try{const answer=await window.go1.analyseImage({requestId:oa.requestId,dataUrl:oaPng(),model:$('oaModel').value.trim(),question:$('oaQuestion').value,permitted:$('oaConsent').checked});
    if(epoch!==oa.epoch || state.privacyActive)return;$('oaAnswer').textContent=answer;oaStatus('Analysis complete. Verify the interpretation and reasoning.');
  }catch(error){if(epoch===oa.epoch && !state.privacyActive)oaStatus(error.message+' Check that the installed model supports images.');}
  finally{if(epoch===oa.epoch){oa.running=false;updateOaControls();}}
});
$('oaCancel').addEventListener('click',async()=>{oa.epoch++;oa.requestId=null;oa.running=false;await window.go1.cancelImageAnalysis();oaStatus('Analysis cancelled; any partial answer remains for review.');updateOaControls();});
window.go1.onImageAnalysisChunk(({delta,requestId})=>{if(requestId===oa.requestId && oa.running && !state.privacyActive)$('oaAnswer').textContent+=delta;});
window.go1.onPrivacyActivated(()=>{clearOa();$('oaQuestion').value='';$('oaConsent').checked=false;});
window.addEventListener('go1-privacy-resumed',updateOaControls);
void refreshVisibility();
try{if(localStorage.getItem('go1-workspace-mode')==='oa')selectWorkspaceMode('oa');}catch{}
updateOaControls();
