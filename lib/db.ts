import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'budgetokr.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS datasets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      filename TEXT NOT NULL,
      columns TEXT NOT NULL,        -- JSON array of column names
      column_mapping TEXT NOT NULL, -- JSON: { department, group, account, period, budget, actual, ... }
      row_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS data_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset_id INTEGER NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
      department TEXT,
      grp TEXT,
      account TEXT,
      period TEXT,
      budget REAL DEFAULT 0,
      actual REAL DEFAULT 0,
      extra TEXT  -- JSON for unmapped columns
    );

    CREATE INDEX IF NOT EXISTS idx_data_rows_dataset ON data_rows(dataset_id);
    CREATE INDEX IF NOT EXISTS idx_data_rows_dept ON data_rows(dataset_id, department);
    CREATE INDEX IF NOT EXISTS idx_data_rows_grp ON data_rows(dataset_id, grp);
    CREATE INDEX IF NOT EXISTS idx_data_rows_period ON data_rows(dataset_id, period);

    CREATE TABLE IF NOT EXISTS metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT DEFAULT '#6366f1',
      filters TEXT NOT NULL DEFAULT '[]',  -- JSON array of filter conditions
      dataset_id INTEGER REFERENCES datasets(id) ON DELETE CASCADE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS active_dataset (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      dataset_id INTEGER REFERENCES datasets(id)
    );

    INSERT OR IGNORE INTO active_dataset (id, dataset_id) VALUES (1, NULL);
  `);
}
