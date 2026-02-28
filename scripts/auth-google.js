import fs from 'fs/promises'
import path from 'path'

import { authenticate } from '@google-cloud/local-auth'

import { saveJson } from '../apps/controller/utils/tokens.js'

const CREDS_PATH = process.env.GOOGLE_CREDENTIALS_PATH || './credentials/google-credentials.json'
const GMAIL_TOKEN_PATH = './data/gmail-token.json'
const SLIDES_TOKEN_PATH = './data/slides-token.json'

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify'
]

const SLIDES_SCOPES = [
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/drive.file'
]

async function ensureCredentials() {
  try {
    await fs.access(CREDS_PATH)
  } catch {
    throw new Error(`Missing Google OAuth credentials at ${path.resolve(CREDS_PATH)}`)
  }
}

async function authFor(scopes, tokenPath) {
  const auth = await authenticate({
    keyfilePath: path.resolve(CREDS_PATH),
    scopes
  })
  await saveJson(tokenPath, auth.credentials)
}

async function main() {
  await ensureCredentials()
  console.log('[Lumit] Starting Gmail auth flow...')
  await authFor(GMAIL_SCOPES, GMAIL_TOKEN_PATH)
  console.log('[Lumit] Gmail token saved.')

  console.log('[Lumit] Starting Slides auth flow...')
  await authFor(SLIDES_SCOPES, SLIDES_TOKEN_PATH)
  console.log('[Lumit] Slides token saved.')
}

main().catch((error) => {
  console.error('[Lumit] Auth setup failed:', error.message)
  process.exit(1)
})
