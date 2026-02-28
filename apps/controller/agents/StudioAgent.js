import { randomUUID } from 'crypto'

import { BridgeServer } from './studio/BridgeServer.js'
import { throwIfAborted, withTimeout } from '../utils/timeouts.js'

export class StudioAgent {
  constructor(onUpdate, { bridge = null, autoStart = true } = {}) {
    this.onUpdate = typeof onUpdate === 'function' ? onUpdate : () => {}
    this.bridge = bridge || new BridgeServer()

    if (autoStart) {
      this.bridge.start()
    }
  }

  async execute(instructions, { signal } = {}) {
    const steps = Array.isArray(instructions?.steps) ? instructions.steps : []
    if (steps.length === 0) {
      return { success: false, error: 'No Studio steps were provided.' }
    }

    let completed = 0

    for (const step of steps) {
      throwIfAborted(signal)
      this.onUpdate({ status: 'executing', message: `Applying ${step.type}${step.name ? `: ${step.name}` : ''}`, target: 'studio' })

      const result = await this._sendAndWait(step, signal)
      if (!result?.success) {
        return { success: false, error: result?.error || 'Studio execution failed.', completed }
      }

      completed += 1
    }

    return { success: true, completed }
  }

  async _sendAndWait(instruction, signal) {
    const requestId = randomUUID()
    const payload = {
      ...instruction,
      _requestId: requestId
    }

    return withTimeout(
      () => new Promise((resolve, reject) => {
        const onResult = (result) => {
          if (!result || result.requestId !== requestId) {
            return
          }

          cleanup()
          resolve(result)
        }

        const onAbort = () => {
          cleanup()
          reject(new Error('Cancelled'))
        }

        const cleanup = () => {
          this.bridge.removeListener('result', onResult)
          signal?.removeEventListener('abort', onAbort)
        }

        this.bridge.on('result', onResult)
        signal?.addEventListener('abort', onAbort, { once: true })
        this.bridge.send(payload)
      }),
      30000,
      'Studio timeout'
    )
  }
}
