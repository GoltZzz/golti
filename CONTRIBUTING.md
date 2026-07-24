# Contributing to Golti

Thank you for your interest in contributing to Golti! This document provides guidelines and instructions for contributing to the project.

---

## 🛠️ Local Development Setup

### Prerequisites
- **Node.js**: Version 18 or higher
- **npm**: Standard Node package manager
- **Go**: Version 1.20+ (optional/if working on the search API runtime service in `services/search-api`)

### Installation & Running

1. **Clone the Repository**
   ```bash
   git clone https://github.com/golti/golti.git
   cd golti
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Start the Development Server**
   ```bash
   npm run dev
   ```

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

---

## 🔀 Branching Model & Pull Requests

 [!IMPORTANT]
 **Branch Protection Enforced:** Direct pushes to **`main`** and **`dev`** are strictly disabled on GitHub. All contributions must be submitted via a Pull Request (PR) and require:
 1. Passing automated CI status checks (`npm run typecheck` & `npm run test`).
 2. At least one approving review from a repository maintainer before merging.

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

- **Status over spectacle:** Keep UI simple, clear, and informative.
- **Honest state:** Always display loading, error, or stale data states explicitly.
- **TypeScript:** Avoid using `any` types where possible. Keep type definitions strict.
- **Accessibility:** Aim for WCAG 2.2 AA contrast and proper ARIA labels where applicable.
