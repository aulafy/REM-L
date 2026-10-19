# REM Negocio for Mac (native app)

[Español](README.md) · **English**

A SwiftUI app that bundles the REM Negocio Node server and a setup assistant. Full design in [`docs/en/macos-assistant.md`](../docs/en/macos-assistant.md).

## What it does
- Starts and supervises the local server (first free port from 4400; if a REM is already running on 4400 it adopts it, so two servers never open the same data) and shows the web interface in its own window, with native downloads and file pickers.
- Assistant: welcome (computer check and FileVault) → your business → how you invoice → **encrypted backups** (folder, passphrase, recovery code with a printable sheet, backup + verification + test restore) → bring your data → access and startup (PIN, open at login, menu-bar icon) → summary.
- **Bring your data**: macOS Contacts, an importer for files from other programs (CSV, Excel, vCard, Facturae XML, DBF) with preview and undo, and optional AI help with your own key (masked sample and consent).
- **Backups** menu: back up now, installation health and restore from a `.rembak` backup. On quit it makes a backup if the last one is more than an hour old.

## Build
```sh
scripts/build-mac-app.sh                      # dist/REM Negocio.app (ad-hoc signature, uses the system Node: for testing only)
NODE_BIN=/path/official-node SIGN_ID="Developer ID Application: …" ARCHS="arm64 x86_64" scripts/build-mac-app.sh   # for distribution
```
Requires macOS 13+ and the Command Line Tools (or Xcode). For distribution you need the **official** Node from nodejs.org (Homebrew's is not portable), an Apple Developer account, and then `notarytool submit` + `stapler staple`.

## Development
```sh
cd mac && swift build -c release
REM_APP_DIR=.. REM_DATA_DIR=/tmp/rem-test .build/release/RemNegocio     # uses the repo's server and temporary data
REM_APP_DIR=.. REM_DATA_DIR=/tmp/rem-test .build/release/RemNegocio --snap-dir /tmp/shots   # walks through the assistant and saves one PNG per screen (with fictitious sample data)
```
Note: on macOS 26+ `@State` is a macro that requires the Xcode plugin; that is why views use `@Loc` (`Loc.swift`), an equivalent that also compiles with the Command Line Tools.

## Distribution
```sh
scripts/build-mac-app.sh && scripts/make-dmg.sh      # .dmg with an Applications shortcut (NOTARY_PROFILE=… to notarise and staple)
```
`.github/workflows/ci.yml` runs the tests and builds on every push; `.github/workflows/mac-release.yml` publishes a release (universal, signed and notarised) when a `v*` tag is pushed and the repository variable `MAC_RELEASE_READY` is `true`: **untested** until the Apple secrets exist (see the file header). The **REM Negocio → Check for updates…** menu queries the latest release on GitHub (only when clicked) and opens the download.

## Security
The server receives a random token per start (`REM_ADMIN_TOKEN`) and the app sends it in `X-REM-Admin`, so it can use the API even when a PIN is set. It only listens on 127.0.0.1.
