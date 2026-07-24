# Golti Search API

Local-only Go service used by Golti for plug-and-play Web Search.

## Endpoints

- `GET /health` — status / active engine
- `POST /v1/search` — requires `Authorization: Bearer <token>` or `X-Golti-Token`

Binds to `127.0.0.1` only.

## Engines

1. Optional SearXNG (`-searxng http://127.0.0.1:8742`) when a sidecar is present
2. Builtin DuckDuckGo HTML / Instant Answer fallback (no API keys)

## Build bundles

```bash
npm run build:search-runtime
```

Produces zips under `dist/search-runtime/` for macOS arm64/x64, Windows x64, and Linux x64.

Packaged Electron builds stage the host platform zip into `build/search-runtime-bundle/bundle.zip` via:

```bash
npm run stage:search-runtime
```

`build:mac` / `build:win` / `build:linux` run staging first so the runtime ships as `extraResources` and installs offline when Web Search is enabled.

## Tests

```bash
npm run test:go
```
