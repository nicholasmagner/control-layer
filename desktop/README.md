# ControlLayer desktop app

The desktop app runs ControlLayer entirely on your computer: no Docker, no
database to install, no server to manage. It includes its own private
PostgreSQL database and keeps all data in your user folder.

## Install

Download the installer for your computer from the
[latest release](https://github.com/nicholasmagner/ControlLayer-SOC-2-GRC-Analyst/releases/latest):

| Computer | File | How to install |
| :--- | :--- | :--- |
| **Mac with Apple chip (M1 or later)** | `ControlLayer-<version>-mac-arm64.dmg` | Open the .dmg and drag ControlLayer to Applications. |
| **Mac with Intel chip** | `ControlLayer-<version>-mac-x64.dmg` | Same as above. |
| **Windows 10 / 11** | `ControlLayer-<version>-win-x64.exe` | Run the installer. |
| **Linux (Ubuntu, Debian)** | `ControlLayer-<version>-linux-amd64.deb` | `sudo apt install ./ControlLayer-<version>-linux-amd64.deb` |
| **Linux (any)** | `ControlLayer-<version>-linux-x86_64.AppImage` | `chmod +x` the file, then double-click it. |

### First launch: security prompts

The installers are not yet signed with paid Apple and Microsoft certificates,
so your computer asks you to confirm the first time:

- **Mac:** if macOS says the app "can't be opened", open **System Settings > Privacy & Security**,
  scroll down and click **Open Anyway** next to ControlLayer. You only do this once.
- **Windows:** if SmartScreen shows "Windows protected your PC", click **More info > Run anyway**.

## Using it

1. Open ControlLayer and create your administrator account.
2. Click **Load sample data** to explore, or connect your cloud accounts (below).
3. Everything else works exactly as described in the main [README](../README.md).

### Connecting your cloud accounts

Open **Cloud Accounts** and click **Connect**. Choose **Sign in with your
browser**: your browser opens, you sign in to AWS, Google Cloud or Azure as
usual, and you pick what to scan. This uses the cloud's own command-line tool
(AWS CLI, `gcloud` or Azure CLI); if it isn't installed yet, the dialog links
to the installer. Or choose **Use a read-only key** and follow the short steps
shown. Keys are stored encrypted on this computer.

### Settings

**ControlLayer > Settings…** (Ctrl+, / Cmd+,) opens a small text file for the
organization name, automatic scan schedule and network sharing. Save it, then
choose **ControlLayer > Restart ControlLayer**.

### Sharing with your team or auditor

The desktop app is only reachable from your own computer by default. To let
teammates or your auditor sign in from their computers on the same network,
set `ALLOW_NETWORK_ACCESS=true` in Settings and restart. The address to share
appears in the ControlLayer menu. For access from anywhere, run ControlLayer
on a server with Docker instead (see the main README).

### Where your data is

**ControlLayer > Open Data Folder** shows it:

| OS | Folder |
| :--- | :--- |
| Mac | `~/Library/Application Support/ControlLayer` |
| Windows | `%APPDATA%\ControlLayer` |
| Linux | `~/.config/ControlLayer` |

It holds the database (`postgres/`), your settings (`settings.env`) and logs
(`logs/`). Back up this folder, with ControlLayer closed, to back up
everything. Uninstalling the app does not delete it.

## Building the installers

The installers are built by GitHub Actions on Mac, Windows and Linux
(`.github/workflows/desktop.yml`). Every build is launched and smoke-tested
before it is published. Pushing a tag such as `v0.3.0` creates a GitHub
Release with all installers attached.

To build locally (only for the operating system you are on):

```bash
# repository root
npm ci
NEXT_OUTPUT=standalone npm run build
node scripts/prepare-standalone.mjs

# desktop/
cd desktop
npm ci
npm run dist
node scripts/smoke-test.mjs   # Linux: xvfb-run -a node scripts/smoke-test.mjs
```

Installers are written to `desktop/release/`. To run the desktop app from
source while developing, use `npm start` in `desktop/` after building the server.

### Code signing (optional)

- **Mac:** to sign and notarize with an Apple Developer ID, remove the
  `identity` and `hardenedRuntime` lines under `mac:` in `electron-builder.yml`,
  then add these repository secrets and pass them to the build step:
  `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.
- **Windows:** add `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`.
