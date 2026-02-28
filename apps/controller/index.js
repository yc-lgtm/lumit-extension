import 'dotenv/config'

import fs from 'fs/promises'
import http from 'http'
import path from 'path'

import express from 'express'
import { WebSocketServer } from 'ws'

import { Orchestrator } from './Orchestrator.js'
import { createLogger } from './utils/logger.js'

const log = createLogger('Controller')

const app = express()
app.use(express.json({ limit: '4mb' }))

const server = http.createServer(app)
const wss = new WebSocketServer({ server })

let wsClient = null
let runPromise = null
const workspaceRoot = path.resolve(process.cwd())

const orchestrator = new Orchestrator(sendUpdate, {
  provider: 'claude',
  model: 'claude-opus-4-5'
}, {
  workspaceRoot: process.cwd()
})

function sendUpdate(update) {
  if (wsClient && wsClient.readyState === 1) {
    wsClient.send(JSON.stringify(update))
  }
}

function withinWorkspace(targetPath) {
  const resolved = path.resolve(targetPath)
  return resolved === workspaceRoot || resolved.startsWith(`${workspaceRoot}${path.sep}`)
}

async function readTree(dirPath, depth = 2) {
  const stats = await fs.stat(dirPath)
  const node = {
    name: path.basename(dirPath) || '.',
    path: path.relative(workspaceRoot, dirPath) || '.',
    type: stats.isDirectory() ? 'directory' : 'file'
  }

  if (!stats.isDirectory() || depth <= 0) {
    return node
  }

  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const filtered = entries
    .filter((entry) => !entry.name.startsWith('.git') && entry.name !== 'node_modules')
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1
      if (!a.isDirectory() && b.isDirectory()) return 1
      return a.name.localeCompare(b.name)
    })
    .slice(0, 200)

  node.children = await Promise.all(
    filtered.map((entry) => readTree(path.join(dirPath, entry.name), depth - 1))
  )

  return node
}

wss.on('connection', (ws) => {
  wsClient = ws
  log.info('Renderer websocket connected')

  ws.on('close', () => {
    if (wsClient === ws) {
      wsClient = null
    }
    log.info('Renderer websocket disconnected')
  })
})

app.post('/api/prompt', async (req, res) => {
  try {
    const { prompt, provider, model, attachments, shareAttachmentContents } = req.body || {}

    if (!prompt || !String(prompt).trim()) {
      res.status(400).json({ success: false, error: 'prompt is required' })
      return
    }

    if (provider && model) {
      orchestrator.setModel(provider, model)
    }

    if (runPromise) {
      res.status(409).json({ success: false, error: 'A task is already running.' })
      return
    }

    runPromise = orchestrator.run(prompt, {
      attachments: Array.isArray(attachments) ? attachments : [],
      shareAttachmentContents: Boolean(shareAttachmentContents)
    })

    const result = await runPromise
    runPromise = null

    if (!result.success) {
      res.status(500).json({ success: false, error: result.error || 'Task failed' })
      return
    }

    res.json({ success: true, result })
  } catch (error) {
    runPromise = null
    log.error('Prompt request failed:', error.message)
    res.status(500).json({ success: false, error: error.message })
  }
})

app.post('/api/model', (req, res) => {
  const { provider, model } = req.body || {}
  if (!provider || !model) {
    res.status(400).json({ ok: false, error: 'provider and model are required' })
    return
  }

  orchestrator.setModel(provider, model)
  res.json({ ok: true })
})

app.post('/api/stop', (_req, res) => {
  orchestrator.stop()
  res.json({ ok: true })
})

app.get('/api/status', (_req, res) => {
  res.json({
    ok: true,
    agents: ['studio', 'blender', 'slides', 'gmail', 'files', 'web', 'codex']
  })
})

app.get('/api/codex-status', async (_req, res) => {
  await orchestrator.codex.init()
  res.json(orchestrator.codex.getStatus())
})

app.get('/api/file-tree', async (req, res) => {
  try {
    const requested = String(req.query.dir || '.')
    const depth = Math.max(1, Math.min(5, Number(req.query.depth || 3)))
    const target = path.resolve(workspaceRoot, requested)

    if (!withinWorkspace(target)) {
      res.status(400).json({ ok: false, error: 'Path must be inside workspace root.' })
      return
    }

    const tree = await readTree(target, depth)
    res.json({ ok: true, root: workspaceRoot, tree })
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message })
  }
})

const port = Number(process.env.LUMIT_CONTROLLER_PORT || 3000)
server.listen(port, '127.0.0.1', () => {
  log.info(`Controller running on port ${port}`)
})
