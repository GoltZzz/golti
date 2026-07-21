#!/usr/bin/env bash
# Build cross-platform golti-search-api bundles with checksums.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
API_DIR="$ROOT/services/search-api"
OUT_DIR="${1:-$ROOT/dist/search-runtime}"
VERSION="${SEARCH_RUNTIME_VERSION:-0.1.1}"

mkdir -p "$OUT_DIR"

build_one() {
  local goos="$1"
  local goarch="$2"
  local label="$3"
  local ext=""
  if [[ "$goos" == "windows" ]]; then
    ext=".exe"
  fi

  local bin_name="golti-search-api${ext}"
  local stage="$OUT_DIR/stage-${label}"
  rm -rf "$stage"
  mkdir -p "$stage/bin" "$stage/config" "$stage/licenses"

  echo "Building ${label}..."
  (
    cd "$API_DIR"
    CGO_ENABLED=0 GOOS="$goos" GOARCH="$goarch" go build -trimpath -ldflags="-s -w" -o "$stage/bin/${bin_name}" .
  )

  cp "$API_DIR/searxng.settings.yml" "$stage/config/searxng.settings.yml"
  cat > "$stage/README.txt" <<EOF
Golti Search Runtime ${VERSION}
Platform: ${label}

Contents:
  bin/${bin_name}  - local search API (127.0.0.1 only)
  config/          - optional SearXNG settings for advanced sidecar packaging

The Go binary includes a builtin search engine so Web Search works without
external API keys. An optional SearXNG sidecar may be placed under bin/searxng
in future bundle releases.
EOF

  cat > "$stage/licenses/NOTICE.txt" <<EOF
Golti Search Runtime
Includes a local Go search API. Builtin results may query public HTML search endpoints.
Optional SearXNG packaging uses the SearXNG project (AGPL) when present.
EOF

  local archive="$OUT_DIR/golti-search-runtime-${VERSION}-${label}.zip"
  rm -f "$archive"
  (
    cd "$stage"
    zip -qr "$archive" .
  )

  if command -v shasum >/dev/null 2>&1; then
    (cd "$OUT_DIR" && shasum -a 256 "$(basename "$archive")" > "$(basename "$archive").sha256")
  else
    (cd "$OUT_DIR" && sha256sum "$(basename "$archive")" > "$(basename "$archive").sha256")
  fi

  rm -rf "$stage"
  echo "Wrote $archive"
}

build_one darwin arm64 darwin-arm64
build_one darwin amd64 darwin-x64
build_one windows amd64 win32-x64
build_one linux amd64 linux-x64

# Manifest for Electron downloader
cat > "$OUT_DIR/manifest.json" <<EOF
{
  "version": "${VERSION}",
  "artifacts": {
    "darwin-arm64": "golti-search-runtime-${VERSION}-darwin-arm64.zip",
    "darwin-x64": "golti-search-runtime-${VERSION}-darwin-x64.zip",
    "win32-x64": "golti-search-runtime-${VERSION}-win32-x64.zip",
    "linux-x64": "golti-search-runtime-${VERSION}-linux-x64.zip"
  }
}
EOF

echo "Done. Bundles in $OUT_DIR"
