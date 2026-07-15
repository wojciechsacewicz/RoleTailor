# Install RoleTailor

This file is an execution runbook for a coding agent. Install and launch RoleTailor on the user's Linux desktop, then report what you changed and where the app started. Do not fill onboarding with invented data.

## Operating rules

- Work in the repository the user pointed you to. If it is not cloned yet, ask for its Git URL and clone it into a user-approved directory.
- Support Linux on x86_64. Stop and explain the limitation on another operating system or architecture instead of improvising a port.
- Inspect the system before changing it. Reuse installed tools and packages when they satisfy the checks below.
- Ask before running `sudo`, installing system packages, opening a browser for authentication, or changing shell configuration.
- Keep user profile data out of the repository. RoleTailor collects it through onboarding and writes it to the operating system's application-data directory.
- Use `npm ci`, not `npm install`, so the checked-in lockfile controls JavaScript dependencies.
- Do not weaken tests, skip the release path audit, replace Codex authentication, or add API keys to project files.

## 1. Inspect the machine

From the repository root, record the output of:

```bash
uname -s
uname -m
cat /etc/os-release
node --version
npm --version
rustc --version
cargo --version
codex --version
```

Missing commands may exit non-zero; continue the inspection and collect all missing prerequisites before asking for approval. Require Linux and `x86_64`. Use a current Node.js LTS release and the stable Rust toolchain.

## 2. Install native dependencies

Choose the block matching `/etc/os-release`. Explain the packages and get approval before running it.

### Arch Linux or CachyOS

```bash
sudo pacman -S --needed \
  base-devel webkit2gtk-4.1 curl wget file openssl \
  appmenu-gtk-module libappindicator-gtk3 librsvg xdotool \
  patchelf chromium
```

### Debian or Ubuntu

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev \
  patchelf chromium
```

Use `chromium-browser` instead of `chromium` only when that is the package provided by the installed distribution.

### Fedora

```bash
sudo dnf install -y \
  webkit2gtk4.1-devel openssl-devel curl wget file \
  libappindicator-gtk3-devel librsvg2-devel libxdo-devel \
  patchelf chromium
sudo dnf group install -y "c-development"
```

For another distribution, use its package manager to install the equivalent Tauri 2 development libraries plus `patchelf` and a Chromium executable named `chromium`, `chromium-browser`, or `google-chrome-stable`. Do not guess package names; consult the distribution's package index or the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

## 3. Install missing language tools

If Node.js or npm is missing, install the current Node.js LTS release using the user's existing version manager or the official Node.js installer. Do not replace a working user-managed Node installation.

If Rust is missing, ask before using the official rustup installer:

```bash
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
```

After rustup finishes, load the environment it prints and confirm `rustc --version` and `cargo --version` work.

If Codex is missing, ask before using the official installer:

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

Confirm the result with `codex --version`. Start `codex` and let the user choose **Sign in with ChatGPT** if authentication is required. Never ask the user to paste a ChatGPT token or API key into the repository, a command, or RoleTailor.

## 4. Install and verify RoleTailor

Run these commands from the repository root:

```bash
npm ci
npm run build
npm run lint
npm test
cargo test --manifest-path src-tauri/Cargo.toml
```

Fix failures caused by missing prerequisites or a broken local install. Do not edit product code merely to make setup pass. If a project test fails on a clean checkout, stop and report the failing command and its output.

## 5. Launch the app

Run:

```bash
npm run tauri:dev
```

Keep the process attached unless the user asks for a background service. Confirm that the RoleTailor window opens and reaches onboarding. Leave all personal fields for the user to complete.

## Optional: build installable packages

When the user asks for a production build, run:

```bash
NO_STRIP=1 npm run tauri:build
```

The build must finish with `Release path audit passed`. Report the exact paths of the generated `.AppImage` and `.deb` files under `src-tauri/target/release/bundle/`. Do not publish or upload them without separate permission.

## Completion report

Tell the user:

- which prerequisites or packages you installed;
- which verification commands passed;
- whether Codex still needs interactive ChatGPT login;
- whether the app opened successfully;
- the package paths, if you built a release.
