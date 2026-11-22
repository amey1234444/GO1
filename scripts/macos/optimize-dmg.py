#!/usr/bin/env python3
"""Compare lossless image encodings; retain the smaller verified image."""
import hashlib
import json
import os
from pathlib import Path
import plistlib
import subprocess
import tempfile

images = list(Path('out/make').rglob('*.dmg'))
if len(images) != 1:
    raise SystemExit('Expected exactly one built DMG')
image = images[0]

def run(*args):
    return subprocess.check_output(args, stderr=subprocess.STDOUT)

def metadata(file):
    info = plistlib.loads(run('hdiutil', 'imageinfo', '-plist', str(file)))
    return {'format': info['Format'], 'bytes': file.stat().st_size,
            'sha256': hashlib.sha256(file.read_bytes()).hexdigest()}

run('hdiutil', 'verify', str(image))
original = metadata(image)
with tempfile.TemporaryDirectory(prefix='go1-compress-', dir=image.parent) as temp:
    candidate = Path(temp) / 'candidate.dmg'
    run('hdiutil', 'convert', str(image), '-format', 'ULMO', '-o', str(candidate))
    run('hdiutil', 'verify', str(candidate))
    compressed = metadata(candidate)
    if compressed['bytes'] < original['bytes']:
        os.replace(candidate, image)
    selected = metadata(image)
report = {'sourceCommit': os.environ.get('GITHUB_SHA'), 'original': original,
          'candidate': compressed, 'selected': selected,
          'savedBytes': original['bytes'] - selected['bytes'],
          'scope': 'Lossless container compression. Mounted app contents and signatures are verified in subsequent steps.'}
Path('out/release-evidence').mkdir(parents=True, exist_ok=True)
Path('out/release-evidence/compression.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
