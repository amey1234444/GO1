#!/usr/bin/env python3
"""Read-only package inventory and subsystem locator; never runs recovered code.

The full inventory contains filenames, sizes and hashes, not proprietary source.
Symbol/IPC discovery is a static index, not a reachability or vulnerability proof.
"""
import argparse
import gzip
import hashlib
import json
import plistlib
import re
from collections import Counter
from pathlib import Path


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def record(path, root, prefix):
    item = {'path': prefix + str(path.relative_to(root))}
    if path.is_symlink():
        item.update(kind='symlink', target=str(path.readlink()))
    else:
        item.update(kind='file', bytes=path.stat().st_size, sha256=digest(path))
    return item


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--asar', type=Path, required=True, help='Already extracted ASAR directory')
parser.add_argument('--app', type=Path, required=True, help='Already extracted .app bundle')
parser.add_argument('--output', type=Path, required=True, help='Output directory')
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
inventory = []
for root, prefix in [(args.asar, 'asar/'), (args.app, 'app/')]:
    for path in sorted(root.rglob('*')):
        if path.is_file() or path.is_symlink():
            inventory.append(record(path, root, prefix))
serialized = ''.join(json.dumps(item, sort_keys=True, ensure_ascii=True) + '\n' for item in inventory).encode()
full_name = 'go-client-files-v021.jsonl.gz'
(args.output / full_name).write_bytes(gzip.compress(serialized, mtime=0))

main = args.asar / 'out/main/index.js'
agent = args.asar / 'out/agent/runtime.cjs'
renderer = args.asar / 'out/renderer/assets/index-DNOGIiBe.js'
texts = {str(p.relative_to(args.asar)): p.read_text() for p in [main, agent, renderer]}
markers = {
    'out/main/index.js': [
        'class AgentReleaseStore', 'class ProcessInterviewAgent', 'class NativeAudioCapture',
        'class AudioPreferencesStore', 'class AppPreferencesStore', 'class CredentialStore',
        'class AccountSessionStore', 'class AudioDiagnosticsMonitor', 'class SessionManager',
        'function createAssistantWindow', 'function loadNativeWindowControl',
        'function captureSelectedRegion', 'function trustedSender', 'function getPermissionSnapshot',
        'class ShortcutManager', 'class ApplicationLogger', 'class DiagnosticsSupportService',
        'class ConversationTimerStore', 'class FileConversationCloseStore', 'class FileInterviewStateStore',
        'class ClientUpdateService', 'class NetworkDiagnosticsMonitor', 'class DashboardService',
        'function registerDashboardIpc', 'function createDashboardWindow', 'class LiveChatSupport',
        'class WindowsTrayController', 'requestSingleInstanceLock()', 'function hideMacosDockIcon',
        'function handleDeepLink', 'function recoverAssistantAfterSystemResume',
        'function prepareApplicationQuit', 'latestUrl: "https://garg.to/'
    ],
    'out/agent/runtime.cjs': [
        'class GatewayClient', 'class GatewayLlmClient', 'class StructuredAnswerStream',
        'function createGatewayAnswerCompose', 'function buildAnswerContext',
        'class ConversationNode', 'class DialogueUnderstandingNode', 'class InterviewContextNode',
        'class AnswerGenerationNode', 'class AutomaticAnswerNode', 'class FinalTurnNode',
        'class TurnProcessingNode', 'class InterviewAgentRuntime', 'class ProductSessionClient',
        'class SessionScreenshots', 'class InterviewAgent {', 'class AgentRpcPeer',
        'function bundledAgentPolicyEnvironment', 'function bootAgentProcess'
    ],
    'out/renderer/assets/index-DNOGIiBe.js': [
        'readStoredAnswerPreferences()', 'writeStoredAnswerPreferences(',
        'const OUTPUT_LANGUAGES', 'dashboard-theme', 'LANGUAGE_STORAGE_KEY'
    ]
}
locations = {}
for file, needles in markers.items():
    lines = texts[file].splitlines()
    locations[file] = {needle: [i for i, line in enumerate(lines, 1) if needle in line] for needle in needles}

bridges = {}
for path in sorted((args.asar / 'out/preload').glob('*.js')):
    source = path.read_text()
    block = re.search(r'const IPC = \{(.*?)\n\};', source, re.S)
    channels = dict(re.findall(r'^\s+(\w+): "([^"]+)"', block.group(1), re.M)) if block else {}
    bridges[path.name] = {'sha256': digest(path), 'channels': channels,
                         'channelCount': len(channels),
                         'namespaceCounts': dict(sorted(Counter(value.split(':')[0] for value in channels.values()).items()))}

packages = []
for path in sorted((args.asar / 'node_modules').rglob('package.json')):
    try:
        package = json.loads(path.read_text())
    except (ValueError, UnicodeError):
        continue
    if package.get('name') and package.get('version'):
        packages.append({'name': package['name'], 'version': package['version'],
                         'path': str(path.relative_to(args.asar)), 'license': package.get('license')})
manifest = json.loads((args.asar / 'out/agent/manifest.json').read_text())
agent_hash = digest(agent)
info = plistlib.loads((args.app / 'Contents/Info.plist').read_bytes())
client = json.loads((args.asar / 'package.json').read_text())
policy_block = re.search(r'function bundledAgentPolicyEnvironment\(\) \{(.*?)\n\}', texts['out/agent/runtime.cjs'], re.S)
profile_literals = dict(re.findall(r'(INTERVIEW_[A-Z_]+): "([^"]*)"', policy_block.group(1))) if policy_block else {}
summary = {
    'schemaVersion': 1,
    'scope': 'Static package inventory and selected subsystem review. Inventory coverage is not full semantic review of every dependency, native instruction, remote agent or server.',
    'originalAppExecuted': False, 'remoteServicesQueried': False, 'meetingReceiverVerified': False,
    'app': {key: info.get(key) for key in ['CFBundleIdentifier', 'CFBundleShortVersionString', 'CFBundleVersion', 'LSUIElement', 'LSMinimumSystemVersion']},
    'clientDependencies': client['dependencies'], 'packageManifests': packages,
    'fullInventory': {'file': full_name, 'entries': len(inventory),
                      'regularFiles': sum(x['kind'] == 'file' for x in inventory),
                      'asarFiles': sum(x['path'].startswith('asar/') and x['kind'] == 'file' for x in inventory),
                      'uncompressedSHA256': hashlib.sha256(serialized).hexdigest(),
                      'compressedSHA256': digest(args.output / full_name)},
    'keyArtifacts': [x for x in inventory if x['path'] in {
        'asar/out/main/index.js', 'asar/out/main/agent-bootstrap.js', 'asar/out/agent/runtime.cjs',
        'asar/out/agent/manifest.json', 'asar/out/renderer/assets/index-DNOGIiBe.js',
        'app/Contents/Resources/app.asar'}],
    'bundledAgent': {'manifest': manifest, 'actualSHA256': agent_hash,
                     'manifestHashMatches': agent_hash == manifest['sha256'],
                     'manifestSizeMatches': agent.stat().st_size == manifest['sizeBytes']},
    'bundledProfileLiterals': profile_literals,
    'profileCaveat': 'These are client configuration identifiers, not independently verified model identities, server routing, current availability or access credentials.',
    'preloadBridges': bridges, 'subsystemLocations': locations
}
(args.output / 'go-client-package-audit-v021.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps({'inventory': summary['fullInventory'], 'packages': len(packages),
                  'ipcCounts': {key: value['channelCount'] for key, value in bridges.items()},
                  'agentHashMatches': summary['bundledAgent']['manifestHashMatches']}))
