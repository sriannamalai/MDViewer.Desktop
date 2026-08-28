#!/usr/bin/env bash
# Downloads the pinned-version libmdviewer release zip for one or more
# TARGETs and records/updates their SHA-256 in vendor/checksums.txt.
#
# Unlike fetch-libmdviewer.sh (which verifies an *existing* pinned
# checksum before trusting a download), this script is the one that
# establishes that pin in the first place — run it once per target after
# a version bump, from a machine with network access to
# github.com/sriannamalai/markdownviewer/releases, then commit the
# updated vendor/checksums.txt. CI's release workflow does NOT run this
# script; it only ever runs fetch-libmdviewer.sh, which fails closed if a
# target has no pinned checksum yet.
#
# Usage:
#   scripts/update-checksums.sh darwin-arm64 darwin-amd64 linux-amd64 linux-arm64 windows-amd64 windows-arm64
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="0.11.0"
CHECKSUMS="vendor/checksums.txt"
DEFAULT_TARGETS=(darwin-arm64 darwin-amd64 linux-amd64 linux-arm64 windows-amd64 windows-arm64)
targets=("${@:-${DEFAULT_TARGETS[@]}}")

sha256_of() {
  if command -v sha256sum >/dev/null; then sha256sum "$1" | awk '{print $1}'
  else shasum -a 256 "$1" | awk '{print $1}'
  fi
}

mkdir -p vendor/tmp
touch "$CHECKSUMS"
for target in "${targets[@]}"; do
  zip="libmdviewer-${VERSION}-${target}.zip"
  url="https://github.com/sriannamalai/markdownviewer/releases/download/v${VERSION}/${zip}"
  dest="vendor/tmp/${zip}"
  echo "fetching ${url}"
  curl -fL --retry 3 -o "$dest" "$url"
  sum="$(sha256_of "$dest")"
  # Replace any existing line for this exact zip name, then append the
  # fresh one — idempotent re-runs never leave duplicate/stale entries.
  grep -v " ${zip}\$" "$CHECKSUMS" > "${CHECKSUMS}.tmp" || true
  mv "${CHECKSUMS}.tmp" "$CHECKSUMS"
  echo "${sum}  ${zip}" >> "$CHECKSUMS"
  echo "recorded ${sum} for ${zip}"
done
LC_ALL=C sort -k2 -o "$CHECKSUMS" "$CHECKSUMS"
rm -rf vendor/tmp
echo "done — review and commit ${CHECKSUMS}"
