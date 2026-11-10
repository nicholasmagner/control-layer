# ControlLayer desktop app

The desktop app runs ControlLayer entirely on your computer: no Docker, no
database to install, no server to manage. It includes its own private
PostgreSQL database and keeps all data in your user folder.

## Install

Download the installer for your computer from the
[latest release](https://github.com/nicholasmagner/control-layer/releases/latest):

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
2. Click **Load sample data** to explore, or connect your accounts (below).
3. Everything else works exactly as described in the main [README](../README.md).

### Connecting your accounts

Open **Integrations** and click **Connect**. Choose **Sign in with your
browser**: your browser opens, you sign in to AWS, Google Cloud, Azure,
Microsoft 365 or GitHub as usual, and you pick what to scan. This uses the
service's own command-line tool (AWS CLI, `gcloud`, Azure CLI or GitHub CLI);
if it isn't installed yet, the dialog links to the installer. Or choose the key
option and follow the short steps shown (Google Workspace always uses a key).
Keys are stored encrypted on this computer.

### Servers and laptops

Open **Devices** > **Add a device** for the command to run on each machine.
Other machines send their reports to this computer, so turn on network access
first (ControlLayer menu > Network Settings…) and use the network address the
menu shows. For servers that must report around the clock, run ControlLayer
on a server with Docker.

### Trust Center

The public Trust Center page (`/trust`) is served by the app, so others can
only reach it while this computer is on and network access is turned on. For
an always-on Trust Center, run ControlLayer on a server with Docker.

### Settings

Open **Settings** in the app to set your organization name, automatic scan
schedule, the optional assistant's API key and more. Changes apply immediately.

### Sharing with your team or auditor

The desktop app is only reachable from your own computer by default. To let
teammates or your auditor sign in from their computers on the same network,
choose **ControlLayer > Network Settings…**, set `ALLOW_NETWORK_ACCESS=true`, save, and choose **ControlLayer > Restart ControlLayer**. The address to share
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
