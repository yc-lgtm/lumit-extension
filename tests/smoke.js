import assert from 'assert/strict'
import { spawn } from 'child_process'
import EventEmitter from 'events'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import { ORCHESTRATOR_KEYWORD_RULES } from '../apps/controller/Orchestrator.js'
import { FileAgent } from '../apps/controller/agents/FileAgent.js'
import { WebAgent } from '../apps/controller/agents/WebAgent.js'
import { CodexAgent } from '../apps/controller/agents/CodexAgent.js'
import { StudioAgent } from '../apps/controller/agents/StudioAgent.js'

const root = path.resolve(process.cwd())

function detectRoute(text) {
  for (const rule of ORCHESTRATOR_KEYWORD_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return rule.target
    }
  }
  return null
}

async function waitFor(url, timeoutMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return res
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(`Timeout waiting for ${url}`)
}

async function testKeywordRouting() {
  assert.equal(detectRoute('build a roblox baseplate'), 'studio')
  assert.equal(detectRoute('create low poly sword in blender'), 'blender')
  assert.equal(detectRoute('make a pitch deck presentation'), 'slides')
  assert.equal(detectRoute('reply to my gmail'), 'gmail')
  assert.equal(detectRoute('open file app.js'), 'files')
  assert.equal(detectRoute('search latest news online'), 'web')
}

async function testFileAgent() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lumit-smoke-'))
  const agent = new FileAgent(() => {}, { workspaceRoot: tempRoot })
  const file = path.join(tempRoot, 'a.txt')

  await agent.execute({ action: 'write', filePath: file, content: 'hello' })
  const read = await agent.execute({ action: 'read', filePath: file })
  assert.equal(read.success, true)
  assert.equal(read.content, 'hello')

  const listed = await agent.execute({ action: 'list', dirPath: tempRoot, recursive: true })
  assert.equal(listed.success, true)
  assert(listed.files.some((f) => f.endsWith('a.txt')))

  const moved = path.join(tempRoot, 'b.txt')
  const mv = await agent.execute({ action: 'move', from: file, to: moved })
  assert.equal(mv.success, true)

  const del = await agent.execute({ action: 'delete', filePath: moved })
  assert.equal(del.success, true)

  const outside = await agent.execute({ action: 'read', filePath: path.resolve(tempRoot, '..', 'x.txt') })
  assert.equal(outside.success, false)
}

async function testWebAgent() {
  const mockFetch = async (url) => {
    if (String(url).includes('google.serper.dev')) {
      return {
        ok: true,
        async json() {
          return {
            organic: [{ title: 'A', link: 'https://a.test', snippet: 'S' }]
          }
        }
      }
    }

    return {
      ok: true,
      async text() {
        return '<html><body><header>x</header><main>Hello world</main><script>bad()</script></body></html>'
      }
    }
  }

  process.env.SERPER_API_KEY = 'test'
  const agent = new WebAgent(() => {}, { fetcher: mockFetch })

  const s = await agent.execute({ action: 'search', query: 'x', numResults: 1 })
  assert.equal(s.success, true)
  assert.equal(s.results.length, 1)

  const f = await agent.execute({ action: 'fetch', url: 'https://example.com' })
  assert.equal(f.success, true)
  assert(f.content.includes('Hello world'))
  assert(!f.content.includes('bad()'))
}

async function testCodexUnavailable() {
  const agent = new CodexAgent({
    fetcher: async () => {
      throw new Error('offline')
    }
  })

  const status = await agent.init()
  assert.equal(status.ready, false)
}

async function testStudioTimeoutAbort() {
  const fakeBridge = new EventEmitter()
  fakeBridge.send = () => {}

  const agent = new StudioAgent(() => {}, { bridge: fakeBridge, autoStart: false })
  const controller = new AbortController()
  setTimeout(() => controller.abort(), 25)

  let cancelled = false
  try {
    await agent.execute({ steps: [{ type: 'create_part', name: 'X' }] }, { signal: controller.signal })
  } catch (error) {
    cancelled = error.message === 'Cancelled'
  }

  assert.equal(cancelled, true)
}

async function testControllerEndpoints() {
  const controller = spawn('node', ['apps/controller/index.js'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe']
  })

  const logs = []
  controller.stdout.on('data', (d) => logs.push(d.toString()))
  controller.stderr.on('data', (d) => logs.push(d.toString()))

  try {
    await waitFor('http://127.0.0.1:3000/api/status', 20000)

    const status = await fetch('http://127.0.0.1:3000/api/status').then((r) => r.json())
    assert.equal(status.ok, true)
    assert(Array.isArray(status.agents))

    const codexStatus = await fetch('http://127.0.0.1:3000/api/codex-status').then((r) => r.json())
    assert.equal(typeof codexStatus.ready, 'boolean')

    const invalidPrompt = await fetch('http://127.0.0.1:3000/api/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '' })
    })
    assert.equal(invalidPrompt.status, 400)

    const stopRes = await fetch('http://127.0.0.1:3000/api/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    })
    assert.equal(stopRes.status, 200)
  } finally {
    controller.kill('SIGTERM')
  }
}

async function main() {
  const imports = [
    '../apps/controller/ModelRouter.js',
    '../apps/controller/Orchestrator.js',
    '../apps/controller/agents/StudioAgent.js',
    '../apps/controller/agents/BlenderAgent.js',
    '../apps/controller/agents/SlidesAgent.js',
    '../apps/controller/agents/GmailAgent.js',
    '../apps/controller/agents/FileAgent.js',
    '../apps/controller/agents/WebAgent.js',
    '../apps/controller/agents/CodexAgent.js',
  ]

  for (const mod of imports) {
    await import(mod)
  }

  // Electron files are checked with node --check to avoid side effects during smoke test.

  await testKeywordRouting()
  await testFileAgent()
  await testWebAgent()
  await testCodexUnavailable()
  await testStudioTimeoutAbort()
  await testControllerEndpoints()

  console.log('[Lumit smoke] All checks passed.')
}

main().catch((error) => {
  console.error('[Lumit smoke] Failed:', error.message)
  process.exit(1)
})

