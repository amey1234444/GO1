'use strict';
// Pixel evidence requires a visible positive control. A blank capture is not exclusion.
function phaseVerdict(sample, stream = false) {
  if (!sample || (stream && sample.frames < 1)) return 'inconclusive';
  const magenta = stream ? sample.maxMagenta : sample.magenta;
  const cyan = stream ? sample.minCyan : sample.cyan;
  if (!Number.isFinite(magenta) || !Number.isFinite(cyan) || cyan < 5000) return 'inconclusive';
  if (magenta >= 1000) return 'visible';
  if (magenta <= 10) return 'absent';
  return 'inconclusive';
}
function phases(result) {
  return {
    screenshot: phaseVerdict(result?.screenshot),
    streamInitial: phaseVerdict(result?.stream?.streamInitial, true),
    streamRefreshed: phaseVerdict(result?.stream?.streamRefreshed, true)
  };
}
function captureVerdict(control, result) {
  if (control?.status === 'blocked' || result?.status === 'blocked') return { result: 'blocked', receiverVerified: false };
  const baseline = phases(control), actual = phases(result);
  if (control?.status !== 'captured' || result?.status !== 'captured' || !control.markerOnScreen || !result.markerOnScreen || Object.values(baseline).some(x => x !== 'visible')) {
    return { result: 'inconclusive', baseline, phases: actual, receiverVerified: false };
  }
  return {
    result: Object.values(actual).some(x => x === 'visible') ? 'exposed'
      : Object.values(actual).every(x => x === 'absent') ? 'excluded-in-tested-paths' : 'inconclusive',
    baseline, phases: actual, receiverVerified: false
  };
}
module.exports = { phaseVerdict, captureVerdict };
