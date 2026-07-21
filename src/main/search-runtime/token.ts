import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { app } from 'electron'

export function getOrCreateSearchToken(): string {
  const file = path.join(app.getPath('userData'), 'golti-search-runtime', 'local.token')
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  if (fs.existsSync(file)) {
    const existing = fs.readFileSync(file, 'utf8').trim()
    if (existing.length >= 24) return existing
  }
  const token = crypto.randomBytes(32).toString('hex')
  fs.writeFileSync(file, token, { mode: 0o600 })
  return token
}
