-- ============================================================
-- Migration: Habilitar RLS em todas as tabelas
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor)
--
-- IMPORTANTE: o app usa service_role_key que bypassa RLS,
-- então nada quebra. Isso bloqueia acesso via anon key.
-- ============================================================

-- Dados financeiros
ALTER TABLE lancamentos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE capex                   ENABLE ROW LEVEL SECURITY;

-- Dimensões
ALTER TABLE unidades_negocio        ENABLE ROW LEVEL SECURITY;
ALTER TABLE centros_custo           ENABLE ROW LEVEL SECURITY;
ALTER TABLE contas_contabeis        ENABLE ROW LEVEL SECURITY;

-- Estrutura DRE
ALTER TABLE dre_linhas              ENABLE ROW LEVEL SECURITY;

-- KPIs
ALTER TABLE kpis_manuais            ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_valores             ENABLE ROW LEVEL SECURITY;

-- Medidas
ALTER TABLE medidas                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE dept_medidas            ENABLE ROW LEVEL SECURITY;

-- Usuários e autenticação
ALTER TABLE app_users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log               ENABLE ROW LEVEL SECURITY;

-- Comentários e favoritos
ALTER TABLE dre_comments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_favorites          ENABLE ROW LEVEL SECURITY;

-- Permissões N:N
ALTER TABLE user_centros_custo      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_unidades_negocio   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_departamentos      ENABLE ROW LEVEL SECURITY;

-- Configurações
ALTER TABLE exec_chart_configs      ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Sem policies = anon key bloqueada em todas as tabelas.
-- service_role_key continua com acesso total (bypass RLS).
-- ============================================================
