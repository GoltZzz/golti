# Optional SearXNG sidecar packaging

The Go search API works plug-and-play with its builtin engine. To package a
standalone SearXNG sidecar for advanced self-hosting:

1. Build a portable SearXNG/Python environment for each target OS.
2. Place it under `bin/searxng/` in the runtime zip next to `golti-search-api`.
3. Ship `config/searxng.settings.yml` (already included).
4. Electron will start SearXNG on `127.0.0.1:8742` when the launcher exists and
   pass `-searxng http://127.0.0.1:8742` to the Go API.

Validation checklist:
- bind address is localhost only
- JSON `/search?format=json` returns results
- Go API health reports `searxReady: true`
- Golti stops both processes on quit
