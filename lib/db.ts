import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'budgetokr.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Use globalThis to persist DB across HMR in dev mode
const globalForDb = globalThis as unknown as { __budgetokr_db?: Database.Database; __budgetokr_schema_v?: number }

const SCHEMA_VERSION = 14;

export function getDb(): Database.Database {
  // Re-run migrations if schema version changed (e.g. after code deploy)
  if (globalForDb.__budgetokr_db && globalForDb.__budgetokr_schema_v === SCHEMA_VERSION) {
    return globalForDb.__budgetokr_db;
  }
  if (!globalForDb.__budgetokr_db) {
    globalForDb.__budgetokr_db = new Database(DB_PATH);
    globalForDb.__budgetokr_db.pragma('journal_mode = WAL');
    globalForDb.__budgetokr_db.pragma('foreign_keys = ON');
  }
  initSchema(globalForDb.__budgetokr_db);
  globalForDb.__budgetokr_schema_v = SCHEMA_VERSION;
  return globalForDb.__budgetokr_db;
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
    if (version >= 3) {
      // v3 → v4: add ordem_dre to contas_contabeis for DRE sorting
      try { db.exec(`ALTER TABLE contas_contabeis ADD COLUMN ordem_dre INTEGER DEFAULT 999`) } catch { /* ok */ }
    }
    // v4 → v5: dre_linhas — estrutura da DRE com subtotais e sinais
    // (idempotente: CREATE TABLE IF NOT EXISTS já garante isso)
    // v5 → v6: kpis_manuais e kpi_valores
    if (version < 6) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS kpis_manuais (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          nome         TEXT    NOT NULL,
          unidade      TEXT    NOT NULL DEFAULT '',
          descricao    TEXT    DEFAULT '',
          departamento TEXT    DEFAULT '',
          cor          TEXT    DEFAULT '#6366f1',
          ordem        INTEGER NOT NULL DEFAULT 999,
          tem_budget   INTEGER NOT NULL DEFAULT 0,
          created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS kpi_valores (
          id       INTEGER PRIMARY KEY AUTOINCREMENT,
          kpi_id   INTEGER NOT NULL,
          periodo  TEXT    NOT NULL,
          valor    REAL    NOT NULL DEFAULT 0,
          meta     REAL    DEFAULT NULL,
          UNIQUE(kpi_id, periodo),
          FOREIGN KEY (kpi_id) REFERENCES kpis_manuais(id) ON DELETE CASCADE
        );
      `)
    }
    // v6 → v7: dept_medidas + unidade em medidas
    if (version < 7) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS dept_medidas (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          departamento TEXT    NOT NULL,
          medida_id    INTEGER NOT NULL,
          ordem        INTEGER NOT NULL DEFAULT 999,
          UNIQUE(departamento, medida_id),
          FOREIGN KEY (medida_id) REFERENCES medidas(id) ON DELETE CASCADE
        );
      `)
      try { db.exec(`ALTER TABLE medidas ADD COLUMN unidade TEXT DEFAULT ''`) } catch { /* ok */ }
    }
    // v7 → v8: departamentos field on medidas for dept assignment
    if (version < 8) {
      try { db.exec(`ALTER TABLE medidas ADD COLUMN departamentos TEXT DEFAULT '[]'`) } catch { /* ok */ }
    }
    // v8 → v9: AND/OR operator for filter conditions
    if (version < 9) {
      try { db.exec(`ALTER TABLE medidas ADD COLUMN filtros_operador TEXT DEFAULT 'AND'`) } catch { /* ok */ }
      try { db.exec(`ALTER TABLE medidas ADD COLUMN denominador_filtros_operador TEXT DEFAULT 'AND'`) } catch { /* ok */ }
    }
    // v9 → v10: nivel hierárquico do plano de contas
    if (version < 10) {
      try { db.exec(`ALTER TABLE contas_contabeis ADD COLUMN nivel INTEGER DEFAULT 0`) } catch { /* ok */ }
      // Popula o nível baseado na quantidade de segmentos separados por "."
      try {
        db.exec(`
          UPDATE contas_contabeis
          SET nivel = LENGTH(numero_conta_contabil) - LENGTH(REPLACE(numero_conta_contabil, '.', '')) + 1
          WHERE nivel = 0 OR nivel IS NULL
        `)
      } catch { /* ok */ }
    }
    // v10 → v11: log de acessos
    if (version < 11) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS login_logs (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id    TEXT NOT NULL,
          role       TEXT,
          department TEXT,
          success    INTEGER NOT NULL DEFAULT 0,
          ip         TEXT,
          user_agent TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_login_logs_user ON login_logs(user_id);
        CREATE INDEX IF NOT EXISTS idx_login_logs_date ON login_logs(created_at);
      `)
    }
    // v11 → v12: tabela capex (CAPEX budget + razão com nome_projeto)
    if (version < 12) {
      // Tabela criada abaixo via CREATE TABLE IF NOT EXISTS
    }
    // v12 → v13: audit_log, dre_comments, user_favorites
    if (version < 13) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          tabela         TEXT NOT NULL,
          registro_id    INTEGER,
          acao           TEXT NOT NULL,
          campo          TEXT,
          valor_anterior TEXT,
          valor_novo     TEXT,
          usuario        TEXT,
          created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_audit_tabela   ON audit_log(tabela);
        CREATE INDEX IF NOT EXISTS idx_audit_registro ON audit_log(registro_id);
        CREATE INDEX IF NOT EXISTS idx_audit_date     ON audit_log(created_at);

        CREATE TABLE IF NOT EXISTS dre_comments (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          dre_linha     TEXT NOT NULL,
          agrupamento   TEXT,
          conta         TEXT,
          periodo       TEXT,
          texto         TEXT NOT NULL,
          usuario       TEXT,
          created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_dre_comments_linha ON dre_comments(dre_linha);
        CREATE INDEX IF NOT EXISTS idx_dre_comments_per   ON dre_comments(periodo);

        CREATE TABLE IF NOT EXISTS user_favorites (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          usuario    TEXT NOT NULL,
          nome       TEXT NOT NULL,
          url        TEXT NOT NULL,
          filtros    TEXT DEFAULT '{}',
          icone      TEXT DEFAULT 'star',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_favorites_user ON user_favorites(usuario);
      `)
    }

    // v13 → v14: add user_role + departamento to dre_comments for role-based visibility
    if (version < 14) {
      try { db.exec(`ALTER TABLE dre_comments ADD COLUMN user_role TEXT DEFAULT 'master'`) } catch { /* ok */ }
      try { db.exec(`ALTER TABLE dre_comments ADD COLUMN departamento TEXT`) } catch { /* ok */ }
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
      dre                   TEXT,
      ordem_dre             INTEGER DEFAULT 999
    );

    CREATE INDEX IF NOT EXISTS idx_ca_arvore ON contas_contabeis(agrupamento_arvore);
    CREATE INDEX IF NOT EXISTS idx_ca_dre    ON contas_contabeis(dre);

    -- ─── Estrutura da DRE (linhas, subtotais, sinais) ────────────────────────
    -- tipo: 'grupo' = linha real dos dados | 'subtotal' = linha calculada
    -- sinal: 1 ou -1 (para inverter sinal de apresentação, ex: custos negativos)
    -- formula_grupos: JSON array de nomes de grupos que compõem este subtotal
    --   ex: '["Revenues","(-) Revenue Deductions"]'
    -- formula_sinais: JSON array de sinais para cada grupo na fórmula
    --   ex: '[1, 1]'  (soma todos) ou '[1, -1]' (subtrai segundo)
    CREATE TABLE IF NOT EXISTS dre_linhas (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      ordem         INTEGER NOT NULL DEFAULT 999,
      nome          TEXT    NOT NULL UNIQUE,
      tipo          TEXT    NOT NULL DEFAULT 'grupo',   -- 'grupo' | 'subtotal'
      sinal         INTEGER NOT NULL DEFAULT 1,         -- 1 ou -1
      formula_grupos TEXT   DEFAULT '[]',               -- JSON array (só subtotal)
      formula_sinais TEXT   DEFAULT '[]',               -- JSON array de ints
      negrito       INTEGER NOT NULL DEFAULT 0,         -- 1 = linha em negrito
      separador     INTEGER NOT NULL DEFAULT 0          -- 1 = linha separadora acima
    );

    -- ─── KPIs Manuais ─────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS kpis_manuais (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      nome         TEXT    NOT NULL,
      unidade      TEXT    NOT NULL DEFAULT '',
      descricao    TEXT    DEFAULT '',
      departamento TEXT    DEFAULT '',
      cor          TEXT    DEFAULT '#6366f1',
      ordem        INTEGER NOT NULL DEFAULT 999,
      tem_budget   INTEGER NOT NULL DEFAULT 0,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS kpi_valores (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      kpi_id   INTEGER NOT NULL,
      periodo  TEXT    NOT NULL,
      valor    REAL    NOT NULL DEFAULT 0,
      meta     REAL    DEFAULT NULL,
      UNIQUE(kpi_id, periodo),
      FOREIGN KEY (kpi_id) REFERENCES kpis_manuais(id) ON DELETE CASCADE
    );

    -- ─── Fato: CAPEX (Budget + Razão com nome_projeto) ─────────────────────────
    CREATE TABLE IF NOT EXISTS capex (
      id                        INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo                      TEXT    NOT NULL CHECK (tipo IN ('budget','razao')),
      data_lancamento           TEXT,
      nome_projeto              TEXT,
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

    CREATE INDEX IF NOT EXISTS idx_capex_tipo        ON capex(tipo);
    CREATE INDEX IF NOT EXISTS idx_capex_cc           ON capex(centro_custo);
    CREATE INDEX IF NOT EXISTS idx_capex_conta        ON capex(numero_conta_contabil);
    CREATE INDEX IF NOT EXISTS idx_capex_data         ON capex(data_lancamento);
    CREATE INDEX IF NOT EXISTS idx_capex_projeto      ON capex(nome_projeto);
    CREATE INDEX IF NOT EXISTS idx_capex_tipo_cc      ON capex(tipo, centro_custo);

    -- ─── Medidas (como "measures" do Power BI) ───────────────────────────────
    CREATE TABLE IF NOT EXISTS medidas (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      nome                    TEXT    NOT NULL,
      descricao               TEXT,
      unidade                 TEXT    DEFAULT '',        -- 'R$', '%', 'x', etc.
      cor                     TEXT    DEFAULT '#6366f1',
      tipo_fonte              TEXT    DEFAULT 'ambos',   -- 'budget' | 'razao' | 'ambos'
      tipo_medida             TEXT    DEFAULT 'simples', -- 'simples' | 'ratio'
      filtros                 TEXT    NOT NULL DEFAULT '[]',
      filtros_operador        TEXT    DEFAULT 'AND',     -- 'AND' | 'OR'
      denominador_filtros     TEXT    DEFAULT '[]',      -- só para tipo_medida='ratio'
      denominador_filtros_operador TEXT DEFAULT 'AND',   -- 'AND' | 'OR'
      denominador_tipo_fonte  TEXT    DEFAULT 'ambos',
      departamentos           TEXT    DEFAULT '[]',
      created_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at              DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
