#!/usr/bin/env python3
"""Read-only static audit of an already extracted, user-supplied Mac app.
No proprietary implementation is copied to GO1. Output is metadata, hashes,
import names and source line locations; absence of a symbol is not proof of
absence of dynamically resolved or framework-level behavior.
"""
import argparse
import hashlib
import json
import plistlib
import re
import struct
from pathlib import Path
from macho_sections import fingerprint


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def macho(path):
    data = path.read_bytes()
    magic, _, _, _, count, _, _, _ = struct.unpack_from('<8I', data)
    if magic != 0xfeedfacf:
        raise ValueError('Expected a thin little-endian Mach-O 64-bit module')
    position = 32
    libraries, imports = [], []
    for _ in range(count):
        command, size = struct.unpack_from('<II', data, position)
        if size < 8 or position + size > len(data):
            raise ValueError('Invalid load command')
        if command in (0xc, 0x80000018, 0x8000001f):
            offset = struct.unpack_from('<I', data, position + 8)[0]
            libraries.append(data[position + offset:position + size].split(b'\0')[0].decode())
        if command == 2:
            symoff, nsyms, stroff, strsize = struct.unpack_from('<4I', data, position + 8)
            for index in range(nsyms):
                strx, kind, _, _, _ = struct.unpack_from('<IBBHQ', data, symoff + index * 16)
                if kind & 0xe == 0:
                    imports.append(data[stroff + strx:stroff + strsize].split(b'\0')[0].decode(errors='replace'))
        position += size
    strings = [x.decode(errors='replace') for x in re.findall(rb'[\x20-\x7e]{5,}', data)]
    relevant = ('Sharing', 'Capture', 'CGWindow', 'NSWindow', 'CGS', 'SLS', 'DisplayAffinity', 'objc_msgSend')
    return {'filename': path.name, 'bytes': len(data), 'sha256': digest(path),
            'linkedLibraries': libraries, 'undefinedSymbolCount': len(imports),
            'relevantImports': [name for name in imports if any(term in name for term in relevant)],
            'hasWindowsOnlyTaskbarMessage': any('Taskbar control is only available on Windows.' in value for value in strings),
            'hasWindowsOnlyDragMessage': any('Native pointer dragging is only available on Windows.' in value for value in strings),
            'exportNameStrings': [name for name in ['hideFromTaskbar', 'beginPointerDrag', 'pointerDragActive', 'primaryButtonDown', 'listCaptureWindows'] if name in strings]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--app', type=Path, required=True)
    parser.add_argument('--main-js', type=Path, required=True)
    parser.add_argument('--dmg', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    contents = args.app / 'Contents'
    info = plistlib.loads((contents / 'Info.plist').read_bytes())
    framework = plistlib.loads((contents / 'Frameworks/Electron Framework.framework/Versions/A/Resources/Info.plist').read_bytes())
    lines = args.main_js.read_text().splitlines()
    terms = ['setContentProtection', 'setActivationPolicy', 'setVisibleOnAllWorkspaces', 'screen-saver', 'backgroundThrottling', 'hideMacosDockIcon', 'loadNativeWindowControl']
    output = {
        'schema': 1, 'analysis': 'Static metadata/import/call-site inspection, not runtime meeting verification',
        'appVersion': info.get('CFBundleShortVersionString'), 'build': info.get('CFBundleVersion'),
        'bundleIdentifier': info.get('CFBundleIdentifier'), 'LSUIElement': info.get('LSUIElement'),
        'electronVersion': framework.get('CFBundleVersion'),
        'electronFrameworkFingerprint': fingerprint(contents / 'Frameworks/Electron Framework.framework/Versions/A/Electron Framework'), 'mainJsSHA256': digest(args.main_js),
        'sourceLineLocations': {term: [n for n, line in enumerate(lines, 1) if term in line] for term in terms},
        'modules': [macho(path) for path in sorted((contents / 'Resources/app.asar.unpacked').rglob('*.node'))],
        'limitations': ['No original-app execution or receiving-device meeting test.', 'Import/string analysis does not prove absence of dynamic/framework behavior.', 'No proprietary native module or application source is redistributed.']
    }
    if args.dmg:
        output['dmgSHA256'] = digest(args.dmg)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2) + '\n')
    print(json.dumps({'output': str(args.output), 'electron': output['electronVersion'], 'modules': len(output['modules'])}))


if __name__ == '__main__':
    main()
