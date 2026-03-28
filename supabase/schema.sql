-- ============================================================
-- BudgetOKR — Schema PostgreSQL (Supabase)
-- Execute este arquivo no SQL Editor do Supabase
-- ============================================================

-- ─── Fato: Lançamentos (Budget + Razão) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS lancamentos (
  id                        BIGSERIAL PRIMARY KEY,
  tipo                      TEXT        NOT NULL CHECK (tipo IN ('budget','razao')),
  data_lancamento           DATE,
  numero_transacao          TEXT,
  nome_conta_contabil       TEXT,
  numero_conta_contabil     TEXT,
  centro_custo              TEXT,
  id_cc_cc                  TEXT,
  num_transacao             TEXT,
  nome_conta_contrapartida  TEXT,
  fonte                     TEXT,
  observacao                TEXT,
  debito_credito            NUMERIC     NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);
-- Migration: add numero_transacao if not exists
ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS numero_transacao TEXT;
CREATE INDEX IF NOT EXISTS idx_lanc_tipo       ON lancamentos(tipo);
CREATE INDEX IF NOT EXISTS idx_lanc_cc         ON lancamentos(centro_custo);
CREATE INDEX IF NOT EXISTS idx_lanc_conta      ON lancamentos(numero_conta_contabil);
CREATE INDEX IF NOT EXISTS idx_lanc_data       ON lancamentos(data_lancamento);
CREATE INDEX IF NOT EXISTS idx_lanc_tipo_cc    ON lancamentos(tipo, centro_custo);
CREATE INDEX IF NOT EXISTS idx_lanc_tipo_conta ON lancamentos(tipo, numero_conta_contabil);
ALTER TABLE lancamentos ENABLE ROW LEVEL SECURITY;

-- ─── Dimensão: Unidades de Negócio ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS unidades_negocio (
  id_cc_cc          TEXT PRIMARY KEY,
  management_report TEXT,
  conta             TEXT,
  centros_custo     TEXT,
  unidade           TEXT
);
CREATE INDEX IF NOT EXISTS idx_un_unidade ON unidades_negocio(unidade);
ALTER TABLE unidades_negocio ENABLE ROW LEVEL SECURITY;

-- ─── Dimensão: Centros de Custo ──────────────────────────────────────────────
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
ALTER TABLE centros_custo ENABLE ROW LEVEL SECURITY;

-- ─── Dimensão: Contas Contábeis ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contas_contabeis (
  numero_conta_contabil TEXT PRIMARY KEY,
  nome_conta_contabil   TEXT,
  agrupamento_arvore    TEXT,
  dre                   TEXT,
  ordem_dre             INTEGER DEFAULT 999,
  nivel                 INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ca_arvore ON contas_contabeis(agrupamento_arvore);
CREATE INDEX IF NOT EXISTS idx_ca_dre    ON contas_contabeis(dre);
ALTER TABLE contas_contabeis ENABLE ROW LEVEL SECURITY;

-- ─── Estrutura da DRE (linhas, subtotais, sinais) ────────────────────────────
CREATE TABLE IF NOT EXISTS dre_linhas (
  id             BIGSERIAL PRIMARY KEY,
  ordem          INTEGER     NOT NULL DEFAULT 999,
  nome           TEXT        NOT NULL UNIQUE,
  tipo           TEXT        NOT NULL DEFAULT 'grupo',   -- 'grupo' | 'subtotal'
  sinal          INTEGER     NOT NULL DEFAULT 1,
  formula_grupos JSONB       DEFAULT '[]',
  formula_sinais JSONB       DEFAULT '[]',
  negrito        BOOLEAN     NOT NULL DEFAULT FALSE,
  separador      BOOLEAN     NOT NULL DEFAULT FALSE
);
ALTER TABLE dre_linhas ENABLE ROW LEVEL SECURITY;

-- ─── KPIs Manuais ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kpis_manuais (
  id           BIGSERIAL PRIMARY KEY,
  nome         TEXT        NOT NULL,
  unidade      TEXT        NOT NULL DEFAULT '',
  descricao    TEXT        DEFAULT '',
  departamento TEXT        DEFAULT '',
  cor          TEXT        DEFAULT '#6366f1',
  ordem        INTEGER     NOT NULL DEFAULT 999,
  tem_budget   INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE kpis_manuais ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS kpi_valores (
  id       BIGSERIAL PRIMARY KEY,
  kpi_id   BIGINT      NOT NULL REFERENCES kpis_manuais(id) ON DELETE CASCADE,
  periodo  TEXT        NOT NULL,
  valor    NUMERIC     NOT NULL DEFAULT 0,
  meta     NUMERIC,
  UNIQUE(kpi_id, periodo)
);
ALTER TABLE kpi_valores ENABLE ROW LEVEL SECURITY;

-- ─── Fato: CAPEX ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS capex (
  id                        BIGSERIAL PRIMARY KEY,
  tipo                      TEXT        NOT NULL CHECK (tipo IN ('budget','razao')),
  data_lancamento           DATE,
  nome_projeto              TEXT,
  nome_conta_contabil       TEXT,
  numero_conta_contabil     TEXT,
  centro_custo              TEXT,
  nome_conta_contrapartida  TEXT,
  fonte                     TEXT,
  observacao                TEXT,
  debito_credito            NUMERIC     NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_capex_tipo    ON capex(tipo);
CREATE INDEX IF NOT EXISTS idx_capex_cc      ON capex(centro_custo);
CREATE INDEX IF NOT EXISTS idx_capex_conta   ON capex(numero_conta_contabil);
CREATE INDEX IF NOT EXISTS idx_capex_data    ON capex(data_lancamento);
CREATE INDEX IF NOT EXISTS idx_capex_projeto ON capex(nome_projeto);
ALTER TABLE capex ENABLE ROW LEVEL SECURITY;

-- ─── Medidas (como "measures" do Power BI) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS medidas (
  id                           BIGSERIAL PRIMARY KEY,
  nome                         TEXT        NOT NULL,
  descricao                    TEXT,
  unidade                      TEXT        DEFAULT '',
  cor                          TEXT        DEFAULT '#6366f1',
  tipo_fonte                   TEXT        DEFAULT 'ambos',
  tipo_medida                  TEXT        DEFAULT 'simples',
  filtros                      JSONB       NOT NULL DEFAULT '[]',
  filtros_operador             TEXT        DEFAULT 'AND',
  denominador_filtros          JSONB       DEFAULT '[]',
  denominador_filtros_operador TEXT        DEFAULT 'AND',
  denominador_tipo_fonte       TEXT        DEFAULT 'ambos',
  departamentos                JSONB       DEFAULT '[]',
  created_at                   TIMESTAMPTZ DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE medidas ENABLE ROW LEVEL SECURITY;

-- ─── Dept Medidas ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dept_medidas (
  id           BIGSERIAL PRIMARY KEY,
  departamento TEXT        NOT NULL,
  medida_id    BIGINT      NOT NULL REFERENCES medidas(id) ON DELETE CASCADE,
  ordem        INTEGER     NOT NULL DEFAULT 999,
  UNIQUE(departamento, medida_id)
);
ALTER TABLE dept_medidas ENABLE ROW LEVEL SECURITY;

-- ─── Usuários da aplicação ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_users (
  id         BIGSERIAL PRIMARY KEY,
  username   TEXT        NOT NULL UNIQUE,
  password   TEXT        NOT NULL,
  role       TEXT        NOT NULL DEFAULT 'dept',  -- 'master' | 'dept'
  department TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

-- ─── Log de acessos ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS login_logs (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT        NOT NULL,
  role       TEXT,
  department TEXT,
  success    BOOLEAN     NOT NULL DEFAULT FALSE,
  ip         TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_login_logs_user ON login_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_date ON login_logs(created_at);
ALTER TABLE login_logs ENABLE ROW LEVEL SECURITY;

-- ─── Audit Log ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id             BIGSERIAL PRIMARY KEY,
  tabela         TEXT        NOT NULL,
  registro_id    BIGINT,
  acao           TEXT        NOT NULL,
  campo          TEXT,
  valor_anterior TEXT,
  valor_novo     TEXT,
  usuario        TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_tabela   ON audit_log(tabela);
CREATE INDEX IF NOT EXISTS idx_audit_registro ON audit_log(registro_id);
CREATE INDEX IF NOT EXISTS idx_audit_date     ON audit_log(created_at);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- ─── Comentários / Tickets da DRE ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dre_comments (
  id              BIGSERIAL PRIMARY KEY,
  dre_linha       TEXT        NOT NULL,
  agrupamento     TEXT,
  conta           TEXT,
  periodo         TEXT,
  tipo_valor      TEXT        DEFAULT 'realizado',
  texto           TEXT        NOT NULL,
  usuario         TEXT,
  user_role       TEXT        DEFAULT 'master',
  departamento    TEXT,
  parent_id       BIGINT      REFERENCES dre_comments(id) ON DELETE CASCADE,
  status          TEXT        DEFAULT 'open',
  resolved_at     TIMESTAMPTZ,
  resolved_by     TEXT,
  resolved_motivo TEXT,
  filter_state    JSONB       DEFAULT '{}',
  lancamento_id   BIGINT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dre_comments_linha ON dre_comments(dre_linha);
CREATE INDEX IF NOT EXISTS idx_dre_comments_per   ON dre_comments(periodo);
ALTER TABLE dre_comments ENABLE ROW LEVEL SECURITY;

-- ─── Favoritos do usuário ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_favorites (
  id         BIGSERIAL PRIMARY KEY,
  usuario    TEXT        NOT NULL,
  nome       TEXT        NOT NULL,
  url        TEXT        NOT NULL,
  filtros    JSONB       DEFAULT '{}',
  icone      TEXT        DEFAULT 'star',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON user_favorites(usuario);
ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;

-- ─── Permissões de Centros de Custo por Usuário (N:N) ────────────────────────
-- Permite configurar quais centros de custo cada usuário pode visualizar.
-- Se o usuário não tiver nenhuma linha aqui, ele vê todos os centros do seu
-- departamento (comportamento atual). Se tiver linhas, vê apenas os listados.
CREATE TABLE IF NOT EXISTS user_centros_custo (
  id           BIGSERIAL PRIMARY KEY,
  username     TEXT        NOT NULL,
  centro_custo TEXT        NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(username, centro_custo),
  CONSTRAINT fk_ucc_user   FOREIGN KEY (username)     REFERENCES app_users(username)     ON DELETE CASCADE,
  CONSTRAINT fk_ucc_centro FOREIGN KEY (centro_custo) REFERENCES centros_custo(centro_custo) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ucc_username ON user_centros_custo(username);
ALTER TABLE user_centros_custo ENABLE ROW LEVEL SECURITY;

-- ─── Permissões de Unidades de Negócio por Usuário (N:N) ─────────────────────
-- Se o usuário não tiver nenhuma linha aqui, ele vê todas as unidades do seu
-- departamento. Se tiver linhas, vê apenas as unidades listadas — mas SEM acesso
-- ao detalhamento de lançamentos (drill-down bloqueado).
CREATE TABLE IF NOT EXISTS user_unidades_negocio (
  id         BIGSERIAL PRIMARY KEY,
  username   TEXT        NOT NULL,
  unidade    TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(username, unidade),
  CONSTRAINT fk_uun_user FOREIGN KEY (username) REFERENCES app_users(username) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_uun_username ON user_unidades_negocio(username);
ALTER TABLE user_unidades_negocio ENABLE ROW LEVEL SECURITY;

-- ─── Departamentos por Usuário (N:N) ─────────────────────────────────────────
-- Permite atribuir múltiplos departamentos a um usuário do tipo 'dept'.
-- Se não houver linhas aqui, o sistema usa a coluna legacy app_users.department.
CREATE TABLE IF NOT EXISTS user_departamentos (
  id           BIGSERIAL PRIMARY KEY,
  username     TEXT        NOT NULL,
  departamento TEXT        NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(username, departamento),
  CONSTRAINT fk_ud_user FOREIGN KEY (username) REFERENCES app_users(username) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ud_username ON user_departamentos(username);
ALTER TABLE user_departamentos ENABLE ROW LEVEL SECURITY;

-- ─── Usuário inicial ─────────────────────────────────────────────────────────
-- Crie o primeiro usuário via painel do Supabase ou via API com senha hasheada.
-- NUNCA insira senhas em texto puro no SQL.

-- ─── Gráficos Executivos por Departamento ────────────────────────────────────
-- Armazena as configurações de gráficos executivos por departamento.
-- dept_name = '__dashboard__' para o dashboard global (master).
CREATE TABLE IF NOT EXISTS exec_chart_configs (
  id          BIGSERIAL PRIMARY KEY,
  dept_name   TEXT NOT NULL UNIQUE,
  configs     JSONB NOT NULL DEFAULT '[]',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE exec_chart_configs ENABLE ROW LEVEL SECURITY;
