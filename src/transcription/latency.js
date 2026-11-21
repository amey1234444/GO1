'use strict';

/**
 * Latency statistics are based on actual completed utterances, never simulated bars.
 * postVadMs starts only when a VAD segment has been emitted and includes queue + ASR.
 * It deliberately excludes silence-detection holdback, device capture, and any AI feedback.
 */
const DEFAULT_CAPACITY = 120;
function percentile(values, percentileRank) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const index = Math.ceil(percentileRank * ordered.length) - 1;
  return ordered[Math.max(0, Math.min(ordered.length - 1, index))];
}
function roundDuration(value) {
  if (!Number.isFinite(value) || value < 0) throw new Error('Latency must be finite and nonnegative.');
  return Math.round(value);
}
class LatencyTracker {
  constructor(capacity = DEFAULT_CAPACITY) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 5000) throw new Error('Invalid tracker capacity.');
    this.capacity = capacity;
    this.samples = [];
  }
  record({ queueMs, inferenceMs, postVadMs, vadHoldbackMs }) {
    const sample = {
      queueMs: roundDuration(queueMs),
      inferenceMs: roundDuration(inferenceMs),
      postVadMs: roundDuration(postVadMs),
      vadHoldbackMs: roundDuration(vadHoldbackMs)
    };
    this.samples.push(sample);
    if (this.samples.length > this.capacity) this.samples.shift();
    return this.snapshot();
  }
  reset() { this.samples.length = 0; }
  snapshot() {
    const post = this.samples.map(s => s.postVadMs);
    const inference = this.samples.map(s => s.inferenceMs);
    const queue = this.samples.map(s => s.queueMs);
    return {
      count: post.length,
      postVad: { p50Ms: percentile(post, 0.5), p95Ms: percentile(post, 0.95) },
      inference: { p50Ms: percentile(inference, 0.5), p95Ms: percentile(inference, 0.95) },
      queue: { p50Ms: percentile(queue, 0.5), p95Ms: percentile(queue, 0.95) },
      samples: this.samples.slice(-20).map(x => ({ ...x }))
    };
  }
}
module.exports = { LatencyTracker, percentile, roundDuration };
