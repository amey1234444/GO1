'use strict';
(function(root) {
  const owners = new WeakMap();
  function release(stream) {
    if (!stream) return;
    const cleanup = owners.get(stream); owners.delete(stream);
    if (cleanup) cleanup(); else stream.getTracks().forEach(track => track.stop());
  }
  async function acquire({source, deviceId = '', requestMicrophone, prepareSystemAudio, mediaDevices, allowed, AudioContextImpl, MediaStreamImpl}) {
    if (!['microphone','system','both'].includes(source)) throw new Error('Invalid audio source.');
    const streams = []; let mixer;
    const cleanup = () => { for (const stream of streams) stream.getTracks().forEach(track => track.stop()); if (mixer) void mixer.close().catch(() => {}); };
    const check = () => { if (!allowed()) throw new Error('Recording was cancelled.'); };
    try {
      check();
      if (source !== 'microphone') {
        await prepareSystemAudio(); check();
        const system = await mediaDevices.getDisplayMedia({audio:true, video:true}); streams.push(system); check();
        if (!system.getAudioTracks().some(track => track.readyState === 'live')) throw new Error('System audio unavailable. Grant System Audio Recording permission in macOS Privacy & Security, then restart GO1.');
        system.getVideoTracks().forEach(track => { track.enabled = false; });
      }
      if (source !== 'system') {
        if (!await requestMicrophone()) throw new Error('Microphone access denied. Enable it in System Settings → Privacy & Security → Microphone.');
        check();
        const microphone = await mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,channelCount:1,...(deviceId ? {deviceId:{exact:deviceId}} : {})},video:false});
        streams.push(microphone); check();
        if (!microphone.getAudioTracks().some(track => track.readyState === 'live')) throw new Error('The selected microphone is unavailable.');
      }
      if (source !== 'both') { owners.set(streams[0],cleanup); return streams[0]; }
      // Independent input capture, mixed into a single bounded mono speech stream.
      // This is not channel-separated diarization. No monitoring to speakers.
      mixer = new AudioContextImpl();
      const destination = mixer.createMediaStreamDestination();
      for (const input of streams) {
        const gain = mixer.createGain(); gain.gain.value = 0.5;
        mixer.createMediaStreamSource(new MediaStreamImpl(input.getAudioTracks())).connect(gain); gain.connect(destination);
      }
      await mixer.resume(); check();
      const output = destination.stream;
      for (const input of streams) for (const track of input.getAudioTracks()) track.addEventListener('ended', () => {
        for (const mixed of output.getAudioTracks()) { mixed.stop(); mixed.dispatchEvent(new Event('ended')); }
        release(output);
      }, {once:true});
      owners.set(output, () => { output.getTracks().forEach(track => track.stop()); cleanup(); });
      return output;
    } catch (error) { cleanup(); throw error; }
  }
  const api = { acquire, release };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GO1Capture = Object.freeze(api);
})(typeof window !== 'undefined' ? window : globalThis);
