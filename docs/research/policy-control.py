#!/usr/bin/env python3
"""Compare policy diagnostics with an independently compiled minimal app.
No security settings are disabled. No app is launched. Results are diagnostic only.
"""
import hashlib
import json
from pathlib import Path
import os
import plistlib
import subprocess
import tempfile
import time

out = Path('out/policy-diagnostics');out.mkdir(parents=True, exist_ok=True)
images = list(Path('distribution').rglob('*.dmg'))
if len(images) != 1:
    raise SystemExit('Expected one downloaded release DMG')
image = images[0]
expected = '7e8ee85a0a4b1a93ba3f97dcc7a3a04c6aa9efdbe810aa0fe02ded93071af158'
if hashlib.sha256(image.read_bytes()).hexdigest() != expected:
    raise SystemExit('Release image hash mismatch')

def run(*args):
    return subprocess.check_output(args, stderr=subprocess.STDOUT)

def assess(app):
    subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app)], check=True)
    run('xattr', '-w', 'com.apple.quarantine', f'0083;{int(time.time()):x};GO1-CI;', str(app))
    result = {}
    for name, args in {'gatekeeper': ['spctl','--assess','--type','execute','--verbose=4'],
                       'distribution': ['syspolicy_check','distribution']}.items():
        p = subprocess.run([*args,str(app)], capture_output=True, text=True, timeout=180)
        result[name] = {'exitCode': p.returncode, 'output': p.stdout+p.stderr}
    result['signatureVerified'] = True
    result['internalXprotectError'] = 'Internal Xprotect Error' in result['distribution']['output']
    return result

with tempfile.TemporaryDirectory(prefix='go1-policy-control-') as tmp:
    root=Path(tmp);mount=root/'mount';mount.mkdir()
    run('hdiutil','attach','-readonly','-nobrowse','-mountpoint',str(mount),str(image))
    try:
        target=root/'GO1.app';run('ditto',str(mount/'GO1.app'),str(target))
    finally:
        run('hdiutil','detach',str(mount))
    control=root/'PolicyControl.app';binary=control/'Contents/MacOS/Control';binary.parent.mkdir(parents=True)
    source=root/'control.c';source.write_text('int main(void) { return 0; }\n')
    run('xcrun','clang','-arch','arm64',str(source),'-o',str(binary))
    with (control/'Contents/Info.plist').open('wb') as f:
        plistlib.dump({'CFBundleIdentifier':'dev.go1.policy-control','CFBundleName':'PolicyControl',
                      'CFBundleExecutable':'Control','CFBundlePackageType':'APPL',
                      'CFBundleVersion':'1','CFBundleShortVersionString':'1.0'},f)
    run('codesign','--force','--sign','-',str(control))
    report={'diagnosticCommit':os.environ.get('GITHUB_SHA'), 'releaseDmgSha256':expected,
            'macOS':run('sw_vers','-productVersion').decode().strip(),
            'controlSource':source.read_text(),'controlExecutableSha256':hashlib.sha256(binary.read_bytes()).hexdigest(),
            'control':assess(control),'go1':assess(target),
            'securitySettingsChanged':False,'appsLaunched':False,'approvedForDistribution':False}
    report['sameInternalScannerErrorInControl'] = report['control']['internalXprotectError'] and report['go1']['internalXprotectError']
    report['interpretation'] = ('Same internal scanner error occurs in the independently compiled control; this supports an environment/tool explanation, but does not certify GO1 or waive notarization.'
        if report['sameInternalScannerErrorInControl'] else 'Control does not reproduce the same scanner error; the GO1 result requires further investigation.')
    (out/'policy-control.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
