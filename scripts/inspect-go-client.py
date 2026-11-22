#!/usr/bin/env python3
"""Read-only static evidence index for a user-supplied GO Client ASAR and DMG.
Extract the DMG with hdiutil (macOS) or 7zz (Linux) first. This script does not
execute the inspected application or copy its code into the report.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import struct


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def inspect(asar, dmg):
    data = asar.read_bytes()
    if len(data) < 16:
        raise ValueError('Truncated ASAR header')
    header_size = struct.unpack_from('<I', data, 4)[0]
    json_size = struct.unpack_from('<I', data, 12)[0]
    if json_size > header_size or 8 + header_size > len(data):
        raise ValueError('Invalid ASAR header bounds')
    tree = json.loads(data[16:16 + json_size])
    entries = {}

    def walk(files, prefix=''):
        for name, entry in files.items():
            key = prefix + name
            if 'files' in entry:
                walk(entry['files'], key + '/')
            elif 'offset' in entry:
                offset = 8 + header_size + int(entry['offset'])
                size = int(entry['size'])
                if size < 0 or offset < 8 + header_size or offset + size > len(data):
                    raise ValueError('Invalid ASAR entry bounds')
                entries[key] = (offset, data[offset:offset + size])

    walk(tree['files'])
    selected = ['package.json', 'out/main/index.js', 'out/preload/index.js', 'out/preload/dashboard.js']
    patterns = [
        'DEFAULT_CONTENT_PROTECTION', 'setContentProtection', 'setAlwaysOnTop',
        'setVisibleOnAllWorkspaces', 'setSkipTaskbar', 'setIgnoreMouseEvents',
        'setActivationPolicy', 'dock?.hide', 'hideDashboardFromScreenCapturePreference',
        'loadNativeWindowControl', 'class NativeAudioCapture', 'createAudioCapture',
        'hideAppIconPreference', 'class SessionManager', 'class AppPreferencesStore'
    ]
    files = []
    for key in selected:
        offset, content = entries[key]
        hits = []
        for token in patterns:
            needle = token.encode()
            for match in re.finditer(re.escape(needle), content):
                hits.append({'token': token, 'line': content[:match.start()].count(b'\n') + 1,
                             'fileByteOffset': match.start(), 'asarByteOffset': offset + match.start()})
        files.append({'path': key, 'size': len(content), 'sha256': hashlib.sha256(content).hexdigest(),
                      'asarByteOffset': offset, 'matches': hits})
    native = []
    unpacked = asar.with_name(asar.name + '.unpacked')
    for file in sorted(unpacked.rglob('*.node')):
        content = file.read_bytes()
        tokens = [b'CGWindowListCopyWindowInfo', b'kCGWindowOwnerPID', b'kCGWindowLayer',
                  b'CGSSet', b'SLSSet', b'setSharingType', b'NSWindowSharing',
                  b'ScreenCaptureKit', b'SCStream', b'AXUIElement', b'CGEvent']
        native.append({'path': str(file.relative_to(unpacked)), 'size': len(content), 'sha256': digest(file),
                       'symbolStringOffsets': {token.decode(): [m.start() for m in re.finditer(re.escape(token), content)] for token in tokens}})
    return {'schemaVersion': 1, 'method': 'Static ASAR byte/line indexing and native symbol-string search; no execution or meeting capture test',
            'dmg': {'size': dmg.stat().st_size, 'sha256': digest(dmg)},
            'asar': {'size': len(data), 'sha256': digest(asar), 'packedFileCount': len(entries)},
            'packageVersion': json.loads(entries['package.json'][1])['version'],
            'files': files, 'nativeModules': native,
            'receiverTests': {'Zoom': 'not_run', 'Google Meet': 'not_run', 'Microsoft Teams': 'not_run'}}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--asar', required=True, type=Path)
    parser.add_argument('--dmg', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    args.output.write_text(json.dumps(inspect(args.asar, args.dmg), indent=2) + '\n')
