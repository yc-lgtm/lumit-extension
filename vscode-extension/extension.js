const vscode = require('vscode')
const http = require('http')
const crypto = require('crypto')

const EXTENSION_NAME = 'Lumit'
const KNOWN_FAMILY_FALLBACKS = [
  'gpt-4o',
  'gpt-4.1',
  'gpt-4',
  'o4-mini',
  'claude-3-7-sonnet',
  'claude-3-5-sonnet',
  'gemini-2.0-flash',
  'gemini-1.5-pro'
]

function getConfig() {
  const cfg = vscode.workspace.getConfiguration('lumit')
  return {
    port: Number(cfg.get('bridgePort', 8767)),
    defaultModelFamily: String(cfg.get('defaultModelFamily', '') || '').trim(),
    autoStartBridge: Boolean(cfg.get('autoStartBridge', true)),
    showStatusBar: Boolean(cfg.get('showStatusBar', true))
  }
}

function modelInfo(model) {
  return {
    id: model.id,
    name: model.name,
    vendor: model.vendor,
    family: model.family
  }
}

async function listModels() {
  const models = await vscode.lm.selectChatModels({})
  return models.map(modelInfo)
}

function uniqueFamilies(requestedFamily, defaultFamily) {
  const values = [requestedFamily, defaultFamily, ...KNOWN_FAMILY_FALLBACKS]
    .map((v) => String(v || '').trim())
    .filter(Boolean)

  return [...new Set(values)]
}

async function chooseModel(requestedFamily) {
  const { defaultModelFamily } = getConfig()
  const families = uniqueFamilies(requestedFamily, defaultModelFamily)

  for (const family of families) {
    const candidates = await vscode.lm.selectChatModels({ family })
    if (candidates.length > 0) {
      return candidates[0]
    }
  }

  const all = await vscode.lm.selectChatModels({})
  return all[0] || null
}

async function collectText(response) {
  let text = ''
  for await (const chunk of response.text) {
    text += chunk
  }
  return text
}

function safeJsonParse(raw, fallback = {}) {
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

class LumitBridgeServer {
  constructor(output) {
    this.output = output
    this.server = null
  }

  get port() {
    return getConfig().port
  }

  log(message) {
    this.output.appendLine(`[Bridge] ${message}`)
  }

  async start() {
    if (this.server) {
      return
    }

    this.server = http.createServer((req, res) => {
      void this.handleRequest(req, res)
    })

    await new Promise((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(this.port, '127.0.0.1', () => resolve())
    })

    this.log(`HTTP server running on 127.0.0.1:${this.port}`)
  }

  async stop() {
    if (!this.server) {
      return
    }

    const current = this.server
    this.server = null

    await new Promise((resolve) => {
      current.close(() => resolve())
    })

    this.log('HTTP server stopped')
  }

  async restart() {
    await this.stop()
    await this.start()
  }

  async status() {
    const models = await listModels()
    return {
      ok: true,
      running: Boolean(this.server),
      port: this.port,
      models
    }
  }

  async complete({ prompt, system = '', modelFamily = '' }, cancellationToken) {
    if (!prompt || !String(prompt).trim()) {
      throw new Error('prompt is required')
    }

    const model = await chooseModel(modelFamily)
    if (!model) {
      throw new Error('No language models available in VS Code. Install GitHub Copilot or another model extension.')
    }

    const messages = []
    if (system && String(system).trim()) {
      messages.push(vscode.LanguageModelChatMessage.User(`[System instructions]\n${system}`))
      messages.push(vscode.LanguageModelChatMessage.Assistant('Understood.'))
    }
    messages.push(vscode.LanguageModelChatMessage.User(String(prompt)))

    const internalCancellation = new vscode.CancellationTokenSource()
    if (cancellationToken) {
      const dispose = cancellationToken.onCancellationRequested(() => {
        internalCancellation.cancel()
      })
      internalCancellation.token.onCancellationRequested(() => dispose.dispose())
    }

    const response = await model.sendRequest(messages, {}, internalCancellation.token)
    const text = await collectText(response)

    return {
      success: true,
      text,
      model: modelInfo(model)
    }
  }

  async handleRequest(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      this.sendJson(res, 200, { ok: true })
      return
    }

    const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1')
    const path = parsedUrl.pathname

    try {
      if (req.method === 'GET' && path === '/health') {
        this.sendJson(res, 200, {
          ok: true,
          running: Boolean(this.server),
          port: this.port
        })
        return
      }

      if (req.method === 'GET' && path === '/status') {
        const data = await this.status()
        this.sendJson(res, 200, data)
        return
      }

      if (req.method === 'POST' && path === '/complete') {
        const body = await this.readBody(req)
        const payload = safeJsonParse(body, {})
        const result = await this.complete(payload)
        this.sendJson(res, 200, result)
        return
      }

      this.sendJson(res, 404, { ok: false, error: 'Not found' })
    } catch (error) {
      const message = error?.message || 'Unknown error'
      const code = error?.code || null

      if (error instanceof vscode.LanguageModelError) {
        this.sendJson(res, 400, {
          success: false,
          error: message,
          code
        })
        return
      }

      this.sendJson(res, 500, {
        success: false,
        error: message,
        code
      })
    }
  }

  async readBody(req, maxBytes = 1024 * 1024) {
    return await new Promise((resolve, reject) => {
      let size = 0
      let body = ''

      req.on('data', (chunk) => {
        size += chunk.length
        if (size > maxBytes) {
          reject(new Error('Request body too large'))
          return
        }
        body += chunk.toString('utf8')
      })

      req.on('end', () => resolve(body))
      req.on('error', reject)
    })
  }

  sendJson(res, status, payload) {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(payload))
  }
}

class LumitSidebarProvider {
  constructor(bridge, output) {
    this.bridge = bridge
    this.output = output
    this.view = null
  }

  resolveWebviewView(webviewView) {
    this.view = webviewView
    webviewView.webview.options = { enableScripts: true }
    webviewView.webview.html = this.getHtml()

    webviewView.webview.onDidReceiveMessage(async (message) => {
      try {
        if (message?.type === 'status') {
          const status = await this.bridge.status()
          this.post({ type: 'status', data: status })
          return
        }

        if (message?.type === 'runPrompt') {
          const result = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'Lumit: Running prompt' },
            async (_progress, token) => {
              return await this.bridge.complete(
                {
                  prompt: String(message.prompt || ''),
                  system: String(message.system || ''),
                  modelFamily: String(message.modelFamily || '')
                },
                token
              )
            }
          )
          this.post({ type: 'result', data: result })
        }
      } catch (error) {
        const text = error?.message || 'Unknown error'
        this.output.appendLine(`[UI] ${text}`)
        this.post({ type: 'error', error: text })
      }
    })
  }

  post(message) {
    if (this.view) {
      this.view.webview.postMessage(message)
    }
  }

  getHtml() {
    const nonce = crypto.randomBytes(16).toString('base64')

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Lumit</title>
  <style>
    :root { --bg:#111827; --card:#1f2937; --line:#334155; --text:#e2e8f0; --muted:#94a3b8; --acc:#60a5fa; }
    * { box-sizing:border-box; }
    body { margin:0; padding:12px; background:var(--bg); color:var(--text); font-family:Segoe UI, Arial, sans-serif; }
    .card { border:1px solid var(--line); background:var(--card); border-radius:12px; padding:10px; display:grid; gap:8px; }
    .row { display:flex; gap:8px; align-items:center; }
    .sp { flex:1; }
    .title { font-size:13px; font-weight:600; }
    .muted { font-size:11px; color:var(--muted); }
    input, textarea, button { width:100%; border-radius:10px; border:1px solid var(--line); background:#0f172a; color:var(--text); padding:8px; font-size:12px; }
    textarea { min-height:90px; resize:vertical; }
    button { cursor:pointer; background:#1e293b; }
    button.primary { border-color:#1d4ed8; background:#1d4ed8; color:#fff; }
    button.secondary { width:auto; padding:8px 10px; }
    pre { margin:0; white-space:pre-wrap; word-break:break-word; font-size:12px; color:#dbeafe; }
    .status { border:1px solid var(--line); border-radius:10px; padding:8px; background:#0f172a; }
  </style>
</head>
<body>
  <div class="card">
    <div class="row">
      <div class="title">Lumit Assistant</div>
      <div class="sp"></div>
      <button id="refreshBtn" class="secondary">Refresh</button>
    </div>
    <div id="status" class="status muted">Checking bridge status...</div>

    <label class="muted" for="modelFamily">Model family (optional)</label>
    <input id="modelFamily" placeholder="e.g. gpt-4o, claude-3-5-sonnet" />

    <label class="muted" for="system">System (optional)</label>
    <textarea id="system" placeholder="System instructions"></textarea>

    <label class="muted" for="prompt">Prompt</label>
    <textarea id="prompt" placeholder="Ask Lumit to do something..."></textarea>

    <button id="runBtn" class="primary">Run Prompt</button>

    <div class="title" style="margin-top:4px;">Response</div>
    <pre id="result" class="muted">No response yet.</pre>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const statusEl = document.getElementById('status');
    const resultEl = document.getElementById('result');
    const promptEl = document.getElementById('prompt');
    const systemEl = document.getElementById('system');
    const modelEl = document.getElementById('modelFamily');

    function refreshStatus() { vscode.postMessage({ type: 'status' }); }
    document.getElementById('refreshBtn').addEventListener('click', refreshStatus);

    document.getElementById('runBtn').addEventListener('click', () => {
      const prompt = String(promptEl.value || '').trim();
      if (!prompt) { resultEl.textContent = 'Prompt is required.'; return; }
      resultEl.textContent = 'Running...';
      vscode.postMessage({
        type: 'runPrompt',
        prompt,
        system: systemEl.value || '',
        modelFamily: modelEl.value || ''
      });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data || {};
      if (msg.type === 'status') {
        const data = msg.data || {};
        const models = Array.isArray(data.models) ? data.models : [];
        const modelText = models.length > 0 ? models.map((m) => m.name + ' (' + m.vendor + ')').join(', ') : 'No models available';
        statusEl.textContent = 'Bridge: ' + (data.running ? 'Running' : 'Stopped') + ' on 127.0.0.1:' + data.port + ' | Models: ' + modelText;
      }
      if (msg.type === 'result') {
        const data = msg.data || {};
        resultEl.textContent = data.text || '(empty response)';
      }
      if (msg.type === 'error') {
        resultEl.textContent = 'Error: ' + (msg.error || 'unknown');
      }
    });

    promptEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        document.getElementById('runBtn').click();
      }
    });

    refreshStatus();
  </script>
</body>
</html>`
  }
}

let bridgeServer = null
let statusBar = null
let output = null
let sidebarProvider = null

async function showStatusMessage() {
  try {
    const status = await bridgeServer.status()
    if (!status.models || status.models.length === 0) {
      vscode.window.showWarningMessage('Lumit: Bridge is running but no language models are available. Install GitHub Copilot or another model extension.')
      return
    }
    const models = status.models.map((m) => `${m.name} (${m.vendor})`).join(', ')
    vscode.window.showInformationMessage(`Lumit bridge active on 127.0.0.1:${status.port}. Models: ${models}`)
  } catch (error) {
    vscode.window.showErrorMessage(`Lumit status failed: ${error.message}`)
  }
}

async function runPromptCommand() {
  const prompt = await vscode.window.showInputBox({
    title: 'Lumit Prompt',
    prompt: 'Enter prompt to run through VS Code language model',
    placeHolder: 'Explain this code, generate tests, refactor, etc.'
  })

  if (!prompt) return

  try {
    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Lumit: Running prompt' },
      async (_progress, token) => await bridgeServer.complete({ prompt }, token)
    )

    const doc = await vscode.workspace.openTextDocument({
      content: result.text || '',
      language: 'markdown'
    })
    await vscode.window.showTextDocument(doc, { preview: false })
  } catch (error) {
    vscode.window.showErrorMessage(`Lumit prompt failed: ${error.message}`)
  }
}

function refreshStatusBar() {
  if (!statusBar) return
  const { showStatusBar } = getConfig()
  if (!showStatusBar) {
    statusBar.hide()
    return
  }
  statusBar.text = '$(sparkle) Lumit'
  statusBar.tooltip = 'Open Lumit Sidebar'
  statusBar.command = 'lumit.openPanel'
  statusBar.show()
}

async function activate(context) {
  output = vscode.window.createOutputChannel('Lumit')
  context.subscriptions.push(output)

  bridgeServer = new LumitBridgeServer(output)
  sidebarProvider = new LumitSidebarProvider(bridgeServer, output)

  context.subscriptions.push(vscode.window.registerWebviewViewProvider('lumit.panel', sidebarProvider))

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
  context.subscriptions.push(statusBar)
  refreshStatusBar()

  context.subscriptions.push(vscode.commands.registerCommand('lumit.openPanel', async () => {
    await vscode.commands.executeCommand('workbench.view.extension.lumit')
  }))

  context.subscriptions.push(vscode.commands.registerCommand('lumit.status', async () => {
    await showStatusMessage()
  }))

  context.subscriptions.push(vscode.commands.registerCommand('lumit.restartBridge', async () => {
    try {
      await bridgeServer.restart()
      sidebarProvider.post({ type: 'status', data: await bridgeServer.status() })
      vscode.window.showInformationMessage(`Lumit bridge restarted on 127.0.0.1:${bridgeServer.port}`)
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to restart Lumit bridge: ${error.message}`)
    }
  }))

  context.subscriptions.push(vscode.commands.registerCommand('lumit.runPrompt', async () => {
    await runPromptCommand()
  }))

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async (event) => {
    if (event.affectsConfiguration('lumit.showStatusBar')) {
      refreshStatusBar()
    }
    if (event.affectsConfiguration('lumit.bridgePort')) {
      try {
        await bridgeServer.restart()
        sidebarProvider.post({ type: 'status', data: await bridgeServer.status() })
        vscode.window.showInformationMessage(`Lumit bridge moved to port ${bridgeServer.port}`)
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to restart Lumit bridge on new port: ${error.message}`)
      }
    }
  }))

  if (getConfig().autoStartBridge) {
    try {
      await bridgeServer.start()
      output.appendLine(`[Extension] ${EXTENSION_NAME} activated`)
      vscode.window.setStatusBarMessage('Lumit Bridge: Connected', 3000)
    } catch (error) {
      vscode.window.showErrorMessage(`Lumit bridge failed to start: ${error.message}`)
    }
  }
}

async function deactivate() {
  if (bridgeServer) {
    await bridgeServer.stop()
  }
}

module.exports = { activate, deactivate }
