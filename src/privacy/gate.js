'use strict';

/**
 * Main-process privacy interlock. All capture and transcription entry points must
 * check the gate. Epoch tickets stop an asynchronous permission/model-loading
 * operation from starting capture after the user presses the privacy shortcut.
 */
class PrivacyGate {
  constructor() {
    this.paused = false;
    this.epoch = 0;
  }
  enter() {
    this.paused = true;
    this.epoch += 1;
    return this.epoch;
  }
  exit() {
    this.paused = false;
    this.epoch += 1;
    return this.epoch;
  }
  ticket() {
    this.assertAllowed();
    return this.epoch;
  }
  assertAllowed() {
    if (this.paused) throw new Error('Presentation privacy is active. Return to the workspace before starting capture.');
  }
  validate(ticket) {
    this.assertAllowed();
    if (this.epoch !== ticket) throw new Error('Capture request invalidated by a privacy-mode change.');
  }
  snapshot() {
    return Object.freeze({ paused: this.paused, epoch: this.epoch });
  }
}

module.exports = { PrivacyGate };
