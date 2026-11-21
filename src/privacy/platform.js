'use strict';
/** Platform-scoped capture capabilities. Never claim to hide live assistance. */
function supportedSources(platform = process.platform) {
  return {
    microphone: true,
    importAudio: true,
    systemAudio: platform === 'darwin',
    presentationPrivacy: true,
    guaranteedCaptureExclusion: false
  };
}
module.exports = { supportedSources };
