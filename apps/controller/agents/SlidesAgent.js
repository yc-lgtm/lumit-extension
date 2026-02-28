import path from 'path'

import { authenticate } from '@google-cloud/local-auth'
import { google } from 'googleapis'

import { fileExists, loadJson, removeFileIfExists, saveJson } from '../utils/tokens.js'

const TOKEN_PATH = './data/slides-token.json'
const CREDS_PATH = process.env.GOOGLE_CREDENTIALS_PATH || './credentials/google-credentials.json'
const SCOPES = [
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/drive.file'
]

function parseInstalledClient(creds) {
  const installed = creds.installed || creds.web
  if (!installed) {
    throw new Error('Invalid Google credentials file.')
  }
  return installed
}

function normalizeHex(hex) {
  if (!hex) return null
  const value = hex.replace('#', '').trim()
  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    return null
  }
  return value
}

function hexToRgb(hex) {
  const safe = normalizeHex(hex)
  if (!safe) return null
  const r = parseInt(safe.slice(0, 2), 16) / 255
  const g = parseInt(safe.slice(2, 4), 16) / 255
  const b = parseInt(safe.slice(4, 6), 16) / 255
  return { red: r, green: g, blue: b }
}

function layoutToGoogle(layout) {
  switch (layout) {
    case 'TITLE_SLIDE':
      return 'TITLE'
    case 'TITLE_ONLY':
      return 'TITLE_ONLY'
    case 'BLANK':
      return 'BLANK'
    case 'MAIN_POINT':
      return 'SECTION_HEADER'
    case 'BIG_NUMBER':
      return 'TITLE_AND_BODY'
    case 'TITLE_AND_BODY':
    default:
      return 'TITLE_AND_BODY'
  }
}

export class SlidesAgent {
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
    if (Date.now() + 60000 >= exp && tokenData.refresh_token) {
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
    const slides = google.slides({ version: 'v1', auth })

    const title = instructions?.title || 'Lumit Deck'
    const slideDefs = Array.isArray(instructions?.slides) ? instructions.slides : []

    const createRes = await slides.presentations.create({
      requestBody: { title }
    })

    const presentationId = createRes.data.presentationId
    const existingSlideId = createRes.data.slides?.[0]?.objectId

    const requests = []

    if (existingSlideId) {
      requests.push({ deleteObject: { objectId: existingSlideId } })
    }

    for (let i = 0; i < slideDefs.length; i += 1) {
      const def = slideDefs[i]
      const slideId = `slide_${Date.now()}_${i}`
      const titleId = `title_${Date.now()}_${i}`
      const bodyId = `body_${Date.now()}_${i}`
      const layout = layoutToGoogle(def.layout)

      const placeholderIdMappings = []
      if (def.title) {
        placeholderIdMappings.push({
          layoutPlaceholder: { type: 'TITLE', index: 0 },
          objectId: titleId
        })
      }
      if (Array.isArray(def.body) && def.body.length > 0 && layout !== 'TITLE_ONLY' && layout !== 'BLANK') {
        placeholderIdMappings.push({
          layoutPlaceholder: { type: 'BODY', index: 0 },
          objectId: bodyId
        })
      }

      requests.push({
        createSlide: {
          objectId: slideId,
          insertionIndex: i,
          slideLayoutReference: { predefinedLayout: layout },
          ...(placeholderIdMappings.length ? { placeholderIdMappings } : {})
        }
      })

      if (def.title) {
        requests.push({
          insertText: {
            objectId: titleId,
            insertionIndex: 0,
            text: def.title
          }
        })

        requests.push({
          updateTextStyle: {
            objectId: titleId,
            textRange: { type: 'ALL' },
            style: { bold: true },
            fields: 'bold'
          }
        })
      }

      if (Array.isArray(def.body) && def.body.length > 0 && layout !== 'TITLE_ONLY' && layout !== 'BLANK') {
        requests.push({
          insertText: {
            objectId: bodyId,
            insertionIndex: 0,
            text: def.body.join('\n')
          }
        })
      }

      const rgb = hexToRgb(def.background)
      if (rgb) {
        requests.push({
          updatePageProperties: {
            objectId: slideId,
            pageProperties: {
              pageBackgroundFill: {
                solidFill: {
                  color: { rgbColor: rgb }
                }
              }
            },
            fields: 'pageBackgroundFill.solidFill.color'
          }
        })
      }
    }

    await slides.presentations.batchUpdate({
      presentationId,
      requestBody: { requests }
    })

    return {
      success: true,
      id: presentationId,
      url: `https://docs.google.com/presentation/d/${presentationId}/edit`
    }
  }
}

export { hexToRgb }
