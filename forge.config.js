'use strict';
const fs = require('node:fs');
const path = require('node:path');
// Never include signing credentials in the codebase. Signing is opt-in and
// enforced by scripts/release-macos.sh when creating a public release.
const signing = process.platform === 'darwin' && process.env.GO1_SIGNED_RELEASE === '1';
const packagerConfig = {
  name: 'GO1',
  appBundleId: 'dev.go1.transcription',
  asar: true,
  extendInfo: {
    NSMicrophoneUsageDescription: 'GO1 records microphone audio only when you start a session.',
    NSAudioCaptureUsageDescription: 'GO1 captures Mac system playback audio only after you explicitly select it and grant permission.',
    NSScreenCaptureDescription: 'GO1 requests system capture permission to access computer audio; it does not save video frames.'
  }
};
// An opt-in Mac release must bundle all transcription executables.
if (process.platform === 'darwin' && process.env.GO1_BUNDLE_NATIVE === '1') {
  const dir = path.join(__dirname, 'build/native');
  for (const name of ['ffmpeg', 'ffprobe', 'whisper-cli', 'whisper-server']) {
    if (!fs.existsSync(path.join(dir, 'bin', name))) {
      throw new Error('Missing native executable ' + name + '. Run scripts/build-macos-native.sh.');
    }
  }
  packagerConfig.extraResource = [dir];
}
if (signing) {
  if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD || !process.env.APPLE_TEAM_ID) {
    throw new Error('Signing requested, but Apple notarization credentials are missing.');
  }
  packagerConfig.osxSign = { optionsForFile: () => ({ entitlements: 'build/macos-entitlements.plist' }) };
  packagerConfig.osxNotarize = {
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID
  };
}
module.exports = {
  packagerConfig,
  makers: [
    { name: '@electron-forge/maker-zip', platforms: ['darwin'] },
    { name: '@electron-forge/maker-dmg', platforms: ['darwin'] },
    { name: '@electron-forge/maker-wix', platforms: ['win32'], config: {
      manufacturer: 'GO1 Project',
      description: 'Local, privacy-first multilingual transcription',
      defaultInstallMode: 'perUser',
      shortcutName: 'GO1',
      // Fixed ID must not change across releases, or MSI upgrades may break.
      upgradeCode: '6DD60BAC-2AC4-41AC-BB14-8FC5F194B918'
    } }
  ]
};
