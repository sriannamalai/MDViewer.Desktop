#!/usr/bin/env bash
# Downloads the pinned libmdviewer release artifact for TARGET (default:
# host), verifies its SHA-256 against vendor/checksums.txt, unpacks to
# vendor/libmdviewer/<target>/, and (macOS) rewrites the dylib install
# name to @rpath/libmdviewer.dylib so binaries resolve it via rpath.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="0.5.0"
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64)  host=darwin-arm64 ;;
  Darwin-x86_64) host=darwin-amd64 ;;
  Linux-x86_64)  host=linux-amd64 ;;
  Linux-aarch64) host=linux-arm64 ;;
  MINGW*|MSYS*)  host=windows-amd64 ;;
  *) echo "unsupported host $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac
target="${1:-$host}"
zip="libmdviewer-${VERSION}-${target}.zip"
dest="vendor/libmdviewer/${target}"

expected="$(grep " ${zip}\$" vendor/checksums.txt | awk '{print $1}')"
if [ -z "$expected" ]; then
  echo "no pinned checksum for ${zip} in vendor/checksums.txt" >&2; exit 1
fi

if [ -f "${dest}/.ok-${VERSION}" ]; then
  echo "already fetched ${dest}"; exit 0
fi

mkdir -p vendor/tmp "${dest}"
url="https://github.com/sriannamalai/markdownviewer/releases/download/v${VERSION}/${zip}"
curl -fL --retry 3 -o "vendor/tmp/${zip}" "$url"
actual="$(shasum -a 256 "vendor/tmp/${zip}" | awk '{print $1}')"
if [ "$actual" != "$expected" ]; then
  echo "checksum mismatch for ${zip}: got ${actual} want ${expected}" >&2; exit 1
fi
unzip -o -q "vendor/tmp/${zip}" -d "${dest}"
rm -rf vendor/tmp

if [[ "$target" == darwin-* ]]; then
  install_name_tool -id @rpath/libmdviewer.dylib "${dest}/libmdviewer.dylib"
fi
touch "${dest}/.ok-${VERSION}"
echo "fetched ${dest} (verified)"
