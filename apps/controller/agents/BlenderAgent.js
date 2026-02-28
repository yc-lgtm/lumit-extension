import net from 'net'

import { withTimeout } from '../utils/timeouts.js'

export class BlenderAgent {
  constructor(onUpdate) {
    this.onUpdate = typeof onUpdate === 'function' ? onUpdate : () => {}
    this.host = '127.0.0.1'
    this.port = 8766
  }

  async isRunning() {
    try {
      await withTimeout(
        () => new Promise((resolve, reject) => {
          const socket = new net.Socket()

          socket.once('connect', () => {
            socket.destroy()
            resolve(true)
          })

          socket.once('error', (error) => {
            socket.destroy()
            reject(error)
          })

          socket.connect(this.port, this.host)
        }),
        500,
        'Blender ping timeout'
      )
      return true
    } catch {
      return false
    }
  }

  async execute(instructions) {
    if (!await this.isRunning()) {
      return { success: false, error: 'Blender is not open. Open Blender first.' }
    }

    const payload = JSON.stringify({ code: instructions?.code || '' })

    return withTimeout(
      () => new Promise((resolve, reject) => {
        const socket = new net.Socket()
        let response = ''

        socket.on('data', (chunk) => {
          response += chunk.toString('utf8')
        })

        socket.once('error', (error) => {
          socket.destroy()
          reject(error)
        })

        socket.once('close', () => {
          try {
            const parsed = JSON.parse(response || '{}')
            resolve(parsed)
          } catch {
            reject(new Error('Invalid response from Blender bridge.'))
          }
        })

        socket.connect(this.port, this.host, () => {
          socket.write(payload)
          socket.end()
        })
      }),
      30000,
      'Blender request timeout'
    )
  }
}
