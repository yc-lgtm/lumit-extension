require('dotenv/config')

const fs = require('fs/promises')
const path = require('path')
const { fork } = require('child_process')

const { app, BrowserWindow, dialog, globalShortcut, ipcMain, screen } = require('electron')
const WebSocket = require('ws')

let win = null
let controllerProcess = null
let wsClient = null
let isQuitting = false
let restartTimer = null
let wsRetryTimer = null

function isPathInside(baseDir, targetPath) {
  const base = path.resolve(baseDir)
  const target = path.resolve(targetPath)
  return target === base || target.startsWith(`${base}${path.sep}`)
}

function installStdIoGuards() {
  const swallowBrokenPipe = (error) => {
    if (error?.code === 'EPIPE' || error?.code === 'ERR_STREAM_DESTROYED') {
      return
    }
  }

  process.stdout?.on?.('error', swallowBrokenPipe)
  process.stderr?.on?.('error', swallowBrokenPipe)
}

installStdIoGuards()

const HOTKEYS = {
  toggle: process.env.LUMIT_TOGGLE || 'CommandOrControl+Shift+L',
  quit: process.env.LUMIT_QUIT || 'CommandOrControl+Shift+Q',
  stop: process.env.LUMIT_STOP || 'CommandOrControl+Shift+.',
  clear: process.env.LUMIT_CLEAR || 'CommandOrControl+Shift+X',
  focus: process.env.LUMIT_FOCUS || 'CommandOrControl+Shift+Space'
}

function controllerURL(pathname) {
  return `http://127.0.0.1:3000${pathname}`
}

function createWindow() {
  const display = screen.getPrimaryDisplay()
  const width = 420
  const height = display.workAreaSize.height
  const x = display.workAreaSize.width - width

  win = new BrowserWindow({
    width,
    height,
    x,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  })

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
}

function startController() {
  if (controllerProcess) {
    return
  }

  const scriptPath = path.join(app.getAppPath(), 'apps', 'controller', 'index.js')
  controllerProcess = fork(scriptPath, [], {
    cwd: app.getAppPath(),
    env: process.env,
    silent: true
  })

  // Drain child output so controller logs cannot block if nobody is attached.
  controllerProcess.stdout?.on('data', () => {})
  controllerProcess.stderr?.on('data', () => {})

  controllerProcess.on('exit', (code) => {
    controllerProcess = null
    if (isQuitting) return

    if (win && !win.isDestroyed()) {
      win.webContents.send('update', {
        status: 'error',
        message: `Controller exited (code ${code ?? 'unknown'}). Restarting...`
      })
    }
    clearTimeout(restartTimer)
    restartTimer = setTimeout(() => {
      startController()
      connectControllerSocket()
    }, 2000)
  })
}

function connectControllerSocket() {
  if (wsClient) {
    try {
      wsClient.close()
    } catch {
      // ignore close race
    }
  }

  wsClient = new WebSocket('ws://127.0.0.1:3000')

  wsClient.on('message', (data) => {
    if (!win || win.isDestroyed()) return

    try {
      const parsed = JSON.parse(data.toString('utf8'))
      win.webContents.send('update', parsed)
    } catch {
      // Ignore malformed WS payloads and keep app alive.
    }
  })

  wsClient.on('close', () => {
    if (isQuitting) return
    clearTimeout(wsRetryTimer)
    wsRetryTimer = setTimeout(connectControllerSocket, 1500)
  })

  wsClient.on('error', () => {
    // handled by close retry
  })
}

function registerHotkeys() {
  globalShortcut.register(HOTKEYS.toggle, () => {
    if (!win) return

    if (win.isFocused()) {
      win.blur()
      return
    }

    win.focus()
    win.webContents.send('focus-input')
  })

  globalShortcut.register(HOTKEYS.quit, () => app.quit())

  globalShortcut.register(HOTKEYS.stop, () => {
    win?.webContents.send('stop-task')
  })

  globalShortcut.register(HOTKEYS.clear, () => {
    win?.webContents.send('clear-chat')
  })

  globalShortcut.register(HOTKEYS.focus, () => {
    win?.focus()
    win?.webContents.send('focus-input')
  })
}

async function postController(pathname, body = {}) {
  const res = await fetch(controllerURL(pathname), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `Controller request failed (${res.status})`)
  }
  return data
}

ipcMain.handle('send-prompt', async (_event, payload) => postController('/api/prompt', payload))
ipcMain.handle('set-model', async (_event, payload) => postController('/api/model', payload))
ipcMain.handle('stop-task', async () => postController('/api/stop', {}))

ipcMain.handle('pick-files', async () => {
  const result = await dialog.showOpenDialog(win, {
    title: 'Attach files to Lumit prompt',
    properties: ['openFile', 'multiSelections']
  })

  if (result.canceled) return []

  const files = []
  for (const filePath of result.filePaths) {
    try {
      const stats = await fs.stat(filePath)
      files.push({ name: path.basename(filePath), path: filePath, size: stats.size })
    } catch {
      // ignore inaccessible files
    }
  }

  return files
})

ipcMain.handle('attach-workspace-file', async (_event, payload = {}) => {
  const relPath = String(payload.relativePath || '').trim()
  if (!relPath) {
    throw new Error('relativePath is required')
  }

  const workspaceRoot = app.getAppPath()
  const targetPath = path.resolve(workspaceRoot, relPath)
  if (!isPathInside(workspaceRoot, targetPath)) {
    throw new Error('Path must stay inside workspace')
  }

  const stats = await fs.stat(targetPath)
  if (!stats.isFile()) {
    throw new Error('Target is not a file')
  }

  return {
    name: path.basename(targetPath),
    path: targetPath,
    size: stats.size
  }
})

app.whenReady().then(() => {
  startController()
  createWindow()
  registerHotkeys()
  setTimeout(connectControllerSocket, 700)
})

app.on('will-quit', () => {
  isQuitting = true
  globalShortcut.unregisterAll()

  clearTimeout(restartTimer)
  clearTimeout(wsRetryTimer)

  try {
    wsClient?.close()
  } catch {
    // ignore
  }

  if (controllerProcess) {
    controllerProcess.kill()
    controllerProcess = null
  }
})

app.on('window-all-closed', () => {
  app.quit()
})

/*
LUMIT FINAL TEST CHECKLIST:
[ ] npm start - panel appears on right edge of screen
[ ] Ctrl+Shift+L - panel toggles focus/blur
[ ] Ctrl+Shift+Q - app force quits immediately
[ ] Type "build a flat baseplate in roblox" - routes to STUDIO chip highlights, Studio creates part
[ ] Type "reply to my last email say I'll be there" - GMAIL chip highlights, reply sent
[ ] Type "search for latest blender tutorials" - WEB chip highlights, results appear
[ ] Type "create a cube in blender" - BLENDER chip highlights, cube appears
[ ] Select Codex model - type studio prompt - VS Code bridge returns result
[ ] Ctrl+Shift+. - stops task mid-execution
[ ] Ctrl+Shift+X - clears chat
[ ] Mic button - voice recognized and appears in input
*/
