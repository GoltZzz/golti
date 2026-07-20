import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import os from 'os'

let db: Database.Database | null = null
let dbFilePath = ''

function resolveDefaultPath(): string {
  try {
    // Lazy require so vitest can run without Electron bootstrap
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron') as typeof import('electron')
    if (app?.getPath) {
      const userDataPath = app.getPath('userData')
      const dbDir = path.join(userDataPath, 'golti_data')
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true })
      }
      return path.join(dbDir, 'golti_chat.sqlite')
    }
  } catch {
    // not in electron
  }
  const fallbackDir = path.join(os.tmpdir(), 'golti_data')
  if (!fs.existsSync(fallbackDir)) {
    fs.mkdirSync(fallbackDir, { recursive: true })
  }
  return path.join(fallbackDir, 'golti_chat.sqlite')
}

export function getSqlitePath(): string {
  if (!dbFilePath) {
    dbFilePath = resolveDefaultPath()
  }
  return dbFilePath
}

/** Allow tests to inject a path before open. */
export function setSqlitePath(p: string): void {
  dbFilePath = p
  if (db) {
    db.close()
    db = null
  }
}

export function getSqlite(): Database.Database {
  if (db) return db
  const p = getSqlitePath()
  const dir = path.dirname(p)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  db = new Database(p)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

export function closeSqlite(): void {
  if (db) {
    db.close()
    db = null
  }
}

const MIGRATIONS: Array<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        model TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0,
        system_prompt TEXT,
        generation_settings TEXT,
        active_leaf_id TEXT
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        model TEXT,
        tokens_in INTEGER,
        tokens_out INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER,
        parent_id TEXT,
        variant_group_id TEXT,
        variant_index INTEGER DEFAULT 0,
        error TEXT,
        generation_id TEXT,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parent_id);
      CREATE INDEX IF NOT EXISTS idx_messages_variant ON messages(variant_group_id);

      CREATE TABLE IF NOT EXISTS message_versions (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL,
        content TEXT NOT NULL,
        edited_at INTEGER NOT NULL,
        edit_source TEXT NOT NULL,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS context_items (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        source_path TEXT,
        mime_type TEXT,
        token_estimate INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        error TEXT,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        language TEXT,
        content TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS artifact_versions (
        id TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL,
        content TEXT NOT NULL,
        version INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS citations (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL,
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        snippet TEXT NOT NULL,
        retrieved_at INTEGER NOT NULL,
        rank INTEGER,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS conversations_fts USING fts5(
        conversation_id UNINDEXED,
        title,
        body,
        content=''
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        message_id UNINDEXED,
        conversation_id UNINDEXED,
        content,
        content=''
      );
    `
  }
]

export function migrate(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `)

  const row = database.prepare('SELECT MAX(version) as v FROM schema_migrations').get() as {
    v: number | null
  }
  const current = row?.v ?? 0

  for (const m of MIGRATIONS) {
    if (m.version > current) {
      const run = database.transaction(() => {
        database.exec(m.sql)
        database
          .prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
          .run(m.version, Date.now())
      })
      run()
    }
  }
}

export function backupJsonStore(jsonPath: string): string | null {
  if (!fs.existsSync(jsonPath)) return null
  const backup = `${jsonPath}.pre-sqlite-backup`
  if (!fs.existsSync(backup)) {
    fs.copyFileSync(jsonPath, backup)
  }
  return backup
}
