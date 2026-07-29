# Contributing to Golti

Thank you for your interest in contributing to Golti! This document provides guidelines and instructions for contributing to the project.

---

## 🛠️ Local Development Setup

### Prerequisites

- **Node.js**: Version 20 or higher. CI runs on Node 20, and `better-sqlite3` v12 does not build on Node 18.
- **npm**: Standard Node package manager (npm 10+ ships with Node 20).
- **Native build toolchain** - *usually not needed*. `better-sqlite3` downloads a prebuilt binary for mainstream platforms (macOS arm64/x64, Windows x64, Linux x64). It only compiles from source when no prebuilt matches your platform, Node version, or Electron ABI - and that fallback is where `npm install` fails with `node-gyp` errors. Install this only if that happens to you:
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: `build-essential` (or your distro's equivalent) and `python3`
  - **Windows**: Visual Studio Build Tools with the "Desktop development with C++" workload, and `python3`
- **Go**: Version **1.26.4 or higher** - only needed if you work on the search runtime in `services/search-api`. Older Go versions will fail with `go.mod requires go >= 1.26.4`.

### Installation & Running

1. **Clone the Repository**
   ```bash
   git clone https://github.com/GoltZzz/golti.git
   ```
   ```bash
   cd golti
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```
   `postinstall` runs `electron-builder install-app-deps`, which fetches `better-sqlite3` built against Electron's ABI (falling back to a local compile if no prebuilt matches). Either way, expect this step to be slow on a first install.

3. **Start the Development Server**
   ```bash
   npm run dev
   ```
   `dev` rebuilds `better-sqlite3` for Electron again before starting `electron-vite`, so the first launch after a `npm run test` is slower than usual.

### Golti Engine (local C++ inference)

The local inference backend is **llama.cpp's `llama-server`**, run as a sidecar process.

> [!NOTE]
> **You do not need a C++ compiler, CMake, or the CUDA/Vulkan SDKs to work on Golti.** Despite the name, llama.cpp is never built here - `src/main/engine/binary-manager.ts` downloads a **prebuilt** release binary from [ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp/releases) pinned to `LLAMA_VERSION` (currently `b10099`). The optional toolchain under Prerequisites exists only as a `better-sqlite3` fallback, and is unrelated to the engine.

On first use the app downloads the binary into `<userData>/golti-engine/<LLAMA_VERSION>/` and records the chosen backend in a `backend.txt` marker beside it. Backend selection is automatic:

| Platform | Backend | Release asset |
| --- | --- | --- |
| macOS (arm64 / x64) | `metal` | `macos-arm64` / `macos-x64` |
| Windows x64, GPU present | `vulkan` | `win-vulkan-x64` |
| Windows x64, no GPU | `cpu` | `win-cpu-x64` |
| Linux x64, GPU present | `vulkan` | `ubuntu-vulkan-x64` |
| Linux x64, no GPU | `cpu` | `ubuntu-x64` |

GPU presence comes from `src/main/engine/gpu-detect.ts`, which shells out to `nvidia-smi`, `rocm-smi`, or `lspci`. If none are on `PATH` the vendor reads as `none` and you get the CPU build - expect this inside containers and minimal VMs.

**Things that bite when developing against the engine:**

- **Vulkan needs a working driver + loader on the host.** A `vulkan` binary on a machine without one starts and then fails its health check. Install your vendor's driver (and `mesa-vulkan-drivers` / `vulkan-tools` on Linux); confirm with `vulkaninfo`. To sidestep it while working on unrelated code, force CPU by setting the engine device to `cpu` in Settings.
- **ARM Linux and ARM Windows are not supported.** `getPlatformBinaryKey()` maps all Linux to `linux-x64` and all Windows to `win32-x64`, so an ARM host downloads an x64 binary that will not execute. There is no ARM asset wired up yet - treat this as a known gap, not a bug to work around locally.
- **Bumping `LLAMA_VERSION`** changes the download path and invalidates the installed binary; users re-download on next launch. Verify the asset names above still exist in the target release, since upstream has renamed them before.
- **The engine listens on `enginePort`, default `8391`.** If something else holds that port the health check fails; change it in Settings.
- **GPU offload** is derived by `resolveEngineOffload` in `src/main/index.ts` from the `engineDevice` (`auto` / `cpu` / `Vulkan<N>`) and `engineGpuLayers` settings, where a negative layer count means auto-size.
- **Model weights are separate from the binary.** `model-downloader.ts` fetches GGUF files (resumable) per the catalog in `src/shared/model-catalog.ts`. Together with the binary these run to many GB under userData - keep an eye on disk space.
- **Don't conflate `src/main/engine/` with `src/main/ollama/`.** They are parallel but independent sidecar managers.

Engine logic has unit tests (`binary-manager.test.ts`, `engine-process.test.ts`, `model-downloader.test.ts`) that run under plain `npm run test` - no GPU or downloaded binary required.

### Optional: local search runtime

The bundled web-search runtime is downloaded automatically at runtime from GitHub releases into your userData directory - you do **not** need Go to run the app. Build it locally only if you are changing the Go service:

```bash
npm run build:search-runtime
```

### Optional: refreshing the model catalog

The Cookbook's model list lives in two files: `src/shared/model-catalog.ts` (hand-curated entries, including the GGUF URLs the Golti Engine downloads) and `src/shared/model-catalog.generated.ts` (scraped from the Ollama library). Both are **committed source**, so a fresh clone already has the full catalog and `npm run dev` needs nothing extra. The app never fetches either list at runtime.

Run the sync only when you want to pull in models Ollama has added since the last refresh:

```bash
npm run sync:catalog
```

It reads `ollama.com/library` plus the Ollama registry manifests, then rewrites `model-catalog.generated.ts`. Expect a couple of minutes and a large diff. Curated entries always win over generated ones with the same Ollama tag, so refreshing never overwrites hand-written copy or GGUF URLs.

- **Needs Node 22.6 or newer**, which runs TypeScript directly. Nothing else in the project cares - this is the only script with that requirement.
- **Don't resolve merge conflicts in the generated file.** If two branches refresh the catalog, git will report hundreds of conflicting lines. Take either side wholesale (`git checkout --theirs src/shared/model-catalog.generated.ts`) and re-run `npm run sync:catalog`.
- **It fails safe.** The script only writes when at least 150 models resolve, so a throttled or broken run leaves the committed catalog untouched rather than half-emptying it.

---

## 🧪 Testing & Verification

Before submitting code, please ensure that type checks and tests pass:

- **Type Check:**
  ```bash
  npm run typecheck
  ```

- **Run Unit Tests:**
  ```bash
  npm run test
  ```

- **Run Go Tests (Search API):**
  ```bash
  npm run test:go
  ```

- **Run a single test file or test name:**
  ```bash
  npx vitest run src/shared/chat-utils.test.ts -t "extractShells"
  ```

- **Full production build (optional, catches packaging issues):**
  ```bash
  npm run build
  ```

> [!WARNING]
> **`better-sqlite3` ABI mismatch - the most common setup error.**
> `npm run dev` and `postinstall` compile `better-sqlite3` against **Electron's** ABI, but Vitest runs under **plain Node**. Running tests right after `dev` therefore fails with:
>
> ```
> Error: The module '...better_sqlite3.node' was compiled against a different Node.js version
> ```
> ```
> Module did not self-register
> ```
>
> This is expected, not a bug. `npm run test` invokes `scripts/prepare-test-native.js`, which detects the mismatch and rebuilds for Node automatically - so **always run tests via `npm run test`**, not bare `npx vitest`. Switching back to `npm run dev` rebuilds for Electron again. If either side gets stuck, reinstall from scratch:
>
> ```bash
> rm -rf node_modules && npm install
> ```

---

## 🔀 Branching Model & Pull Requests

> [!IMPORTANT]
> **Branch Protection Enforced:** Direct pushes to **`main`** and **`dev`** are strictly disabled on GitHub. All contributions must be submitted via a Pull Request (PR) and require:
> 1. Passing automated CI status checks (`npm run typecheck` & `npm run test`).
> 2. At least one approving review from a repository maintainer before merging.
>
> Note that CI runs **only** `typecheck` and `test` on Ubuntu - it does not run `test:go` or a packaging build. Run those locally when your change touches `services/search-api` or the build scripts.

This project uses a dual-branch model:
- **`main`**: The stable production branch. This is what users consume.
- **`dev`**: The active development branch. All new features and regular bug fixes are merged here.


### Regular Features & Bug Fixes

1. **Fork & Branch:** Create a feature branch off of the `dev` branch.
   ```bash
   git checkout dev
   git pull
   git checkout -b feature/your-feature-name
   ```
2. **Commit Changes:** Write clear, concise commit messages.
3. **Review AI Output:** Thoroughly inspect and verify any AI-assisted code or docs before opening a PR.
4. **Push & Create PR:** Push your branch to GitHub and open a Pull Request targeting the **`dev`** branch.

### Releases (Merging `dev` into `main`)

When all new features and fixes on the `dev` branch are thoroughly tested and ready for production:
1. The repository maintainer creates a **Release Pull Request** comparing `dev` into `main` (`base: main` ← `compare: dev`).
2. Automated CI checks (`typecheck` and `unit tests`) run against the Release PR.
3. Once verified, the maintainer merges the Release PR into `main` and creates a tagged release on GitHub (e.g. `v1.0.0`).
4. `main` now represents the latest stable release for all users.

### Hotfixes

For critical bug fixes that need to go to production immediately:
1. Branch off from the `main` branch:
   ```bash
   git checkout main
   git pull
   git checkout -b hotfix/critical-bug
   ```
2. Open a Pull Request targeting the **`main`** branch.
3. Once the hotfix is merged into `main`, the changes must be merged or cherry-picked back into `dev` to keep both branches in sync.

---

## 🤖 AI-Assisted Contributions

AI tools (such as Copilot, ChatGPT, Claude, Cursor, Antigravity, etc.) are welcome to assist with writing code, tests, and documentation. However, please keep the following in mind:

- **Review Before Submitting:** Always thoroughly inspect, test, and understand all AI-generated contributions before creating a Pull Request. Never submit unreviewed or unverified AI output.
- **Author Accountability:** You, as the pull request author, are 100% responsible for all submitted code, including its correctness, security, licensing, and adherence to project standards.
- **Quality & Verification:** Ensure type checks (`npm run typecheck`) and unit tests (`npm run test`) pass for all AI-assisted modifications before asking for review.

---

## 🎨 Coding Standards & Design Principles

### Where code goes

Golti is an Electron app with a strict process split - putting code in the wrong process is the most common review comment:

| Directory | Responsibility |
| --- | --- |
| `src/main/` | **All** I/O: SQLite, provider HTTP calls, child processes (llama-server, ollama, search runtime), filesystem, system probing. |
| `src/preload/index.ts` | The **single** IPC surface. Every renderer capability is a method on `goltiAPI`. |
| `src/renderer/` | React UI. Only Zustand stores in `src/renderer/stores/` may call `window.goltiAPI`. Never call `ipcRenderer` from the renderer. |
| `src/shared/` | Pure, dependency-free logic imported by both sides. Most unit tests live here. |

Adding a feature that touches I/O means three edits in order: **main handler → preload method → store action**.

> [!NOTE]
> Stores currently type `window.goltiAPI` as `any`, so changing a preload signature is **not** caught by `npm run typecheck`. Verify every call site manually.

Path aliases `@renderer/*` and `@shared/*` are declared in `tsconfig.json`, `electron.vite.config.ts`, **and** `vitest.config.ts` - all three must stay in sync, or tests will resolve imports differently than the app does.

Database migrations in `src/main/db/sqlite.ts` use a versioned `MIGRATIONS` array: **append** a new entry, never edit an existing one.

See [CLAUDE.md](CLAUDE.md) for a fuller architecture tour and [PRODUCT.md](PRODUCT.md) for design principles.

### Style

- **Status over spectacle:** Keep UI simple, clear, and informative.
- **Honest state:** Always display loading, error, or stale data states explicitly.
- **TypeScript:** Avoid using `any` types where possible. Keep type definitions strict.
- **Accessibility:** Aim for WCAG 2.2 AA contrast and proper ARIA labels where applicable. Respect `prefers-reduced-motion`.
- **Styling:** Reuse the CSS custom properties in `src/renderer/styles/variables.css` rather than hardcoding colors.
