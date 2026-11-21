#!/usr/bin/env bash
set -euo pipefail
# macOS bash 3.2 does not have globstar enabled; use find instead.
file="$(find out/make -type f -name '*.dmg' -print -quit)"
if [[ -z "$file" ]]; then echo 'No DMG found' >&2; exit 1; fi
hdiutil verify "$file"
hdiutil imageinfo "$file" >/dev/null
printf 'Validated unsigned DMG structure: %s\n' "$file"
