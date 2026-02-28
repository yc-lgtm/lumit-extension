import fs from 'fs/promises'
import path from 'path'

import { authenticate } from '@google-cloud/local-auth'
import { google } from 'googleapis'

import { createLogger } from '../utils/logger.js'
import { fileExists, loadJson, removeFileIfExists, saveJson } from '../utils/tokens.js'

const log = createLogger('GmailAgent')

const TOKEN_PATH = './data/gmail-token.json'
const CREDS_PATH = process.env.GOOGLE_CREDENTIALS_PATH || './credentials/google-credentials.json'
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify'
]

function getHeader(headers, name) {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || ''
}

function decodeBase64Url(value = '') {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(normalized, 'base64').toString('utf8')
}

function extractPlainText(payload) {
  if (!payload) return ''
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data)
  }

  for (const part of payload.parts || []) {
    const nested = extractPlainText(part)
    if (nested) return nested
  }

  return ''
}

function parseInstalledClient(creds) {
  const installed = creds.installed || creds.web
  if (!installed) {
    throw new Error('Invalid Google credentials file.')
  }
  return installed
}

export class GmailAgent {
  constructor(onUpdate) {
    this.onUpdate = typeof onUpdate === 'function' ? onUpdate : () => {}
  }

  async getAuth() {
    if (!await fileExists(CREDS_PATH)) {
      throw new Error(`Missing Google OAuth credentials at ${CREDS_PATH}`)
    }

    if (!await fileExists(TOKEN_PATH)) {
      return this._freshAuth()
    }

    const tokenData = await loadJson(TOKEN_PATH)
    const creds = await loadJson(CREDS_PATH)
    const installed = parseInstalledClient(creds)

    const auth = new google.auth.OAuth2(
      installed.client_id,
      installed.client_secret,
      installed.redirect_uris?.[0]
    )

    auth.setCredentials(tokenData)

    const exp = tokenData.expiry_date || 0
    const needsRefresh = Date.now() + 60000 >= exp

    if (needsRefresh && tokenData.refresh_token) {
      const refreshed = await auth.refreshAccessToken()
      auth.setCredentials({ ...tokenData, ...refreshed.credentials })
      await saveJson(TOKEN_PATH, auth.credentials)
    }

    return auth
  }

  async _freshAuth() {
    await removeFileIfExists(TOKEN_PATH)

    const auth = await authenticate({
      keyfilePath: path.resolve(CREDS_PATH),
      scopes: SCOPES
    })

    await saveJson(TOKEN_PATH, auth.credentials)
    return auth
  }

  async execute(instructions) {
    const auth = await this.getAuth()
    const gmail = google.gmail({ version: 'v1', auth })

    switch (instructions?.action) {
      case 'read_inbox':
        return this.readInbox(gmail, instructions)
      case 'read_email':
        return this.readEmail(gmail, instructions)
      case 'send_email':
        return this.sendEmail(gmail, instructions)
      case 'reply_email':
        return this.replyEmail(gmail, instructions)
      case 'search_emails':
        return this.searchEmails(gmail, instructions)
      default:
        return { success: false, error: `Unknown Gmail action: ${instructions?.action}` }
    }
  }

  async readInbox(gmail, { maxResults = 10 }) {
    const list = await gmail.users.messages.list({
      userId: 'me',
      labelIds: ['INBOX'],
      maxResults
    })

    const ids = list.data.messages || []
    const emails = []

    for (const msg of ids) {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'Date']
      })

      const headers = detail.data.payload?.headers || []
      emails.push({
        id: msg.id,
        subject: getHeader(headers, 'Subject'),
        from: getHeader(headers, 'From'),
        date: getHeader(headers, 'Date')
      })
    }

    return { success: true, emails }
  }

  async readEmail(gmail, { id }) {
    if (!id) {
      return { success: false, error: 'Message id is required.' }
    }

    const detail = await gmail.users.messages.get({
      userId: 'me',
      id,
      format: 'full'
    })

    const headers = detail.data.payload?.headers || []
    const body = extractPlainText(detail.data.payload).slice(0, 3000)

    return {
      success: true,
      email: {
        id,
        subject: getHeader(headers, 'Subject'),
        from: getHeader(headers, 'From'),
        date: getHeader(headers, 'Date'),
        body
      }
    }
  }

  async sendEmail(gmail, { to, subject, body }) {
    if (!to || !subject || !body) {
      return { success: false, error: 'send_email requires to, subject, and body.' }
    }

    const message = [
      `To: ${to}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'MIME-Version: 1.0',
      `Subject: ${subject}`,
      '',
      body
    ].join('\r\n')

    const raw = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw }
    })

    return { success: true, message: `Email sent (id: ${res.data.id}).` }
  }

  async replyEmail(gmail, { id, body }) {
    if (!id || !body) {
      return { success: false, error: 'reply_email requires id and body.' }
    }

    const original = await gmail.users.messages.get({
      userId: 'me',
      id,
      format: 'metadata',
      metadataHeaders: ['Subject', 'From', 'Message-ID']
    })

    const headers = original.data.payload?.headers || []
    const subject = getHeader(headers, 'Subject')
    const from = getHeader(headers, 'From')
    const messageId = getHeader(headers, 'Message-ID')

    const replySubject = /^Re:/i.test(subject) ? subject : `Re: ${subject}`

    const message = [
      `To: ${from}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'MIME-Version: 1.0',
      `Subject: ${replySubject}`,
      messageId ? `In-Reply-To: ${messageId}` : '',
      messageId ? `References: ${messageId}` : '',
      '',
      body
    ].filter(Boolean).join('\r\n')

    const raw = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw,
        threadId: original.data.threadId
      }
    })

    return { success: true, message: 'Reply sent.' }
  }

  async searchEmails(gmail, { query, maxResults = 5 }) {
    const list = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults
    })

    const items = list.data.messages || []
    const emails = []

    for (const msg of items) {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'Date']
      })
      const headers = detail.data.payload?.headers || []
      emails.push({
        id: msg.id,
        subject: getHeader(headers, 'Subject'),
        from: getHeader(headers, 'From'),
        date: getHeader(headers, 'Date')
      })
    }

    return { success: true, emails }
  }
}

log.debug('GmailAgent loaded')
