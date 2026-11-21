module.exports = {
  packagerConfig: {
    name: 'GO1',
    appBundleId: 'dev.go1.transcription',
    asar: true,
    extendInfo: {
      NSMicrophoneUsageDescription: 'GO1 records audio only when you start a transcription session.'
    }
  },
  makers: [
    { name: '@electron-forge/maker-zip', platforms: ['darwin'] },
    { name: '@electron-forge/maker-dmg', platforms: ['darwin'] }
  ]
};
