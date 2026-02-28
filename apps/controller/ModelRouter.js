import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'

import { createLogger } from './utils/logger.js'

const log = createLogger('ModelRouter')

function stripMarkdownJson(text) {
  return String(text || '')
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim()
}

function getOpenAIText(res) {
  const content = res?.choices?.[0]?.message?.content
  if (Array.isArray(content)) {
    return content.map((part) => part?.text || '').join('')
  }
  return content || ''
}

export class ModelRouter {
  constructor() {
    this.clients = {}

    if (process.env.ANTHROPIC_API_KEY) {
      this.clients.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    }

    if (process.env.OPENAI_API_KEY) {
      this.clients.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    }

    if (process.env.GEMINI_API_KEY) {
      this.clients.gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    }

    if (process.env.GROK_API_KEY) {
      this.clients.grok = new OpenAI({
        apiKey: process.env.GROK_API_KEY,
        baseURL: 'https://api.x.ai/v1'
      })
    }

    if (process.env.GLM_API_KEY) {
      this.clients.glm = new OpenAI({
        apiKey: process.env.GLM_API_KEY,
        baseURL: 'https://open.bigmodel.cn/api/paas/v4'
      })
    }

    log.info('Configured providers:', Object.keys(this.clients).join(', ') || '(none)')
  }

  availableProviders() {
    return Object.keys(this.clients)
  }

  async complete({ provider, model, system, prompt, maxTokens = 4000, json = false }) {
    const normalized = provider === 'gpt' ? 'openai' : provider

    if (!this.clients[normalized]) {
      throw new Error(`Provider not configured: ${provider}`)
    }

    switch (normalized) {
      case 'claude':
        return this._claude({ model, system, prompt, maxTokens, json })
      case 'openai':
        return this._openai({ client: this.clients.openai, model, system, prompt, maxTokens, json })
      case 'gemini':
        return this._gemini({ model, system, prompt, json })
      case 'grok':
        return this._openai({ client: this.clients.grok, model, system, prompt, maxTokens, json })
      case 'glm':
        return this._openai({ client: this.clients.glm, model, system, prompt, maxTokens, json })
      default:
        throw new Error(`Unknown provider: ${provider}`)
    }
  }

  async _claude({ model, system, prompt, maxTokens, json }) {
    const res = await this.clients.claude.messages.create({
      model: model || 'claude-opus-4-5',
      max_tokens: maxTokens,
      system: system || '',
      messages: [{ role: 'user', content: prompt }]
    })

    const text = res?.content?.[0]?.text || ''
    return json ? JSON.parse(stripMarkdownJson(text)) : text
  }

  async _openai({ client, model, system, prompt, maxTokens, json }) {
    const res = await client.chat.completions.create({
      model: model || 'gpt-5',
      max_tokens: maxTokens,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: system || '' },
        { role: 'user', content: prompt }
      ]
    })

    const text = getOpenAIText(res)
    return json ? JSON.parse(stripMarkdownJson(text)) : text
  }

  async _gemini({ model, system, prompt, json }) {
    const m = this.clients.gemini.getGenerativeModel({
      model: model || 'gemini-2.0-flash',
      systemInstruction: system || ''
    })
    const res = await m.generateContent(prompt)
    const text = res.response.text()
    return json ? JSON.parse(stripMarkdownJson(text)) : text
  }
}

export function parseJsonModelResponse(raw) {
  const cleaned = stripMarkdownJson(raw)
  try {
    return JSON.parse(cleaned)
  } catch {
    throw new Error(`Model returned invalid JSON: ${cleaned.slice(0, 300)}`)
  }
}
