import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'budgetokr.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db: Database.Database | null = null;

const SCHEMA_VERSION = 3;

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
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL DEFAULT 1)`);

  const row = db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined;
  const version = row?.version ?? 0;

  if (version < SCHEMA_VERSION) {
    if (version < 2) {
      // v0/v1 → drop old tables
      db.exec(`
        DROP TABLE IF EXISTS data_rows;
        DROP TABLE IF EXISTS datasets;
        DROP TABLE IF EXISTS metrics;
        DROP TABLE IF EXISTS active_dataset;
      `);
    }
    if (version >= 2) {
      // v2 → v3: add new columns to medidas (idempotent: ignore if already exists)
      try { db.exec(`ALTER TABLE medidas ADD COLUMN tipo_medida TEXT DEFAULT 'simples'`) } catch { /* ok */ }
      try { db.exec(`ALTER TABLE medidas ADD COLUMN denominador_filtros TEXT DEFAULT '[]'`) } catch { /* ok */ }
      try { db.exec(`ALTER TABLE medidas ADD COLUMN denominador_tipo_fonte TEXT DEFAULT 'ambos'`) } catch { /* ok */ }
    }
    if (!row) {
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
    } else {
      db.prepare('UPDATE schema_version SET version = ?').run(SCHEMA_VERSION);
    }
  }

  db.exec(`
    -- ─── Fato: Lançamentos (Budget + Razão no mesmo lugar) ───────────────────
    CREATE TABLE IF NOT EXISTS lancamentos (
      id                        INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo                      TEXT    NOT NULL CHECK (tipo IN ('budget','razao')),
      data_lancamento           TEXT,
      nome_conta_contabil       TEXT,
      numero_conta_contabil     TEXT,
      centro_custo              TEXT,
      nome_conta_contrapartida  TEXT,
      fonte                     TEXT,
      observacao                TEXT,
      debito_credito            REAL    NOT NULL DEFAULT 0,
      created_at                DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at                DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_lanc_tipo        ON lancamentos(tipo);
    CREATE INDEX IF NOT EXISTS idx_lanc_cc          ON lancamentos(centro_custo);
    CREATE INDEX IF NOT EXISTS idx_lanc_conta       ON lancamentos(numero_conta_contabil);
    CREATE INDEX IF NOT EXISTS idx_lanc_data        ON lancamentos(data_lancamento);
    CREATE INDEX IF NOT EXISTS idx_lanc_tipo_cc     ON lancamentos(tipo, centro_custo);
    CREATE INDEX IF NOT EXISTS idx_lanc_tipo_conta  ON lancamentos(tipo, numero_conta_contabil);

    -- ─── Dimensão: Centros de Custo ──────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS centros_custo (
      centro_custo        TEXT PRIMARY KEY,
      nome_centro_custo   TEXT,
      departamento        TEXT,
      nome_departamento   TEXT,
      area                TEXT,
      nome_area           TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_cc_depto ON centros_custo(departamento);
    CREATE INDEX IF NOT EXISTS idx_cc_area  ON centros_custo(area);

    -- ─── Dimensão: Contas Contábeis ──────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS contas_contabeis (
      numero_conta_contabil TEXT PRIMARY KEY,
      nome_conta_contabil   TEXT,
      agrupamento_arvore    TEXT,
      dre                   TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_ca_arvore ON contas_contabeis(agrupamento_arvore);
    CREATE INDEX IF NOT EXISTS idx_ca_dre    ON contas_contabeis(dre);

    -- ─── Medidas (como "measures" do Power BI) ───────────────────────────────
    CREATE TABLE IF NOT EXISTS medidas (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      nome                    TEXT    NOT NULL,
      descricao               TEXT,
      cor                     TEXT    DEFAULT '#6366f1',
      tipo_fonte              TEXT    DEFAULT 'ambos',   -- 'budget' | 'razao' | 'ambos'
      tipo_medida             TEXT    DEFAULT 'simples', -- 'simples' | 'ratio'
      filtros                 TEXT    NOT NULL DEFAULT '[]',
      denominador_filtros     TEXT    DEFAULT '[]',      -- só para tipo_medida='ratio'
      denominador_tipo_fonte  TEXT    DEFAULT 'ambos',
      created_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at              DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
