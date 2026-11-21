/* global AudioWorkletProcessor, registerProcessor, sampleRate */
'use strict';

class Pcm16Resampler extends AudioWorkletProcessor {
  constructor() {
    super();
    this.inputIndex = 0;
    this.nextOutputAt = 0;
    this.lastSample = 0;
    this.ratio = sampleRate / 16000;
    this.samples = new Int16Array(8000); // 0.5 second frame
    this.length = 0;
    this.port.onmessage = event => {
      if (event.data?.type === 'flush') {
        this.emit();
        this.port.postMessage({ type: 'flushed' });
      }
    };
  }
  emit() {
    if (!this.length) return;
    const bytes = this.samples.slice(0, this.length);
    this.port.postMessage({ type: 'pcm', bytes }, [bytes.buffer]);
    this.length = 0;
  }
  process(inputs) {
    const channels = inputs[0] || [];
    if (!channels.length) return true;
    const count = channels[0].length;
    for (let i = 0; i < count; i++) {
      let value = 0;
      for (const channel of channels) value += channel[i] || 0;
      value /= channels.length;
      const index = this.inputIndex++;
      while (this.nextOutputAt <= index) {
        const fraction = index === 0 ? 1 : Math.max(0, Math.min(1, this.nextOutputAt - (index - 1)));
        const interpolated = this.lastSample + (value - this.lastSample) * fraction;
        const normalized = Math.max(-1, Math.min(1, interpolated));
        this.samples[this.length++] = normalized < 0 ? Math.round(normalized * 32768) : Math.round(normalized * 32767);
        if (this.length >= this.samples.length) this.emit();
        this.nextOutputAt += this.ratio;
      }
      this.lastSample = value;
    }
    return true;
  }
}
registerProcessor('go1-pcm16-resampler', Pcm16Resampler);
