import fs from 'fs/promises'

import { ModelRouter, parseJsonModelResponse } from './ModelRouter.js'
import { PROMPTS } from './prompts/index.js'
import { StudioAgent } from './agents/StudioAgent.js'
import { BlenderAgent } from './agents/BlenderAgent.js'
import { SlidesAgent } from './agents/SlidesAgent.js'
import { GmailAgent } from './agents/GmailAgent.js'
import { FileAgent } from './agents/FileAgent.js'
import { WebAgent } from './agents/WebAgent.js'
import { CodexAgent } from './agents/CodexAgent.js'
import { createLogger } from './utils/logger.js'
import { throwIfAborted } from './utils/timeouts.js'

const log = createLogger('Orchestrator')

const KEYWORD_RULES = [
  {
    target: 'studio',
    patterns: [/roblox/i, /\bstudio\b/i, /\blua\b/i, /\bgame\b/i, /baseplate/i, /\bnpc\b/i, /humanoid/i, /obby/i, /leaderboard/i, /datastore/i, /remoteevent/i, /serverscript/i]
  },
  {
    target: 'blender',
    patterns: [/blender/i, /\b3d\s*model/i, /\bmesh\b/i, /low.?poly/i, /\bvertex/i, /\bbpy\b/i, /\barmature/i, /\brig\b/i, /\brender\b/i]
  },
  {
    target: 'slides',
    patterns: [/\bslides?\b/i, /\bdeck\b/i, /presentation/i, /pitch\s*deck/i]
  },
  {
    target: 'gmail',
    patterns: [/\bemail\b/i, /\bmail\b/i, /\binbox\b/i, /\breply\b/i, /gmail/i]
  },
  {
    target: 'files',
    patterns: [/\bfile\b/i, /\bfolder\b/i, /\bdirectory/i, /\bopen\b.*\.(txt|js|py|lua|json|md|tsx|ts|jsx)/i]
  },
  {
    target: 'web',
    patterns: [/\bsearch\b/i, /\blook up\b/i, /\bfind.*online\b/i, /\bwhat is\b/i, /\blatest\b/i, /\bnews\b/i]
  }
]

function stripJson(raw) {
  return String(raw || '')
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim()
}

export class Orchestrator {
  constructor(onUpdate, config = {}, options = {}) {
    this.onUpdate = typeof onUpdate === 'function' ? onUpdate : () => {}
    this.config = {
      provider: config.provider || 'claude',
      model: config.model || 'claude-opus-4-5'
    }

    this.router = new ModelRouter()
    this.history = []
    this.maxHistory = 20
    this.workspaceRoot = options.workspaceRoot || process.cwd()

    this.codex = new CodexAgent()
    void this.codex.init()

    this.agents = {
      studio: new StudioAgent(this.onUpdate),
      blender: new BlenderAgent(this.onUpdate),
      slides: new SlidesAgent(this.onUpdate),
      gmail: new GmailAgent(this.onUpdate),
      files: new FileAgent(this.onUpdate, { workspaceRoot: this.workspaceRoot }),
      web: new WebAgent(this.onUpdate)
    }

    this.currentAbortController = null
  }

  setModel(provider, model) {
    this.config.provider = provider
    this.config.model = model
    this.onUpdate({ status: 'model', message: `Model switched to ${provider}:${model}` })
  }

  stop() {
    if (this.currentAbortController && !this.currentAbortController.signal.aborted) {
      this.currentAbortController.abort()
      this.onUpdate({ status: 'error', message: 'Task stopped.' })
    }
  }

  keywordRoute(prompt) {
    for (const rule of KEYWORD_RULES) {
      if (rule.patterns.some((pattern) => pattern.test(prompt))) {
        return rule.target
      }
    }
    return null
  }

  async routeWithModel(prompt) {
    const provider = this.config.provider === 'codex' ? this._fallbackProvider() : this.config.provider
    const model = provider === this.config.provider ? this.config.model : null

    if (!provider) {
      return {
        target: 'files',
        summary: 'No provider configured. Falling back to files agent.',
        refined_prompt: prompt
      }
    }

    const routed = await this.router.complete({
      provider,
      model,
      system: PROMPTS.router,
      prompt,
      maxTokens: 1200,
      json: true
    })

    return routed
  }

  _fallbackProvider() {
    const available = this.router.availableProviders()
    if (available.includes('openai')) return 'openai'
    if (available.includes('claude')) return 'claude'
    if (available.includes('gemini')) return 'gemini'
    if (available.includes('grok')) return 'grok'
    if (available.includes('glm')) return 'glm'
    return null
  }

  async _buildAttachmentContext(attachments, shareAttachmentContents, signal) {
    if (!Array.isArray(attachments) || attachments.length === 0) {
      return ''
    }

    const lines = ['Attached files:']
    for (const attachment of attachments) {
      lines.push(`- ${attachment.name || 'file'} (${attachment.path})`)
    }

    if (!shareAttachmentContents) {
      lines.push('Attachment content sharing is disabled. Use file paths only unless user enables sharing.')
      return lines.join('\n')
    }

    lines.push('Included attachment excerpts:')
    let total = 0

    for (const attachment of attachments) {
      throwIfAborted(signal)
      if (!attachment.path) continue

      try {
        const content = await fs.readFile(attachment.path, 'utf8')
        const remaining = 40000 - total
        if (remaining <= 0) break
        const excerpt = content.slice(0, Math.min(12000, remaining))
        total += excerpt.length
        lines.push(`\n--- FILE: ${attachment.path} ---\n${excerpt}`)
      } catch (error) {
        lines.push(`\n--- FILE: ${attachment.path} ---\n[Unavailable: ${error.message}]`)
      }
    }

    return lines.join('\n')
  }

  async _generateInstructions(target, refinedPrompt, attachmentContext, signal) {
    const prompt = attachmentContext
      ? `${refinedPrompt}\n\n${attachmentContext}`
      : refinedPrompt

    if (this.config.provider === 'codex') {
      const available = await this.codex.isAvailable()
      if (!available) {
        throw new Error('VS Code not open or Lumit Bridge extension not installed.')
      }

      const raw = await this.codex.complete(
        `${PROMPTS[target]}\n\nUser request: ${prompt}\n\nReturn valid JSON only.`,
        '',
        'gpt-4o',
        signal
      )

      return parseJsonModelResponse(raw)
    }

    const raw = await this.router.complete({
      provider: this.config.provider,
      model: this.config.model,
      system: PROMPTS[target],
      prompt,
      maxTokens: 4000,
      json: false
    })

    return parseJsonModelResponse(raw)
  }

  _pushHistory(entry) {
    this.history.push(entry)
    if (this.history.length > this.maxHistory) {
      this.history.shift()
    }
  }

  async run(userPrompt, { attachments = [], shareAttachmentContents = false } = {}) {
    if (!userPrompt || !String(userPrompt).trim()) {
      throw new Error('Prompt cannot be empty.')
    }

    this.currentAbortController = new AbortController()
    const { signal } = this.currentAbortController
    const prompt = String(userPrompt).trim()

    try {
      this.onUpdate({ status: 'thinking', message: 'Analyzing request...' })
      throwIfAborted(signal)

      let target = this.keywordRoute(prompt)
      let summary = ''
      let refinedPrompt = prompt

      if (!target) {
        this.onUpdate({ status: 'generating', message: 'Routing with model...' })
        const routed = await this.routeWithModel(prompt)
        target = routed.target || 'files'
        summary = routed.summary || ''
        refinedPrompt = routed.refined_prompt || prompt
      }

      this.onUpdate({ status: 'routing', message: summary || `Routed to ${target}.`, target })
      throwIfAborted(signal)

      this.agents.files.setSessionPaths((attachments || []).map((a) => a.path).filter(Boolean))

      const attachmentContext = await this._buildAttachmentContext(attachments, shareAttachmentContents, signal)

      this.onUpdate({ status: 'generating', message: `Generating ${target} instructions...`, target })
      const instructions = await this._generateInstructions(target, refinedPrompt, attachmentContext, signal)

      this.onUpdate({ status: 'executing', message: `Executing ${target} actions...`, target })
      const result = await this.agents[target].execute(instructions, { signal, attachments })

      this._pushHistory({
        timestamp: Date.now(),
        prompt,
        target,
        result
      })

      this.onUpdate({ status: 'done', message: 'Completed.', target, result })
      return { success: true, target, result }
    } catch (error) {
      const message = error?.message || 'Unknown error'
      const isCancelled = message === 'Cancelled'
      this.onUpdate({ status: 'error', message: isCancelled ? 'Task cancelled.' : `Error: ${message}` })
      log.error('run failed:', message)
      return { success: false, error: message }
    } finally {
      this.currentAbortController = null
    }
  }
}

export const ORCHESTRATOR_KEYWORD_RULES = KEYWORD_RULES
export function sanitizeModelJson(raw) {
  return stripJson(raw)
}

