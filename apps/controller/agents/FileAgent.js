import fs from 'fs/promises'
import path from 'path'

import { glob } from 'glob'

function normalizeRoot(root) {
  return path.resolve(root).toLowerCase()
}

function isWithinRoot(candidate, roots) {
  const resolved = path.resolve(candidate).toLowerCase()
  return roots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`))
}

export class FileAgent {
  constructor(onUpdate, { workspaceRoot } = {}) {
    this.onUpdate = typeof onUpdate === 'function' ? onUpdate : () => {}
    const envRoots = (process.env.LUMIT_ALLOWED_ROOTS || '')
      .split(';')
      .map((v) => v.trim())
      .filter(Boolean)

    const roots = envRoots.length > 0 ? envRoots : [workspaceRoot || process.cwd()]
    this.allowedRoots = roots.map(normalizeRoot)
    this.sessionAllowedFiles = new Set()
  }

  setSessionPaths(paths = []) {
    this.sessionAllowedFiles.clear()
    for (const target of paths) {
      if (!target) continue
      this.sessionAllowedFiles.add(path.resolve(target).toLowerCase())
    }
  }

  _isSessionAllowed(targetPath) {
    const resolved = path.resolve(targetPath).toLowerCase()
    return this.sessionAllowedFiles.has(resolved)
  }

  _assertSafePath(targetPath) {
    if (!targetPath) {
      throw new Error('Path is required.')
    }

    const resolved = path.resolve(targetPath)
    if (!isWithinRoot(resolved, this.allowedRoots) && !this._isSessionAllowed(resolved)) {
      throw new Error(`Path outside allowed roots: ${resolved}. Attach the file to grant per-request access.`)
    }

    return resolved
  }

  async execute(instructions) {
    const action = instructions?.action

    try {
      switch (action) {
        case 'read':
          return await this.read(instructions)
        case 'write':
          return await this.write(instructions)
        case 'list':
          return await this.list(instructions)
        case 'search':
          return await this.search(instructions)
        case 'move':
          return await this.move(instructions)
        case 'delete':
          return await this.delete(instructions)
        default:
          return { success: false, error: `Unknown file action: ${action}` }
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  async read({ filePath }) {
    const safePath = this._assertSafePath(filePath)
    const content = await fs.readFile(safePath, 'utf8')
    return { success: true, content, path: safePath }
  }

  async write({ filePath, content }) {
    const safePath = this._assertSafePath(filePath)
    await fs.mkdir(path.dirname(safePath), { recursive: true })
    await fs.writeFile(safePath, String(content ?? ''), 'utf8')
    return { success: true, message: `Wrote ${safePath}` }
  }

  async list({ dirPath, recursive = false }) {
    const safeDir = this._assertSafePath(dirPath || process.cwd())
    const pattern = recursive ? '**/*' : '*'
    const files = await glob(pattern, {
      cwd: safeDir,
      dot: false,
      nodir: true,
      absolute: true
    })
    return { success: true, files }
  }

  async search({ dirPath, pattern }) {
    const safeDir = this._assertSafePath(dirPath || process.cwd())
    const globPattern = pattern || '**/*'
    const files = await glob(globPattern, {
      cwd: safeDir,
      dot: true,
      nodir: true,
      absolute: true
    })
    return { success: true, files }
  }

  async move({ from, to }) {
    const source = this._assertSafePath(from)
    const target = this._assertSafePath(to)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.rename(source, target)
    return { success: true, message: `Moved to ${target}` }
  }

  async delete({ filePath }) {
    const safePath = this._assertSafePath(filePath)
    await fs.unlink(safePath)
    return { success: true, message: `Deleted ${safePath}` }
  }
}
