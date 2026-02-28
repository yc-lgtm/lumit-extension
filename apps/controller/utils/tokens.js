import fs from 'fs/promises'
import path from 'path'

export async function loadJson(filePath) {
  const text = await fs.readFile(filePath, 'utf8')
  return JSON.parse(text)
}

export async function saveJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8')
}

export async function removeFileIfExists(filePath) {
  try {
    await fs.unlink(filePath)
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }
}

export async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}
