'use strict';
(() => {
  let stream, context, frame, timer, starting = false, epoch = 0;
  function stop() {
    epoch++; starting = false; cancelAnimationFrame(frame); clearTimeout(timer);
    stream?.getTracks().forEach(track => track.stop()); stream = null;
    if (context) void context.close().catch(() => {}); context = null;
    $('deviceMeter').value = 0; $('testMicrophone').textContent = 'Test microphone';
  }
  async function refresh() {
    const value = $('microphoneDevice').value;
    const devices = await navigator.mediaDevices.enumerateDevices();
    $('microphoneDevice').replaceChildren(new Option('System default', ''));
    for (const item of devices.filter(x => x.kind === 'audioinput' && x.deviceId !== 'default')) $('microphoneDevice').append(new Option(item.label || `Microphone ${$('microphoneDevice').options.length}`, item.deviceId));
    $('microphoneDevice').value = [...$('microphoneDevice').options].some(x => x.value === value) ? value : '';
  }
  async function test() {
    if (stream || starting) { stop(); $('deviceStatus').textContent = 'Microphone test stopped.'; return; }
    if (state.privacyActive || state.starting || state.recording || state.busy) { $('deviceStatus').textContent = 'Stop the session before testing the microphone.'; return; }
    const ticket = ++epoch; starting = true; $('testMicrophone').textContent = 'Cancel test';
    try {
      if (!await window.go1.requestMicrophone()) throw new Error('Microphone permission was denied.');
      if (ticket !== epoch) return;
      const id = $('microphoneDevice').value;
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: id ? { deviceId: { exact: id } } : true, video: false });
      if (ticket !== epoch || state.privacyActive || state.starting || state.recording) { acquired.getTracks().forEach(t => t.stop()); return; }
      stream = acquired; starting = false; context = new AudioContext();
      const analyser = context.createAnalyser(); analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser); await context.resume();
      if (ticket !== epoch) return;
      const samples = new Float32Array(analyser.fftSize);
      const tick = () => { if (ticket !== epoch) return; analyser.getFloatTimeDomainData(samples); const rms = Math.sqrt(samples.reduce((sum, x) => sum + x*x, 0) / samples.length); $('deviceMeter').value = Math.min(1, rms * 5); frame = requestAnimationFrame(tick); };
      tick(); $('testMicrophone').textContent = 'Stop test'; $('deviceStatus').textContent = 'Speak now. Testing locally for 10 seconds; no transcription or file is created.';
      timer = setTimeout(() => { stop(); $('deviceStatus').textContent = 'Sound check complete.'; }, 10000);
      await refresh();
    } catch (error) { if (ticket === epoch) { stop(); $('deviceStatus').textContent = error.message || String(error); } }
  }
  $('testMicrophone').addEventListener('click', test);
  $('refreshDevices').addEventListener('click', () => refresh().catch(error => { $('deviceStatus').textContent = error.message; }));
  navigator.mediaDevices.addEventListener('devicechange', () => refresh().catch(() => {}));
  window.addEventListener('go1-capture-starting', stop); window.addEventListener('go1-workspace-mask', stop);
  window.addEventListener('go1-workspace-view', event => { if (event.detail !== 'settings') stop(); });
  window.addEventListener('beforeunload', stop);
  void refresh().catch(() => {});
})();
