#!/usr/bin/env python3
"""Compare official installed Electron code sections with supplied-DMG metadata."""
import argparse
import json
from pathlib import Path
from macho_sections import fingerprint

parser = argparse.ArgumentParser()
parser.add_argument('--reference', type=Path, required=True)
parser.add_argument('--framework', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
reference = json.loads(args.reference.read_text())
expected = reference['electronFrameworkFingerprint']
framework = args.framework
if framework.is_dir():
    candidates = {path.resolve() for path in framework.rglob('Electron Framework')
                  if path.is_file() and 'Electron Framework.framework' in path.parts}
    if len(candidates) != 1:
        raise ValueError(f'Expected one Electron framework binary in {framework}, found {len(candidates)}')
    framework = candidates.pop()
actual = fingerprint(framework)
result = {
    'referenceDMGSHA256': reference['dmgSHA256'], 'referenceElectron': reference['electronVersion'],
    'reference': expected, 'officialInstalledFramework': actual,
    'officialFrameworkPath': str(framework),
    'fullFileMatches': actual['fileSHA256'] == expected['fileSHA256'],
    'selectedCodeAndStringSectionsMatch': actual['sections'] == expected['sections'],
    'meetingReceiverVerified': False,
    'scope': 'Binary section identity only. Does not test meetings or prove universal capture exclusion.'
}
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: result[key] for key in ['referenceElectron', 'fullFileMatches', 'selectedCodeAndStringSectionsMatch']}))
