#!/usr/bin/env python3
"""Publish only a verified image with explicit trust status and immutable provenance."""
import hashlib
import json
import os
from pathlib import Path
import shutil

root = Path('out')
integrity = json.loads((root / 'release-evidence/package-integrity.json').read_text())
smoke = json.loads((root / 'release-evidence/packaged-smoke.json').read_text())
assert smoke['status'] == 'passed', 'Packaged app smoke test failed'
assert smoke['sourceCommit'] == integrity['sourceCommit'] == os.environ['GITHUB_SHA']
assert smoke['appVersion'] == integrity['version']
assert smoke['dmg']['sha256'] == integrity['dmg']['sha256']
assert integrity['signing']['signatureVerified'] is True
images = list((root / 'make').rglob('*.dmg'))
assert len(images) == 1, 'Expected exactly one DMG'
assert hashlib.sha256(images[0].read_bytes()).hexdigest() == integrity['dmg']['sha256']
download_policy = json.loads((root / 'release-evidence/download-policy.json').read_text())
assert download_policy['sourceCommit'] == integrity['sourceCommit']
assert download_policy['syntheticQuarantineApplied'] is True
assert download_policy['signatureVerified'] is True
notarized = integrity['signing']['developerIdNotarized']
if notarized:
    assert integrity['signing']['gatekeeperExitCode'] == 0
    assert download_policy['policyAccepted'] is True
label = 'Apple-notarized' if notarized else 'ad-hoc preview, NOT Apple-notarized'
dest = root / 'distribution'
dest.mkdir(parents=True, exist_ok=True)
for source in [images[0], Path(str(images[0]) + '.sha256'),
               root / 'release-evidence/package-integrity.json', root / 'release-evidence/packaged-smoke.json',
               root / 'release-evidence/download-policy.json', root / 'release-evidence/compression.json']:
    shutil.copy2(source, dest / source.name)
tag = f"v{integrity['version']}-mac.{os.environ['GITHUB_RUN_NUMBER']}"
notes = f"""Apple Silicon (ARM64) DMG — {label}.

Download **{images[0].name}** directly below. The automatically generated source ZIP/tar archives are not installers.

Size: {integrity['dmg']['bytes'] / 1024 / 1024:.1f} MiB. SHA-256: `{integrity['dmg']['sha256']}`.
Source: `{integrity['sourceCommit']}`.

Signature integrity, mounted-image validation and {len(smoke['steps'])} packaged-app checks passed, including real local speech/AI inference from a copied app. A synthetic quarantine policy assessment is recorded separately in download-policy.json. Actual browser download/Finder first launch, hardware microphone input and remote meeting receivers were not tested.

Open the DMG, drag GO1.app to Applications, eject the disk and open Applications → GO1. Base Compact multilingual speech weights and native audio tools are included; transcription works offline on first launch. Optional AI uses a separately installed Ollama.
"""
if not notarized:
    notes += '\n**This preview does not pass normal Developer ID notarization requirements.** It may be blocked by Gatekeeper after a browser download. It is not a warning-free release. See docs/INSTALL_MAC.md for signing setup and diagnosis; do not disable Gatekeeper.\n'
(dest / 'RELEASE_NOTES.md').write_text(notes)
with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
    output.write(f'artifact_name=GO1-macOS-arm64-{tag}\nrelease_tag={tag}\nnotarized={str(notarized).lower()}\n')
