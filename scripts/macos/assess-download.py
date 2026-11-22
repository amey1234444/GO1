#!/usr/bin/env python3
"""Assess an intact app copy with a synthetic browser-download quarantine attribute.

Does not remove quarantine, approve the app or disable Gatekeeper. This is a policy
assessment, not browser/Finder UI automation or a successful first-launch claim.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

if len(sys.argv) != 2:
    raise SystemExit('Usage: assess-download.py /mounted/GO1.app')
source = Path(sys.argv[1])
output = Path('out/release-evidence')
output.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix='go1-download-check-') as temp:
    app = Path(temp) / 'GO1.app'
    subprocess.run(['ditto', str(source), str(app)], check=True)
    quarantine = f'0083;{int(time.time()):x};GO1-CI;'
    subprocess.run(['xattr', '-w', 'com.apple.quarantine', quarantine, str(app)], check=True)
    subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app)], check=True)
    observed = subprocess.check_output(['xattr', '-p', 'com.apple.quarantine', str(app)], text=True).strip()
    if observed != quarantine:
        raise SystemExit('Quarantine setup did not persist')
    assessments = {}
    for name, command in {
        'gatekeeper': ['spctl', '--assess', '--type', 'execute', '--verbose=4', str(app)],
        'distribution': ['syspolicy_check', 'distribution', str(app)]
    }.items():
        result = subprocess.run(command, capture_output=True, text=True, timeout=180)
        assessments[name] = {'exitCode': result.returncode, 'output': result.stdout + result.stderr}
    trusted = all(item['exitCode'] == 0 for item in assessments.values())
    report = {'sourceCommit': os.environ.get('GITHUB_SHA'), 'signatureVerified': True,
              'syntheticQuarantineApplied': True, 'policyAccepted': trusted,
              'assessments': assessments, 'browserDownloadTested': False,
              'finderLaunchTested': False, 'quarantineRemoved': False}
    (output / 'download-policy.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    if os.environ.get('GO1_SIGNED_RELEASE') == '1' and not trusted:
        raise SystemExit('Signed release failed downloaded-app policy assessment')
