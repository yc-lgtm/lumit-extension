import * as cheerio from 'cheerio'

export class WebAgent {
  constructor(onUpdate, { fetcher = fetch } = {}) {
    this.onUpdate = typeof onUpdate === 'function' ? onUpdate : () => {}
    this.searchKey = process.env.SERPER_API_KEY || ''
    this.fetcher = fetcher
  }

  async execute(instructions) {
    const action = instructions?.action

    switch (action) {
      case 'search':
        return this.search(instructions)
      case 'fetch':
        return this.fetchPage(instructions)
      default:
        return { success: false, error: `Unknown web action: ${action}` }
    }
  }

  async search({ query, numResults = 5 }) {
    if (!this.searchKey) {
      return { success: false, error: 'SERPER_API_KEY is missing.' }
    }

    const res = await this.fetcher('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': this.searchKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ q: query, num: numResults })
    })

    if (!res.ok) {
      return { success: false, error: `Search failed (${res.status}).` }
    }

    const data = await res.json()
    const results = (data.organic || []).map((item) => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet
    }))

    return { success: true, results }
  }

  async fetchPage({ url }) {
    const res = await this.fetcher(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Lumit/2.0'
      }
    })

    if (!res.ok) {
      return { success: false, error: `Fetch failed (${res.status}).`, url }
    }

    const html = await res.text()
    const $ = cheerio.load(html)
    $('script, style, nav, footer, header, aside').remove()

    const content = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 5000)
    return { success: true, content, url }
  }
}
