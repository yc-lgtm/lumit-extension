import { withTimeout } from '../utils/timeouts.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('CodexAgent')

export class CodexAgent {
  constructor({ fetcher = fetch } = {}) {
    this.port = 8767
    this.baseURL = `http://127.0.0.1:${this.port}`
    this.ready = false
    this.fetcher = fetcher
    this.lastStatus = { ready: false, port: this.port }
  }

  async init() {
    const status = await this._fetchStatus()
    this.ready = Boolean(status.ready)
    this.lastStatus = status
    return status
  }

  async _fetchStatus() {
    try {
      const res = await withTimeout(
        async () => this.fetcher(`${this.baseURL}/status`, { method: 'GET' }),
        2000,
        'VS Code bridge status timeout'
      )

      if (!res.ok) {
        log.warn('Bridge /status HTTP', res.status)
        return { ready: false, port: this.port }
      }

      const data = await res.json()
      const models = Array.isArray(data.models) ? data.models : []
      const ready = models.length > 0

      if (ready) {
        log.info('Connected to VS Code models:', models.map((m) => m.name).join(', '))
      } else {
        log.warn('VS Code bridge is up but no models available.')
      }

      return { ready, port: this.port, models }
    } catch {
      log.warn('VS Code bridge unavailable on port', this.port)
      return { ready: false, port: this.port }
    }
  }

  async isAvailable() {
    if (!this.ready) {
      await this.init()
    }
    return this.ready
  }

  getStatus() {
    return {
      ...this.lastStatus,
      ready: this.ready,
      port: this.port
    }
  }

  async complete(prompt, system = '', modelFamily = null, signal) {
    if (!this.ready) {
      await this.init()
    }

    if (!this.ready) {
      throw new Error('VS Code Codex not available. Open VS Code with Lumit Bridge installed.')
    }

    const res = await withTimeout(
      async () => this.fetcher(`${this.baseURL}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, system, modelFamily }),
        signal
      }),
      60000,
      'VS Code completion timeout'
    )

    const data = await res.json()
    if (!res.ok || !data.success) {
      throw new Error(data.error || `VS Code bridge error (${res.status})`)
    }

    return data.text || ''
  }
}
