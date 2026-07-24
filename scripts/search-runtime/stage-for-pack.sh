#!/usr/bin/env bash
# Stage the current host platform's search-runtime zip for electron-builder extraResources.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VERSION="${SEARCH_RUNTIME_VERSION:-0.1.1}"
SRC_DIR="${1:-$ROOT/dist/search-runtime}"
STAGE_DIR="$ROOT/build/search-runtime-bundle"

detect_label() {
  local os arch
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  case "$os" in
    darwin)
      case "$arch" in
        arm64|aarch64) echo "darwin-arm64" ;;
        x86_64|amd64) echo "darwin-x64" ;;
        *) echo "unsupported platform: $os $arch" >&2; exit 1 ;;
      esac
      ;;
    linux)
      case "$arch" in
        x86_64|amd64) echo "linux-x64" ;;
        *) echo "unsupported platform: $os $arch" >&2; exit 1 ;;
      esac
      ;;
    mingw*|msys*|cygwin*)
      echo "win32-x64"
      ;;
    *)
      echo "unsupported platform: $os $arch" >&2
      exit 1
      ;;
  esac
}

# Optional override for CI cross-pack: SEARCH_RUNTIME_PLATFORM=darwin-arm64
LABEL="${SEARCH_RUNTIME_PLATFORM:-$(detect_label)}"
ZIP_NAME="golti-search-runtime-${VERSION}-${LABEL}.zip"
SRC_ZIP="$SRC_DIR/$ZIP_NAME"

if [[ ! -f "$SRC_ZIP" ]]; then
  echo "Missing $SRC_ZIP — building search runtime for all platforms first..."
  bash "$ROOT/scripts/search-runtime/build.sh" "$SRC_DIR"
fi

if [[ ! -f "$SRC_ZIP" ]]; then
  echo "Still missing $SRC_ZIP after build" >&2
  exit 1
fi

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"
cp "$SRC_ZIP" "$STAGE_DIR/bundle.zip"
if [[ -f "${SRC_ZIP}.sha256" ]]; then
  cp "${SRC_ZIP}.sha256" "$STAGE_DIR/bundle.zip.sha256"
fi

echo "Staged $SRC_ZIP → $STAGE_DIR/bundle.zip"
