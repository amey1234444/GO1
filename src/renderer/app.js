'use strict';

const $ = id => document.getElementById(id);
const MAX_BYTES = 80 * 1024 * 1024;
const MAX_RECORD_MS = 30 * 60 * 1000;
const state = { mode: 'record', recording: false, busy: false, chunks: [], stream: null, recorder: null, timer: null, startTime: 0, file: null, result: null, liveId: null, audioContext: null, worklet: null, workletSource: null, silenceGain: null, stopping: false, privacyActive: false, privacyTransition: false };
const languageNames = { en: 'English', hi: 'Hindi', mr: 'Marathi', gu: 'Gujarati', bn: 'Bengali', ta: 'Tamil', te: 'Telugu', kn: 'Kannada', ml: 'Malayalam', pa: 'Punjabi', ur: 'Urdu', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', ru: 'Russian', ar: 'Arabic', zh: 'Chinese', ja: 'Japanese', ko: 'Korean' };

function setStatus(message, kind = '') {
  $('statusText').textContent = message;
  $('statusLine').className = `status-line ${kind}`;
}
function showError(error) {
  if (state.privacyActive) return;
  $('errorBox').hidden = false;
  $('errorBox').textContent = error instanceof Error ? error.message : String(error);
  setStatus('Something went wrong');
}
function hideError() { $('errorBox').hidden = true; }
function renderSetup(status) {
  $('setupAlert').hidden = status.ready && Boolean(status.whisperServer);
  $('modelSelect').value = status.selectedModel || 'small';
  const installed = status.models?.[status.selectedModel]?.installed;
  if (!state.modelDownloading) $('modelProgress').textContent = installed ? `Selected model: ${status.selectedModel} (installed).` : `Selected model: ${status.selectedModel} (download required).`;
  if (!status.ready) {
    const missing = [!status.ffmpeg && 'FFmpeg', !status.ffprobe && 'FFprobe', !status.whisper && 'whisper-cli', !status.whisperServer && 'whisper-server', !status.modelFound && 'multilingual Whisper model'].filter(Boolean).join(', ');
    $('setupMessage').textContent = `Missing: ${missing}. Run bash scripts/setup-macos.sh small in Terminal, then press Recheck. Model location: ${status.model}`;
  }
  $('recordButton').disabled = !status.ready || !status.whisperServer || state.busy;
  $('transcribeFileButton').disabled = !status.ready || !state.file || state.busy;
}
let setup = { ready: false };
async function checkSetup() {
  try { setup = await window.go1.checkSetup(); renderSetup(setup); }
  catch (error) { showError(error); }
}
function chooseMode(mode) {
  if (state.busy || state.recording) return;
  state.mode = mode;
  const record = mode === 'record';
  $('recordPanel').hidden = !record;
  $('uploadPanel').hidden = record;
  $('recordTab').classList.toggle('active', record);
  $('uploadTab').classList.toggle('active', !record);
  $('recordTab').setAttribute('aria-selected', record);
  $('uploadTab').setAttribute('aria-selected', String(!record));
}
function selectFile(file) {
  hideError();
  if (!file) return;
  if (file.size <= 0 || file.size > MAX_BYTES) return showError('Files must be between 1 byte and 80 MB.');
  state.file = file;
  $('chosenFile').hidden = false;
  $('chosenFile').textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`;
  $('transcribeFileButton').disabled = !setup.ready || state.busy;
  setStatus('Audio file selected');
}
function formatClock(ms) { const total = Math.floor(ms / 1000); return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`; }
function stopTracks() { state.stream?.getTracks().forEach(track => track.stop()); state.stream = null; }
function stopClock() { clearInterval(state.timer); state.timer = null; }
function setBusy(busy) {
  state.busy = busy;
  $('recordButton').disabled = busy || !setup.ready || !setup.whisperServer;
  $('transcribeFileButton').disabled = busy || !setup.ready || !state.file;
  $('recordTab').disabled = busy;
  $('uploadTab').disabled = busy;
  $('languageSelect').disabled = busy;
  $('liveToggle').disabled = busy || state.recording;
  $('sourceSelect').disabled = busy || state.recording;
  $('translateToggle').disabled = busy;
  $('processingPane').hidden = !busy;
  if (busy) { $('emptyResult').hidden = true; $('transcriptContent').hidden = true; }
}
function resetResults() { state.result = null; $('copyButton').disabled = true; $('exportButton').disabled = true; $('exportMenu').hidden = true; $('emptyResult').hidden = true; $('transcriptContent').hidden = true; }
function renderResult(result, live = false) {
  if (state.privacyActive) return;
  state.result = result;
  $('emptyResult').hidden = true;
  $('transcriptContent').hidden = false;
  $('transcriptBody').textContent = result.text || '(No spoken words detected.)';
  $('resultLanguage').textContent = `Language: ${languageNames[result.language] || result.language || 'Unknown'}`;
  $('resultDuration').textContent = `Last timestamp: ${formatClock(result.durationMs || 0)}`;
  $('resultSegments').textContent = `${result.segments.length} segment${result.segments.length === 1 ? '' : 's'}`;
  const list = $('segmentList');
  list.replaceChildren();
  for (const segment of [...result.segments, ...(live ? result.provisional || [] : [])]) {
    const row = document.createElement('div'); row.className = 'segment' + (live && (result.provisional || []).includes(segment) ? ' provisional' : '');
    const time = document.createElement('time'); time.textContent = formatClock(segment.startMs); time.setAttribute('datetime', `PT${segment.startMs / 1000}S`);
    const text = document.createElement('p'); text.textContent = segment.text;
    row.append(time, text); list.appendChild(row);
  }
  $('copyButton').disabled = !result.text;
  $('exportButton').disabled = live;
  setStatus(live ? 'Recording • live captions may lag behind speech' : result.text ? 'Transcription completed' : 'No speech detected', live ? 'active' : 'success');
}
async function processBytes(bytes) {
  if (state.privacyActive || !setup.ready || state.busy) return;
  hideError(); resetResults(); setBusy(true); setStatus('Processing locally...', 'active');
  $('processingMessage').textContent = 'Preparing transcription...';
  try {
    const result = await window.go1.transcribe({
      bytes,
      language: $('languageSelect').value,
      translate: $('translateToggle').checked
    });
    renderResult(result);
  } catch (error) {
    $('emptyResult').hidden = false;
    showError(error);
  } finally { setBusy(false); }
}
function chooseMimeType() {
  const options = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
  return options.find(type => window.MediaRecorder?.isTypeSupported(type)) || '';
}
async function startLive(stream) {
  if (state.privacyActive) throw new Error('Exit presentation privacy mode before recording.');
  if (!window.AudioWorkletNode) throw new Error('AudioWorklet is not available; turn off Live captions to record first.');
  const id = await window.go1.startLive({ language: $('languageSelect').value, translate: $('translateToggle').checked });
  if (state.privacyActive) {
    await window.go1.cancelLive(id).catch(() => {});
    throw new Error('Presentation privacy mode is active; recording is disabled.');
  }
  state.liveId = id;
  try {
    const context = new AudioContext();
    state.audioContext = context;
    await context.audioWorklet.addModule('./pcm-worklet.js');
    const source = context.createMediaStreamSource(stream);
    const processor = new AudioWorkletNode(context, 'go1-pcm16-resampler');
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(processor).connect(gain).connect(context.destination);
    state.worklet = processor;
    state.workletSource = source;
    state.silenceGain = gain;
    processor.port.onmessage = event => {
      if (event.data?.type === 'pcm') window.go1.sendLiveChunk(id, event.data.bytes);
    };
    await context.resume();
    resetResults();
    $('emptyResult').hidden = false;
  } catch (error) {
    await window.go1.cancelLive(id).catch(() => {});
    state.liveId = null;
    throw error;
  }
}

async function flushLiveAudio() {
  const processor = state.worklet;
  if (!processor) return;
  await new Promise(resolve => {
    const oldHandler = processor.port.onmessage;
    let done = false;
    const finish = () => { if (done) return; done = true; clearTimeout(timeout); processor.port.onmessage = oldHandler; resolve(); };
    processor.port.onmessage = event => {
      if (event.data?.type === 'flushed') { finish(); return; }
      oldHandler?.(event);
    };
    const timeout = setTimeout(finish, 1000);
    processor.port.postMessage({ type: 'flush' });
  });
}

async function cleanupLive() {
  state.workletSource?.disconnect();
  state.worklet?.disconnect();
  state.silenceGain?.disconnect();
  state.worklet = null;
  state.workletSource = null;
  state.silenceGain = null;
  if (state.audioContext) await state.audioContext.close().catch(() => {});
  state.audioContext = null;
  stopTracks();
}

async function startRecording() {
  if (state.privacyActive) return;
  hideError();
  if (!setup.ready || !setup.whisperServer) return showError('Install the local transcription engine and whisper-server first.');
  if (!window.MediaRecorder) return showError('This Electron version does not support MediaRecorder.');
  try {
    const system = $('sourceSelect').value === 'system';
    let stream;
    if (system) {
      await window.go1.prepareSystemAudio();
      if (state.privacyActive) return;
      stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack || audioTrack.readyState !== 'live') {
        stream.getTracks().forEach(t => t.stop());
        throw new Error('System audio unavailable. Grant System Audio Recording permission in macOS Privacy & Security, then restart GO1.');
      }
      // Display video is not used, rendered or saved; disable frames immediately.
      stream.getVideoTracks().forEach(t => { t.enabled = false; });
      audioTrack.addEventListener('ended', () => { if (state.recording && !state.stopping) stopRecording(); }, { once: true });
    } else {
      if (!await window.go1.requestMicrophone()) throw new Error('Microphone access denied. Enable it in System Settings → Privacy & Security → Microphone.');
      if (state.privacyActive) return;
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }, video: false });
    }
    if (state.privacyActive) { stream.getTracks().forEach(track => track.stop()); return; }
    const audioStream = new MediaStream(stream.getAudioTracks());
    state.stream = stream;
    if ($('liveToggle').checked) {
      await startLive(audioStream);
      if (state.privacyActive) {
        await cleanupLive();
        if (state.liveId) await window.go1.cancelLive(state.liveId).catch(() => {});
        state.liveId = null;
        return;
      }
      state.recording = true;
      state.startTime = Date.now();
      $('micCircle').classList.add('recording');
      $('recordButton').classList.add('danger');
      $('recordButton').textContent = 'Stop live recording';
      $('recordMessage').textContent = system ? 'Live system-audio transcription' : 'Live microphone transcription';
      $('liveToggle').disabled = true;
      $('sourceSelect').disabled = true;
      $('languageSelect').disabled = true;
      $('translateToggle').disabled = true;
      setStatus('Listening for live speech...', 'active');
      state.timer = setInterval(() => {
        const elapsed = Date.now() - state.startTime;
        $('recordTimer').textContent = formatClock(elapsed);
        if (elapsed >= MAX_RECORD_MS) stopRecording();
      }, 250);
      return;
    }
    state.chunks = [];
    const mimeType = chooseMimeType();
    const recorder = mimeType ? new MediaRecorder(audioStream, { mimeType }) : new MediaRecorder(audioStream);
    state.recorder = recorder;
    $('sourceSelect').disabled = true;
    recorder.addEventListener('dataavailable', event => { if (event.data.size) state.chunks.push(event.data); });
    recorder.addEventListener('error', event => { stopRecording(); showError(event.error || 'Recording failed.'); });
    recorder.addEventListener('stop', async () => {
      if (recorder.go1Discard) return;
      stopClock(); stopTracks(); state.recording = false; $('sourceSelect').disabled = false;
      $('micCircle').classList.remove('recording');
      $('recordButton').textContent = 'Start recording';
      $('recordButton').classList.remove('danger');
      $('recordMessage').textContent = 'Recording stopped';
      try {
        const blob = new Blob(state.chunks, { type: recorder.mimeType || 'audio/webm' });
        state.chunks = [];
        if (!blob.size) throw new Error('The recording was empty. Please try again.');
        if (blob.size > MAX_BYTES) throw new Error('Recording is too large (maximum 80 MB).');
        await processBytes(new Uint8Array(await blob.arrayBuffer()));
      } catch (error) { showError(error); }
    }, { once: true });
    recorder.start(1000);
    state.recording = true;
    state.startTime = Date.now();
    $('micCircle').classList.add('recording');
    $('recordButton').classList.add('danger');
    $('recordButton').textContent = 'Stop & transcribe';
    $('recordMessage').textContent = system ? 'Recording system playback audio' : 'Recording your microphone';
    setStatus('Recording microphone...', 'active');
    state.timer = setInterval(() => {
      const elapsed = Date.now() - state.startTime;
      $('recordTimer').textContent = formatClock(elapsed);
      if (elapsed >= MAX_RECORD_MS) stopRecording();
    }, 250);
  } catch (error) { await cleanupLive(); state.recording = false; showError(error); }
}
async function stopRecording() {
  if (state.liveId) {
    if (state.stopping) return;
    state.stopping = true;
    stopClock();
    setStatus('Finalizing live transcript...', 'active');
    $('recordMessage').textContent = 'Finishing transcription...';
    $('recordButton').disabled = true;
    const id = state.liveId;
    try {
      await flushLiveAudio();
      await cleanupLive();
      const result = await window.go1.stopLive(id);
      renderResult(result);
    } catch (error) { showError(error); }
    finally {
      state.liveId = null; state.stopping = false; state.recording = false;
      $('micCircle').classList.remove('recording');
      $('recordButton').textContent = 'Start recording';
      $('recordButton').classList.remove('danger');
      $('recordButton').disabled = !setup.ready;
      $('recordMessage').textContent = 'Ready to record';
      $('sourceSelect').disabled = false;
      $('liveToggle').disabled = false;
      $('languageSelect').disabled = false;
      $('translateToggle').disabled = false;
    }
    return;
  }
  stopClock();
  if (state.recorder?.state === 'recording') state.recorder.stop();
  else { stopTracks(); state.recording = false; }
}
function getExportContent(format, result) {
  const f = ms => { const n = Math.max(0, Math.floor(ms)); const h = Math.floor(n / 3600000); const m = Math.floor(n % 3600000 / 60000); const s = Math.floor(n % 60000 / 1000); return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(n % 1000).padStart(3,'0')}`; };
  if (format === 'txt') return result.text;
  if (format === 'json') return JSON.stringify(result, null, 2);
  if (format === 'srt') return result.segments.map((s, i) => `${i+1}\n${f(s.startMs)} --> ${f(s.endMs)}\n${s.text}`).join('\n\n') + '\n';
  if (format === 'vtt') return 'WEBVTT\n\n' + result.segments.map(s => `${f(s.startMs).replace(',', '.')} --> ${f(s.endMs).replace(',', '.')}\n${s.text}`).join('\n\n') + '\n';
  throw new Error('Unsupported format');
}


// Presentation privacy is a visible, user-controlled redaction and recording stop.
// The app does not continue recording, transcribing, or answering while protected.
async function enablePresentationPrivacy() {
  if (state.privacyActive || state.privacyTransition) return;
  state.privacyActive = true; // synchronous guard against late microphone permissions and UI updates
  state.privacyTransition = true;
  const button = $('privacyButton');
  button.disabled = true;
  $('privacyCurtain').hidden = false;
  $('privacyCurtainStatus').textContent = 'Stopping capture and clearing private content...';
  try {
    stopClock();
    state.stopping = true;
    if (state.recorder) {
      state.recorder.go1Discard = true;
      if (state.recorder.state !== 'inactive') state.recorder.stop();
    }
    // Stop input tracks immediately, even if the ASR worker is still busy.
    stopTracks();
    if (state.liveId) {
      const id = state.liveId;
      state.liveId = null;
      await cleanupLive();
      await window.go1.cancelLive(id).catch(() => {});
    }
    await window.go1.pauseForPresentation();
    state.recording = false;
    state.stopping = false;
    state.recorder = null;
    state.chunks = [];
    state.file = null;
    $('chosenFile').hidden = true;
    $('chosenFile').textContent = '';
    $('fileInput').value = '';
    $('micCircle').classList.remove('recording');
    $('recordButton').textContent = 'Start recording';
    $('recordButton').classList.remove('danger');
    $('recordMessage').textContent = 'Ready to record';
    $('sourceSelect').disabled = false;
    $('liveToggle').disabled = false;
    $('languageSelect').disabled = false;
    $('translateToggle').disabled = false;
    resetResults();
    $('transcriptBody').textContent = '';
    $('segmentList').replaceChildren();
    $('errorBox').hidden = true;
    $('processingPane').hidden = true;
    $('exportMenu').hidden = true;
    $('privacyCurtainStatus').textContent = 'Microphone and playback capture stopped. Private transcripts cleared.';
  } catch (error) {
    $('privacyCurtainStatus').textContent = 'Capture was stopped locally. An additional background task may require attention: ' + String(error.message || error);
  } finally {
    state.privacyTransition = false;
    button.disabled = false;
    $('exitPrivacyButton').focus();
  }
}
function disablePresentationPrivacy() {
  if (state.privacyTransition || !state.privacyActive) return;
  state.privacyActive = false;
  $('privacyCurtain').hidden = true;
  $('privacyButton').disabled = false;
  setStatus('Presentation privacy ended — recording remains off');
  $('emptyResult').hidden = false;
  checkSetup();
}
$('privacyButton').addEventListener('click', enablePresentationPrivacy);
$('exitPrivacyButton').addEventListener('click', disablePresentationPrivacy);

$('recordTab').addEventListener('click', () => chooseMode('record'));
$('uploadTab').addEventListener('click', () => chooseMode('upload'));
$('recordButton').addEventListener('click', () => state.recording ? stopRecording() : startRecording());
$('transcribeFileButton').addEventListener('click', async () => {
  if (!state.file) return;
  try { await processBytes(new Uint8Array(await state.file.arrayBuffer())); } catch (error) { showError(error); }
});
$('dropZone').addEventListener('click', () => $('fileInput').click());
$('dropZone').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('fileInput').click(); } });
$('fileInput').addEventListener('change', event => selectFile(event.target.files?.[0]));
$('dropZone').addEventListener('dragover', event => { event.preventDefault(); $('dropZone').classList.add('drag'); });
$('dropZone').addEventListener('dragleave', () => $('dropZone').classList.remove('drag'));
$('dropZone').addEventListener('drop', event => { event.preventDefault(); $('dropZone').classList.remove('drag'); selectFile(event.dataTransfer.files?.[0]); });
$('recheckButton').addEventListener('click', checkSetup);
$('cancelButton').addEventListener('click', async () => { $('processingMessage').textContent = 'Cancelling...'; await window.go1.cancel(); });
$('copyButton').addEventListener('click', async () => { if (state.result) { await window.go1.copy(state.result.text); setStatus('Transcript copied', 'success'); } });
$('exportButton').addEventListener('click', () => { $('exportMenu').hidden = !$('exportMenu').hidden; });
$('exportMenu').addEventListener('click', async event => {
  const format = event.target.closest('[data-format]')?.dataset.format;
  if (!format || !state.result) return;
  $('exportMenu').hidden = true;
  try { await window.go1.save(format, getExportContent(format, state.result)); }
  catch (error) { showError(error); }
});
window.go1.onStage(message => { if (state.privacyActive) return; $('processingMessage').textContent = message; setStatus(message, 'active'); });
window.go1.onLiveUpdate(({ id, result }) => { if (!state.privacyActive && id === state.liveId) renderResult(result, result.isLive); });
window.go1.onLiveStatus(({ id, status }) => {
  if (state.privacyActive) return;
  if (id !== state.liveId) return;
  if (status.type === 'error') { showError(status.message); stopRecording(); return; }
  if (status.type === 'transcribing') setStatus(`Live recognition • processed through ${formatClock(status.throughMs)} • backlog ${formatClock(status.behindMs)}`, 'active');
});
checkSetup();

// Model installation is a user-driven action; never download anything on launch.
$('installModelButton').addEventListener('click', async () => {
  const id = $('modelSelect').value;
  try {
    state.modelDownloading = true;
    $('installModelButton').disabled = true;
    $('cancelModelButton').hidden = false;
    $('modelProgress').textContent = `Preparing ${id} download...`;
    await window.go1.installModel(id);
    // After installation, switch only if the model is present.
    const result = await window.go1.selectModel(id);
    setup = result;
    renderSetup(setup);
    $('modelProgress').textContent = `${id} installed and selected.`;
  } catch (error) { showError(error); }
  finally {
    state.modelDownloading = false;
    $('installModelButton').disabled = false;
    $('cancelModelButton').hidden = true;
    await checkSetup();
  }
});
$('cancelModelButton').addEventListener('click', () => window.go1.cancelModelDownload());
window.go1.onModelProgress(data => {
  const percent = data.total ? `${Math.round(100 * data.written / data.total)}%` : `${(data.written / 1024 / 1024).toFixed(1)} MB`;
  $('modelProgress').textContent = `Downloading ${data.id} • ${percent}`;
});

$('installVadButton').addEventListener('click', async () => {
  try {
    $('installVadButton').disabled = true;
    $('modelProgress').textContent = 'Installing optional Silero VAD model...';
    await window.go1.installModel('silero');
    $('modelProgress').textContent = 'Silero installed. Restart GO1 to enable VAD in the local Whisper worker.';
  } catch (error) { showError(error); }
  finally { $('installVadButton').disabled = false; }
});
