import EventEmitter from 'events'
import express from 'express'

import { createLogger } from '../../utils/logger.js'

const log = createLogger('BridgeServer')

export class BridgeServer extends EventEmitter {
  constructor(port = 8765) {
    super()
    this.port = port
    this.app = express()
    this.pending = []
    this.waiters = []
    this.server = null

    this.app.use(express.json({ limit: '2mb' }))
    this._routes()
  }

  _routes() {
    this.app.get('/poll', (req, res) => {
      if (this.pending.length > 0) {
        const items = this.pending.splice(0)
        res.json(items)
        return
      }

      const waiter = { res }
      waiter.timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter)
        if (!res.headersSent) {
          res.json([])
        }
      }, 5000)

      this.waiters.push(waiter)

      res.on('close', () => {
        clearTimeout(waiter.timer)
        this.waiters = this.waiters.filter((w) => w !== waiter)
      })
    })

    this.app.post('/results', (req, res) => {
      this.emit('result', req.body)
      res.json({ ok: true })
    })
  }

  send(instruction) {
    if (this.waiters.length > 0) {
      const waiter = this.waiters.shift()
      clearTimeout(waiter.timer)
      if (!waiter.res.headersSent) {
        waiter.res.json([instruction])
      }
      return
    }

    this.pending.push(instruction)
  }

  start() {
    if (this.server) {
      return
    }

    this.server = this.app.listen(this.port, '127.0.0.1', () => {
      log.info(`Studio bridge ready on 127.0.0.1:${this.port}`)
    })
  }
}
