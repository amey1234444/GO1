'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const asar = require('@electron/asar');
const [bundle, dmg, assessmentFile] = process.argv.slice(2);
if (!bundle || !dmg || !assessmentFile) throw new Error('Usage: package-report.js APP DMG ASSESSMENT_JSON');
const archive = path.join(bundle, 'Contents/Resources/app.asar');
const entries = asar.listPackage(archive);
for (const required of ['/package.json', '/src/main.js', '/src/preload.js', '/src/renderer/index.html']) {
  if (!entries.includes(required)) throw new Error(`Missing runtime file: ${required}`);
}
const unexpected = entries.filter(name => !/^\/(?:src(?:\/|$)|package\.json$|LICENSE(?:\.[^/]*)?$)/.test(name));
if (unexpected.length) throw new Error(`Development files leaked into app.asar: ${unexpected.slice(0, 10)}`);
function sizeTree(dir) {
  let bytes = 0;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) bytes += sizeTree(file);
    else if (item.isFile()) bytes += fs.statSync(file).size;
  }
  return bytes;
}
const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const imageInfo = execFileSync('hdiutil', ['imageinfo', '-plist', dmg]);
const imageFormat = execFileSync('plutil', ['-extract', 'Format', 'raw', '-o', '-', '-'], { input: imageInfo, encoding: 'utf8' }).trim();
const modelManifest = JSON.parse(fs.readFileSync(path.join(bundle, 'Contents/Resources/models/manifest.json'), 'utf8'));
if (sha256(path.join(bundle, 'Contents/Resources/models', modelManifest.file)) !== modelManifest.sha256) throw new Error('Packaged speech model checksum mismatch.');
const report = {
  sourceCommit: process.env.GITHUB_SHA || null,
  version: require('../../package.json').version,
  macOS: execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim(),
  architecture: 'arm64', signing: JSON.parse(fs.readFileSync(assessmentFile, 'utf8')),
  dmg: { filename: path.basename(dmg), bytes: fs.statSync(dmg).size, sha256: sha256(dmg), format: imageFormat },
  app: { bytes: sizeTree(bundle), asarBytes: fs.statSync(archive).size, asarEntries: entries.length,
    nativeBytes: sizeTree(path.join(bundle, 'Contents/Resources/native')),
    modelBytes: sizeTree(path.join(bundle, 'Contents/Resources/models')), runtimeOnly: true },
  bundledSpeech: modelManifest,
  browserDownloadTested: false, remoteMeetingReceiverTested: false
};
fs.mkdirSync('out/release-evidence', { recursive: true });
fs.writeFileSync('out/release-evidence/package-integrity.json', JSON.stringify(report, null, 2) + '\n');
fs.writeFileSync(dmg + '.sha256', `${report.dmg.sha256}  ${path.basename(dmg)}\n`);
console.log(JSON.stringify(report, null, 2));
