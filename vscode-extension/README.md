# Lumit VS Code Extension

Lumit is now a full VS Code extension experience with:
- Activity Bar container (`Lumit`)
- Sidebar panel (`Assistant`) with prompt UI
- Local bridge server for the desktop app (`127.0.0.1:<port>`)
- Command palette actions
- Status bar integration

## What It Provides

## 1) Sidebar Assistant UI
- Open `Lumit` from the Activity Bar.
- Enter `Prompt`, optional `System`, optional `Model family`.
- Run prompt and view response directly in the sidebar.

## 2) Bridge API for Desktop Lumit
- `GET /health`
- `GET /status`
- `POST /complete`

Default port is `8767` (configurable).

## 3) Commands
- `Lumit: Open Sidebar`
- `Lumit: Show Bridge Status`
- `Lumit: Restart Bridge Server`
- `Lumit: Run Prompt`

## 4) Status Bar
- Shows `Lumit` quick entry (can be disabled in settings).

## Settings
- `lumit.bridgePort` (number, default `8767`)
- `lumit.defaultModelFamily` (string, optional)
- `lumit.autoStartBridge` (boolean, default `true`)
- `lumit.showStatusBar` (boolean, default `true`)

## Install (Local)

### Method A: Folder install
Copy this folder to:
- Windows: `%USERPROFILE%\.vscode\extensions\lumit-bridge-1.1.0`

Restart VS Code.

### Method B: VSIX
```bash
npm install -g @vscode/vsce
cd vscode-extension
vsce package
code --install-extension lumit-bridge-1.1.0.vsix
```

## Test Quickly
1. Open VS Code.
2. Open `Lumit` in Activity Bar.
3. Run a prompt in sidebar.
4. Confirm status endpoint:
```bash
curl http://127.0.0.1:8767/status
```

## Publishing to Marketplace
This repo does **not** auto-publish.
To appear in VS Code Extensions search, you must publish with your own publisher + PAT:
1. Create publisher (Azure DevOps / Marketplace).
2. Ensure `publisher` and `repository.url` in `package.json` match your real account/repo.
3. `vsce login <publisher>`
4. `vsce publish`

Until then, it works as a local or VSIX-installed extension only.
