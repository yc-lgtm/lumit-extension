# Lumit v2

Lumit is a floating Windows desktop AI panel (Electron + Node controller) with:
- multi-provider model routing
- Roblox Studio / Blender / Gmail / Slides / Files / Web agents
- VS Code bridge mode (`codex`) over local HTTP (`127.0.0.1:8767`)
- local safety controls and explicit failure messages for missing setup

## Current UI Features
- Soft skeuomorphic panel design (clean cards, soft controls, reduced harsh colors)
- Menu bar with live status
- AI chat with streaming steps and final results
- Account avatar picker
- Navigation tabs:
  - `Chat`
  - `Files`
  - `History`
  - `Settings`
- Tools dropdown + active tool chip
- Empty-state quick prompt actions
- File tree browser with one-click attach
- Attachments list with remove controls
- Tetris loader animation while generating
- Voice button (if webkit speech API is available)
- Stop / clear / focus hotkey support

## Project Layout
- `apps/electron` desktop app (window + renderer + preload)
- `apps/controller` orchestrator server + model router + agents
- `plugin` Roblox Studio Lua bridge files
- `blender_addon` Blender TCP bridge addon
- `vscode-extension` Lumit Bridge extension for VS Code models
- `tests/smoke.js` first-pass smoke validation

## Quick Start
1. Install dependencies:
```bash
npm install
```
2. Create env file:
```bash
copy .env.example .env
```
3. Start Lumit:
```bash
npm start
```
4. Run smoke checks:
```bash
npm run smoke
```

## How To Use the App
1. Pick a model from the top dropdown.
2. Type in the chat box or click a quick prompt.
3. Press `Enter` to send (`Shift+Enter` for newline).
4. Watch status + steps stream in the chat.
5. Use `Stop` to cancel current orchestration.

### Chat Tab
- Main prompt interface.
- Shows routing/execution steps and final output.

### Files Tab
- Browse workspace tree from `GET /api/file-tree`.
- Click a file to attach it into the prompt session.
- Change depth and refresh as needed.

### History Tab
- Shows past prompts with status + detected route target.
- `Clear` removes local history list in UI.

### Settings Tab
- `Local-only mode` toggle:
  - ON: blocks web/email/slides style prompts in UI
  - OFF: allows those prompts if credentials/integrations exist

## Hotkeys
Configured via env (defaults shown):
- Toggle focus: `Ctrl+Shift+L`
- Quit app: `Ctrl+Shift+Q`
- Stop task: `Ctrl+Shift+.`
- Clear chat: `Ctrl+Shift+X`
- Focus input: `Ctrl+Shift+Space`

## API/Integration Setup

## 1) AI Provider Keys
Set any subset in `.env`:
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `GROK_API_KEY`
- `GLM_API_KEY`

At least one should be configured for non-codex model routing.

## 2) Web Search (Serper)
Set:
- `SERPER_API_KEY`

Required for web search actions through `WebAgent`.

## 3) Gmail + Google Slides OAuth
Set:
- `GOOGLE_CREDENTIALS_PATH=./credentials/google-credentials.json`

Place OAuth client JSON at that path.
On first use, Lumit opens auth flow and stores tokens in:
- `data/gmail-token.json`
- `data/slides-token.json`

## 4) Roblox Studio Bridge
- Bridge server listens at `127.0.0.1:8765`.
- Plugin code is under `plugin/src`.
- In Studio, load/run `Main.server.lua` and related modules.
- When active, plugin polls `/poll` and posts results to `/results`.

## 5) Blender Bridge
- Add/install `blender_addon/lumit_bridge.py` in Blender.
- Addon opens TCP server on `127.0.0.1:8766`.
- Lumit sends JSON payload `{ code: string }`.

## 6) VS Code Bridge (Codex Path)
Yes, the VS Code extension is included in this repo:
- `vscode-extension/extension.js`
- `vscode-extension/package.json`

It is not auto-installed; install manually.

### Install (fast path)
Copy folder to:
- `%USERPROFILE%\\.vscode\\extensions\\lumit-bridge-1.1.0`

Restart VS Code.

### Install (VSIX)
```bash
npm install -g @vscode/vsce
cd vscode-extension
vsce package
code --install-extension lumit-bridge-1.1.0.vsix
```

Bridge endpoints:
- `GET http://127.0.0.1:8767/status`
- `POST http://127.0.0.1:8767/complete`

Lumit side endpoint for readiness:
- `GET http://127.0.0.1:3000/api/codex-status`

If no model providers are available in VS Code, codex status remains not-ready.

## Packaging Outputs
Build everything locally:
```bash
npm run release:local
```

Artifacts:
- Windows installer: `release/Lumit-2.0.0-setup-x64.exe`
- Windows portable app: `release/Lumit-2.0.0-portable-x64.exe`
- VS Code extension package: `vscode-extension/lumit-bridge-1.1.0.vsix`

## Website + GitHub
- Marketing site source is in `website/`.
- GitHub Pages workflow is in `.github/workflows/deploy-site.yml`.
- After pushing to `main`, enable Pages in repo settings:
  - Settings -> Pages -> Build and deployment -> Source: `GitHub Actions`
- Replace placeholder links in `website/index.html`:
  - `https://github.com/yc-lgtm/lumit-extension`
  - `https://github.com/yc-lgtm/lumit-extension/issues`
  - `https://x.com/yourhandle`

## Controller APIs
- `POST /api/prompt`
  - body: `{ prompt, provider?, model?, attachments?, shareAttachmentContents? }`
- `POST /api/model`
  - body: `{ provider, model }`
- `POST /api/stop`
- `GET /api/status`
- `GET /api/codex-status`
- `GET /api/file-tree?dir=.&depth=3`

WebSocket updates are pushed from controller to renderer.

## Safety Model
- File actions are constrained to workspace roots or explicitly attached files.
- Path traversal outside allowed roots is rejected.
- Local-only toggle prevents accidental web/email/slides actions from UI.
- Missing credentials and unavailable integrations return explicit errors, not crashes.

## Troubleshooting
- `EPIPE` in Electron main process:
  - stdout/stderr guards are included in `apps/electron/main.js`
  - ensure you run through `npm start` from project root
- Codex unavailable:
  - open VS Code with Lumit Bridge installed
  - verify `GET /status` returns non-empty models
- File tree empty:
  - check controller is running on `127.0.0.1:3000`
  - try `GET /api/status`

## Validation
```bash
node --check apps/electron/main.js
node --check apps/electron/preload.js
node --check apps/electron/renderer/app.js
npm run smoke
```

## React UI Component Integration
The requested React/shadcn components were added under `components/ui`.
For setup details (Tailwind + TypeScript + shadcn structure), see:
- [docs/REACT_SHADCN_SETUP.md](./docs/REACT_SHADCN_SETUP.md)
