'use strict';

/** Cancel active work when the user switches GO1 into presentation privacy mode.
 * No meeting-app detection, invisibility guarantees or hidden background capture.
 */
function cancelPrivateProcessing({ activeController, liveController, liveSession } = {}) {
  const canceled = {
    batch: Boolean(activeController),
    live: Boolean(liveSession || liveController)
  };
  activeController?.abort();
  liveController?.abort();
  liveSession?.cancel();
  return canceled;
}

module.exports = { cancelPrivateProcessing };
