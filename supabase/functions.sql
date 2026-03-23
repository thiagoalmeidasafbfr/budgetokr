-- ============================================================
-- BudgetOKR — Funções PostgreSQL (Supabase)
-- Execute APÓS o schema.sql
-- ============================================================

-- ─── Helper: monta cláusula WHERE dinâmica a partir de filtros JSON ───────────
CREATE OR REPLACE FUNCTION _build_where(
  p_filters      JSONB,
  p_default_logic TEXT DEFAULT 'AND'
) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_parts  TEXT[] := '{}';
  v_result TEXT   := '';
  v_item   JSONB;
  v_col    TEXT;
  v_op     TEXT;
  v_val    TEXT;
  v_part   TEXT;
  v_logic  TEXT;
  v_has_or BOOLEAN := FALSE;
  i        INT;
BEGIN
  IF p_filters IS NULL OR jsonb_array_length(p_filters) = 0 THEN
    RETURN '';
  END IF;

  FOR i IN 0..jsonb_array_length(p_filters)-1 LOOP
    v_item := p_filters->i;
    v_op   := v_item->>'operator';
    v_val  := v_item->>'value';
    v_col  := _col_expr(v_item->>'column');

    CASE v_op
      WHEN '='          THEN v_part := format('LOWER(%s) = LOWER(%s)', v_col, quote_literal(v_val));
      WHEN '!='         THEN v_part := format('LOWER(%s) != LOWER(%s)', v_col, quote_literal(v_val));
      WHEN 'contains'   THEN v_part := format('LOWER(%s) LIKE LOWER(%s)', v_col, quote_literal('%' || v_val || '%'));
      WHEN 'not_contains' THEN v_part := format('LOWER(%s) NOT LIKE LOWER(%s)', v_col, quote_literal('%' || v_val || '%'));
      WHEN 'starts_with' THEN v_part := format('LOWER(%s) LIKE LOWER(%s)', v_col, quote_literal(v_val || '%'));
      WHEN 'in' THEN
        DECLARE
          v_in_vals TEXT[] := '{}';
          v_tok TEXT;
        BEGIN
          FOREACH v_tok IN ARRAY string_to_array(v_val, ',') LOOP
            v_in_vals := array_append(v_in_vals, format('LOWER(%s)', quote_literal(trim(v_tok))));
          END LOOP;
          v_part := format('LOWER(%s) IN (%s)', v_col, array_to_string(v_in_vals, ','));
        END;
      ELSE v_part := NULL;
    END CASE;

    IF v_part IS NOT NULL THEN
      v_parts := array_append(v_parts, v_part);
      IF i > 0 THEN
        v_logic := COALESCE(NULLIF(v_item->>'logic', ''), p_default_logic);
        IF v_logic = 'OR' THEN v_has_or := TRUE; END IF;
      END IF;
    END IF;
  END LOOP;

  IF array_length(v_parts, 1) = 0 THEN RETURN ''; END IF;

  v_result := v_parts[1];
  FOR i IN 2..array_length(v_parts, 1) LOOP
    v_logic := COALESCE(NULLIF((p_filters->(i-1))->>'logic', ''), p_default_logic);
    v_result := v_result || ' ' || v_logic || ' ' || v_parts[i];
  END LOOP;

  IF v_has_or AND array_length(v_parts, 1) > 1 THEN
    v_result := '(' || v_result || ')';
  END IF;

  RETURN v_result;
END;
$$;

-- ─── Helper: mapeia nome de coluna filtro → expressão SQL ────────────────────
CREATE OR REPLACE FUNCTION _col_expr(p_col TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_col
    WHEN 'tipo'                  THEN 'l.tipo'
    WHEN 'numero_conta_contabil' THEN 'l.numero_conta_contabil'
    WHEN 'nome_conta_contabil'   THEN 'COALESCE(ca.nome_conta_contabil, l.nome_conta_contabil)'
    WHEN 'agrupamento_arvore'    THEN 'ca.agrupamento_arvore'
    WHEN 'dre'                   THEN 'ca.dre'
    WHEN 'centro_custo'          THEN 'l.centro_custo'
    WHEN 'departamento'          THEN 'cc.departamento'
    WHEN 'nome_departamento'     THEN 'cc.nome_departamento'
    WHEN 'area'                  THEN 'cc.area'
    WHEN 'fonte'                 THEN 'l.fonte'
    WHEN 'data_lancamento'       THEN 'l.data_lancamento::TEXT'
    ELSE 'l.' || p_col
  END;
$$;

-- ─── run_star_query: consulta star schema para medidas ───────────────────────
CREATE OR REPLACE FUNCTION run_star_query(
  p_tipo          TEXT,
  p_filters       JSONB    DEFAULT '[]',
  p_logic         TEXT     DEFAULT 'AND',
  p_extra_filters JSONB    DEFAULT '[]',
  p_periodos      TEXT[]   DEFAULT '{}',
  p_group_dept    BOOLEAN  DEFAULT FALSE,
  p_group_period  BOOLEAN  DEFAULT FALSE,
  p_group_cc      BOOLEAN  DEFAULT FALSE
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_where       TEXT;
  v_extra_where TEXT;
  v_all_cond    TEXT[] := ARRAY[format('l.tipo = %s', quote_literal(p_tipo))];
  v_select      TEXT[] := '{}';
  v_group       TEXT[] := '{}';
  v_sql         TEXT;
  v_result      JSONB;
BEGIN
  v_where       := _build_where(p_filters, p_logic);
  v_extra_where := _build_where(p_extra_filters, 'AND');

  IF v_where       != '' THEN v_all_cond := array_append(v_all_cond, v_where); END IF;
  IF v_extra_where != '' THEN v_all_cond := array_append(v_all_cond, v_extra_where); END IF;
  IF array_length(p_periodos, 1) > 0 THEN
    v_all_cond := array_append(v_all_cond,
      format('to_char(l.data_lancamento, ''YYYY-MM'') = ANY(%s)', quote_literal(p_periodos::TEXT)));
  END IF;

  IF p_group_dept THEN
    v_select := v_select || ARRAY['cc.departamento', 'cc.nome_departamento'];
    v_group  := v_group  || ARRAY['cc.departamento', 'cc.nome_departamento'];
  END IF;
  IF p_group_cc THEN
    v_select := v_select || ARRAY['l.centro_custo', 'cc.nome_centro_custo'];
    v_group  := v_group  || ARRAY['l.centro_custo', 'cc.nome_centro_custo'];
  END IF;
  IF p_group_period THEN
    v_select := array_append(v_select, 'to_char(l.data_lancamento, ''YYYY-MM'') AS periodo');
    v_group  := array_append(v_group,  'to_char(l.data_lancamento, ''YYYY-MM'')');
  END IF;

  v_sql := 'SELECT ' ||
    CASE WHEN array_length(v_select, 1) > 0 THEN array_to_string(v_select, ', ') || ', ' ELSE '' END ||
    'SUM(l.debito_credito) AS valor
    FROM lancamentos l
    LEFT JOIN centros_custo    cc ON l.centro_custo          = cc.centro_custo
    LEFT JOIN contas_contabeis ca ON l.numero_conta_contabil = ca.numero_conta_contabil
    WHERE ' || array_to_string(v_all_cond, ' AND ') ||
    CASE WHEN array_length(v_group, 1) > 0 THEN ' GROUP BY ' || array_to_string(v_group, ', ') ELSE '' END ||
    ' ORDER BY 1';

  EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || v_sql || ') t' INTO v_result;
  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;

-- ─── get_analise: análise comparativa por departamento/período ───────────────
CREATE OR REPLACE FUNCTION get_analise(
  p_filters       JSONB    DEFAULT '[]',
  p_departamentos TEXT[]   DEFAULT '{}',
  p_periodos      TEXT[]   DEFAULT '{}',
  p_group_by_cc   BOOLEAN  DEFAULT FALSE
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_where    TEXT;
  v_cond     TEXT[] := '{}';
  v_select   TEXT;
  v_group    TEXT;
  v_sql      TEXT;
  v_result   JSONB;
BEGIN
  v_where := _build_where(p_filters, 'AND');
  IF v_where != '' THEN v_cond := array_append(v_cond, v_where); END IF;

  IF array_length(p_departamentos, 1) > 0 THEN
    v_cond := array_append(v_cond,
      format('cc.nome_departamento = ANY(%s)', quote_literal(p_departamentos::TEXT)));
  END IF;
  IF array_length(p_periodos, 1) > 0 THEN
    v_cond := array_append(v_cond,
      format('to_char(l.data_lancamento, ''YYYY-MM'') = ANY(%s)', quote_literal(p_periodos::TEXT)));
  END IF;

  IF p_group_by_cc THEN
    v_select := 'cc.departamento, cc.nome_departamento, l.centro_custo, cc.nome_centro_custo,
      to_char(l.data_lancamento, ''YYYY-MM'') AS periodo,
      SUM(CASE WHEN l.tipo=''budget'' THEN l.debito_credito ELSE 0 END) AS budget,
      SUM(CASE WHEN l.tipo=''razao''  THEN l.debito_credito ELSE 0 END) AS razao';
    v_group := 'l.centro_custo, cc.nome_centro_custo, cc.departamento, cc.nome_departamento, to_char(l.data_lancamento, ''YYYY-MM'')';
  ELSE
    v_select := 'cc.departamento, cc.nome_departamento,
      to_char(l.data_lancamento, ''YYYY-MM'') AS periodo,
      SUM(CASE WHEN l.tipo=''budget'' THEN l.debito_credito ELSE 0 END) AS budget,
      SUM(CASE WHEN l.tipo=''razao''  THEN l.debito_credito ELSE 0 END) AS razao';
    v_group := 'cc.departamento, cc.nome_departamento, to_char(l.data_lancamento, ''YYYY-MM'')';
  END IF;

  v_sql := 'SELECT ' || v_select ||
    ' FROM lancamentos l
      LEFT JOIN centros_custo    cc ON l.centro_custo          = cc.centro_custo
      LEFT JOIN contas_contabeis ca ON l.numero_conta_contabil = ca.numero_conta_contabil' ||
    CASE WHEN array_length(v_cond, 1) > 0 THEN ' WHERE ' || array_to_string(v_cond, ' AND ') ELSE '' END ||
    ' GROUP BY ' || v_group ||
    ' ORDER BY ' || v_group;

  EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || v_sql || ') t' INTO v_result;
  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;

-- ─── get_summary: totalizadores do dashboard ─────────────────────────────────
CREATE OR REPLACE FUNCTION get_summary()
RETURNS JSONB LANGUAGE sql AS $$
  SELECT row_to_json(t)::JSONB FROM (
    SELECT
      COUNT(DISTINCT cc.departamento)                                       AS departamentos,
      COUNT(DISTINCT to_char(l.data_lancamento, 'YYYY-MM'))                 AS periodos,
      SUM(CASE WHEN l.tipo='budget' THEN l.debito_credito ELSE 0 END)       AS total_budget,
      SUM(CASE WHEN l.tipo='razao'  THEN l.debito_credito ELSE 0 END)       AS total_razao,
      COUNT(CASE WHEN l.tipo='budget' THEN 1 END)                           AS linhas_budget,
      COUNT(CASE WHEN l.tipo='razao'  THEN 1 END)                           AS linhas_razao,
      (SELECT COUNT(*) FROM centros_custo)                                  AS qtd_centros,
      (SELECT COUNT(*) FROM contas_contabeis)                               AS qtd_contas
    FROM lancamentos l
    LEFT JOIN centros_custo    cc ON l.centro_custo          = cc.centro_custo
    LEFT JOIN contas_contabeis ca ON l.numero_conta_contabil = ca.numero_conta_contabil
  ) t;
$$;

-- ─── get_dre: DRE agrupada por agrupamento_arvore e período ──────────────────
CREATE OR REPLACE FUNCTION get_dre(
  p_periodos      TEXT[]  DEFAULT '{}',
  p_departamentos TEXT[]  DEFAULT '{}',
  p_centros       TEXT[]  DEFAULT '{}'
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_cond   TEXT[] := '{}';
  v_sql    TEXT;
  v_result JSONB;
BEGIN
  IF array_length(p_periodos, 1)      > 0 THEN v_cond := array_append(v_cond, format('to_char(l.data_lancamento, ''YYYY-MM'') = ANY(%s)', quote_literal(p_periodos::TEXT))); END IF;
  IF array_length(p_departamentos, 1) > 0 THEN v_cond := array_append(v_cond, format('cc.nome_departamento = ANY(%s)', quote_literal(p_departamentos::TEXT))); END IF;
  IF array_length(p_centros, 1)       > 0 THEN v_cond := array_append(v_cond, format('l.centro_custo = ANY(%s)', quote_literal(p_centros::TEXT))); END IF;

  v_sql := 'SELECT
      COALESCE(ca.dre, ''Sem classificação'') AS dre,
      COALESCE(ca.agrupamento_arvore, '''') AS agrupamento_arvore,
      COALESCE(MIN(ca.ordem_dre), 999) AS ordem_dre,
      to_char(l.data_lancamento, ''YYYY-MM'') AS periodo,
      SUM(CASE WHEN l.tipo=''budget'' THEN l.debito_credito ELSE 0 END) AS budget,
      SUM(CASE WHEN l.tipo=''razao''  THEN l.debito_credito ELSE 0 END) AS razao
    FROM lancamentos l
    LEFT JOIN centros_custo    cc ON l.centro_custo          = cc.centro_custo
    LEFT JOIN contas_contabeis ca ON l.numero_conta_contabil = ca.numero_conta_contabil' ||
    CASE WHEN array_length(v_cond, 1) > 0 THEN ' WHERE ' || array_to_string(v_cond, ' AND ') ELSE '' END ||
    ' GROUP BY ca.dre, ca.agrupamento_arvore, to_char(l.data_lancamento, ''YYYY-MM'')
      ORDER BY COALESCE(MIN(ca.ordem_dre), 999), ca.dre, ca.agrupamento_arvore, to_char(l.data_lancamento, ''YYYY-MM'')';

  EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || v_sql || ') t' INTO v_result;
  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;

-- ─── get_dre_by_account: DRE por conta contábil ──────────────────────────────
CREATE OR REPLACE FUNCTION get_dre_by_account(
  p_periodos      TEXT[]  DEFAULT '{}',
  p_departamentos TEXT[]  DEFAULT '{}',
  p_centros       TEXT[]  DEFAULT '{}'
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_cond   TEXT[] := '{}';
  v_sql    TEXT;
  v_result JSONB;
BEGIN
  IF array_length(p_periodos, 1)      > 0 THEN v_cond := array_append(v_cond, format('to_char(l.data_lancamento, ''YYYY-MM'') = ANY(%s)', quote_literal(p_periodos::TEXT))); END IF;
  IF array_length(p_departamentos, 1) > 0 THEN v_cond := array_append(v_cond, format('cc.nome_departamento = ANY(%s)', quote_literal(p_departamentos::TEXT))); END IF;
  IF array_length(p_centros, 1)       > 0 THEN v_cond := array_append(v_cond, format('l.centro_custo = ANY(%s)', quote_literal(p_centros::TEXT))); END IF;

  v_sql := 'SELECT
      COALESCE(ca.dre, ''Sem classificação'') AS dre,
      COALESCE(ca.agrupamento_arvore, '''') AS agrupamento_arvore,
      l.numero_conta_contabil,
      MAX(COALESCE(ca.nome_conta_contabil, l.nome_conta_contabil, '''')) AS nome_conta_contabil,
      to_char(l.data_lancamento, ''YYYY-MM'') AS periodo,
      SUM(CASE WHEN l.tipo=''budget'' THEN l.debito_credito ELSE 0 END) AS budget,
      SUM(CASE WHEN l.tipo=''razao''  THEN l.debito_credito ELSE 0 END) AS razao
    FROM lancamentos l
    LEFT JOIN centros_custo    cc ON l.centro_custo          = cc.centro_custo
    LEFT JOIN contas_contabeis ca ON l.numero_conta_contabil = ca.numero_conta_contabil' ||
    CASE WHEN array_length(v_cond, 1) > 0 THEN ' WHERE ' || array_to_string(v_cond, ' AND ') ELSE '' END ||
    ' GROUP BY ca.dre, ca.agrupamento_arvore, l.numero_conta_contabil, to_char(l.data_lancamento, ''YYYY-MM'')
      ORDER BY ca.dre, ca.agrupamento_arvore, l.numero_conta_contabil, to_char(l.data_lancamento, ''YYYY-MM'')';

  EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || v_sql || ') t' INTO v_result;
  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;

-- ─── get_dre_detalhamento: lançamentos individuais para drill-down ────────────
CREATE OR REPLACE FUNCTION get_dre_detalhamento(
  p_dre           TEXT     DEFAULT NULL,
  p_agrupamento   TEXT     DEFAULT NULL,
  p_conta         TEXT     DEFAULT NULL,
  p_periodo       TEXT     DEFAULT NULL,
  p_tipo          TEXT     DEFAULT NULL,
  p_departamento  TEXT     DEFAULT NULL,
  p_periodos      TEXT[]   DEFAULT '{}',
  p_departamentos TEXT[]   DEFAULT '{}',
  p_centros       TEXT[]   DEFAULT '{}'
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_cond   TEXT[] := '{}';
  v_sql    TEXT;
  v_result JSONB;
BEGIN
  IF p_tipo          IS NOT NULL THEN v_cond := array_append(v_cond, format('l.tipo = %s', quote_literal(p_tipo))); END IF;
  IF p_dre           IS NOT NULL THEN v_cond := array_append(v_cond, format('ca.dre = %s', quote_literal(p_dre))); END IF;
  IF p_agrupamento   IS NOT NULL THEN v_cond := array_append(v_cond, format('ca.agrupamento_arvore = %s', quote_literal(p_agrupamento))); END IF;
  IF p_conta         IS NOT NULL THEN v_cond := array_append(v_cond, format('l.numero_conta_contabil = %s', quote_literal(p_conta))); END IF;
  IF p_periodo       IS NOT NULL THEN
    v_cond := array_append(v_cond, format('to_char(l.data_lancamento, ''YYYY-MM'') = %s', quote_literal(p_periodo)));
  ELSIF array_length(p_periodos, 1) > 0 THEN
    v_cond := array_append(v_cond, format('to_char(l.data_lancamento, ''YYYY-MM'') = ANY(%s)', quote_literal(p_periodos::TEXT)));
  END IF;
  IF array_length(p_departamentos, 1) > 0 THEN
    v_cond := array_append(v_cond, format('cc.nome_departamento = ANY(%s)', quote_literal(p_departamentos::TEXT)));
  ELSIF p_departamento IS NOT NULL THEN
    v_cond := array_append(v_cond, format('cc.nome_departamento = %s', quote_literal(p_departamento)));
  END IF;
  IF array_length(p_centros, 1) > 0 THEN
    v_cond := array_append(v_cond, format('l.centro_custo = ANY(%s)', quote_literal(p_centros::TEXT)));
  END IF;

  v_sql := 'SELECT l.id, l.tipo, l.data_lancamento, l.numero_conta_contabil,
      l.nome_conta_contabil, l.centro_custo, cc.nome_centro_custo,
      ca.agrupamento_arvore, ca.dre, l.nome_conta_contrapartida,
      l.debito_credito, l.observacao, l.fonte
    FROM lancamentos l
    LEFT JOIN centros_custo    cc ON l.centro_custo          = cc.centro_custo
    LEFT JOIN contas_contabeis ca ON l.numero_conta_contabil = ca.numero_conta_contabil' ||
    CASE WHEN array_length(v_cond, 1) > 0 THEN ' WHERE ' || array_to_string(v_cond, ' AND ') ELSE '' END ||
    ' ORDER BY l.data_lancamento, l.numero_conta_contabil
      LIMIT 50000';

  EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || v_sql || ') t' INTO v_result;
  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;

-- ─── get_distinct_values: valores únicos para autocomplete ───────────────────
CREATE OR REPLACE FUNCTION get_distinct_values(
  p_column TEXT,
  p_limit  INT DEFAULT 500
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_col    TEXT;
  v_sql    TEXT;
  v_result JSONB;
BEGIN
  v_col := _col_expr(p_column);
  v_sql := format(
    'SELECT DISTINCT %s AS val
     FROM lancamentos l
     LEFT JOIN centros_custo    cc ON l.centro_custo          = cc.centro_custo
     LEFT JOIN contas_contabeis ca ON l.numero_conta_contabil = ca.numero_conta_contabil
     WHERE %s IS NOT NULL AND %s != ''''
     ORDER BY val
     LIMIT %s', v_col, v_col, v_col, p_limit);

  EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || v_sql || ') t' INTO v_result;
  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;

-- ─── get_centros_by_departamentos: centros de custo de um departamento ────────
CREATE OR REPLACE FUNCTION get_centros_by_departamentos(
  p_departamentos TEXT[]
) RETURNS JSONB LANGUAGE sql AS $$
  SELECT jsonb_agg(row_to_json(t))
  FROM (
    SELECT DISTINCT l.centro_custo AS cc,
      COALESCE(cc2.nome_centro_custo, l.centro_custo) AS nome
    FROM lancamentos l
    LEFT JOIN centros_custo cc2 ON l.centro_custo = cc2.centro_custo
    WHERE cc2.nome_departamento = ANY(p_departamentos)
    ORDER BY nome
  ) t;
$$;

-- ─── get_dre_trend: série temporal para forecast ─────────────────────────────
CREATE OR REPLACE FUNCTION get_dre_trend(
  p_conta         TEXT    DEFAULT NULL,
  p_agrupamento   TEXT    DEFAULT NULL,
  p_dre           TEXT    DEFAULT NULL,
  p_departamentos TEXT[]  DEFAULT '{}'
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_cond   TEXT[] := '{}';
  v_sql    TEXT;
  v_result JSONB;
BEGIN
  IF p_conta       IS NOT NULL THEN v_cond := array_append(v_cond, format('l.numero_conta_contabil = %s', quote_literal(p_conta))); END IF;
  IF p_agrupamento IS NOT NULL THEN v_cond := array_append(v_cond, format('ca.agrupamento_arvore = %s', quote_literal(p_agrupamento))); END IF;
  IF p_dre         IS NOT NULL THEN v_cond := array_append(v_cond, format('ca.dre = %s', quote_literal(p_dre))); END IF;
  IF array_length(p_departamentos, 1) > 0 THEN
    v_cond := array_append(v_cond, format('cc.departamento = ANY(%s)', quote_literal(p_departamentos::TEXT)));
  END IF;

  v_sql := 'SELECT to_char(l.data_lancamento, ''YYYY-MM'') AS periodo, l.tipo,
      SUM(l.debito_credito) AS total
    FROM lancamentos l
    LEFT JOIN centros_custo    cc ON l.centro_custo          = cc.centro_custo
    LEFT JOIN contas_contabeis ca ON l.numero_conta_contabil = ca.numero_conta_contabil' ||
    CASE WHEN array_length(v_cond, 1) > 0 THEN ' WHERE ' || array_to_string(v_cond, ' AND ') ELSE '' END ||
    ' GROUP BY to_char(l.data_lancamento, ''YYYY-MM''), l.tipo
      ORDER BY to_char(l.data_lancamento, ''YYYY-MM'')';

  EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || v_sql || ') t' INTO v_result;
  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;

-- ─── get_capex: dados CAPEX agregados ────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_capex(
  p_departamentos TEXT[]  DEFAULT '{}',
  p_periodos      TEXT[]  DEFAULT '{}',
  p_projetos      TEXT[]  DEFAULT '{}',
  p_group_projeto BOOLEAN DEFAULT TRUE,
  p_group_centro  BOOLEAN DEFAULT FALSE
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_cond   TEXT[] := '{}';
  v_select TEXT[] := '{}';
  v_group  TEXT[] := '{}';
  v_sql    TEXT;
  v_result JSONB;
BEGIN
  IF array_length(p_departamentos, 1) > 0 THEN v_cond := array_append(v_cond, format('cc.nome_departamento = ANY(%s)', quote_literal(p_departamentos::TEXT))); END IF;
  IF array_length(p_periodos, 1)      > 0 THEN v_cond := array_append(v_cond, format('to_char(c.data_lancamento, ''YYYY-MM'') = ANY(%s)', quote_literal(p_periodos::TEXT))); END IF;
  IF array_length(p_projetos, 1)      > 0 THEN v_cond := array_append(v_cond, format('c.nome_projeto = ANY(%s)', quote_literal(p_projetos::TEXT))); END IF;

  IF p_group_projeto THEN
    v_select := v_select || ARRAY['c.nome_projeto'];
    v_group  := v_group  || ARRAY['c.nome_projeto'];
  END IF;
  IF p_group_centro THEN
    v_select := v_select || ARRAY['c.centro_custo', 'cc.nome_centro_custo'];
    v_group  := v_group  || ARRAY['c.centro_custo', 'cc.nome_centro_custo'];
  END IF;
  v_select := v_select || ARRAY['cc.departamento', 'cc.nome_departamento', 'to_char(c.data_lancamento, ''YYYY-MM'') AS periodo'];
  v_group  := v_group  || ARRAY['cc.departamento', 'cc.nome_departamento', 'to_char(c.data_lancamento, ''YYYY-MM'')'];

  v_sql := 'SELECT ' || array_to_string(v_select, ', ') ||
    ', SUM(CASE WHEN c.tipo=''budget'' THEN c.debito_credito ELSE 0 END) AS budget,
       SUM(CASE WHEN c.tipo=''razao''  THEN c.debito_credito ELSE 0 END) AS razao
    FROM capex c
    LEFT JOIN centros_custo    cc ON c.centro_custo          = cc.centro_custo
    LEFT JOIN contas_contabeis ca ON c.numero_conta_contabil = ca.numero_conta_contabil' ||
    CASE WHEN array_length(v_cond, 1) > 0 THEN ' WHERE ' || array_to_string(v_cond, ' AND ') ELSE '' END ||
    ' GROUP BY ' || array_to_string(v_group, ', ') ||
    ' ORDER BY ' || array_to_string(v_group, ', ');

  EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || v_sql || ') t' INTO v_result;
  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;

-- ─── get_capex_by_dept: resumo CAPEX por projeto para um departamento ─────────
CREATE OR REPLACE FUNCTION get_capex_by_dept(
  p_departamento TEXT,
  p_periodos     TEXT[] DEFAULT '{}'
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_cond   TEXT[] := ARRAY[format('cc.nome_departamento = %s', quote_literal(p_departamento))];
  v_sql    TEXT;
  v_result JSONB;
BEGIN
  IF array_length(p_periodos, 1) > 0 THEN
    v_cond := array_append(v_cond, format('to_char(c.data_lancamento, ''YYYY-MM'') = ANY(%s)', quote_literal(p_periodos::TEXT)));
  END IF;

  v_sql := 'SELECT c.nome_projeto,
      SUM(CASE WHEN c.tipo=''budget'' THEN c.debito_credito ELSE 0 END) AS budget,
      SUM(CASE WHEN c.tipo=''razao''  THEN c.debito_credito ELSE 0 END) AS razao
    FROM capex c
    LEFT JOIN centros_custo cc ON c.centro_custo = cc.centro_custo
    WHERE ' || array_to_string(v_cond, ' AND ') ||
    ' GROUP BY c.nome_projeto
      ORDER BY c.nome_projeto';

  EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || v_sql || ') t' INTO v_result;
  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;

-- ─── get_plano_contas_valores: valores do plano de contas ────────────────────
CREATE OR REPLACE FUNCTION get_plano_contas_valores(
  p_tipo          TEXT    DEFAULT 'ambos',
  p_periodos      TEXT[]  DEFAULT '{}',
  p_departamentos TEXT[]  DEFAULT '{}'
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_cond   TEXT[] := '{}';
  v_sql    TEXT;
  v_result JSONB;
BEGIN
  IF p_tipo != 'ambos' THEN v_cond := array_append(v_cond, format('l.tipo = %s', quote_literal(p_tipo))); END IF;
  IF array_length(p_periodos, 1)      > 0 THEN v_cond := array_append(v_cond, format('to_char(l.data_lancamento, ''YYYY-MM'') = ANY(%s)', quote_literal(p_periodos::TEXT))); END IF;
  IF array_length(p_departamentos, 1) > 0 THEN v_cond := array_append(v_cond, format('cc.nome_departamento = ANY(%s)', quote_literal(p_departamentos::TEXT))); END IF;

  v_sql := 'SELECT ca.numero_conta_contabil, ca.nome_conta_contabil, ca.nivel,
      SUM(CASE WHEN l.tipo=''budget'' THEN l.debito_credito ELSE 0 END) AS budget,
      SUM(CASE WHEN l.tipo=''razao''  THEN l.debito_credito ELSE 0 END) AS razao
    FROM contas_contabeis ca
    LEFT JOIN lancamentos l ON l.numero_conta_contabil = ca.numero_conta_contabil' ||
    CASE WHEN array_length(v_cond, 1) > 0 THEN
      ' LEFT JOIN centros_custo cc ON l.centro_custo = cc.centro_custo WHERE ' || array_to_string(v_cond, ' AND ')
    ELSE '' END ||
    ' GROUP BY ca.numero_conta_contabil, ca.nome_conta_contabil, ca.nivel
      ORDER BY ca.numero_conta_contabil';

  EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || v_sql || ') t' INTO v_result;
  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;

-- ─── get_lancamentos_paged: lançamentos paginados com joins ──────────────────
CREATE OR REPLACE FUNCTION get_lancamentos_paged(
  p_tipo         TEXT    DEFAULT NULL,
  p_departamento TEXT    DEFAULT NULL,
  p_periodo      TEXT    DEFAULT NULL,
  p_ano          TEXT    DEFAULT NULL,
  p_q            TEXT    DEFAULT NULL,
  p_page         INT     DEFAULT 1,
  p_page_size    INT     DEFAULT 100
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_cond   TEXT[] := '{}';
  v_offset INT    := (p_page - 1) * p_page_size;
  v_sql    TEXT;
  v_total  BIGINT;
  v_rows   JSONB;
BEGIN
  IF p_tipo         IS NOT NULL THEN v_cond := array_append(v_cond, format('l.tipo = %s', quote_literal(p_tipo))); END IF;
  IF p_departamento IS NOT NULL THEN v_cond := array_append(v_cond, format('cc.nome_departamento = %s', quote_literal(p_departamento))); END IF;
  IF p_periodo      IS NOT NULL THEN v_cond := array_append(v_cond, format('to_char(l.data_lancamento, ''YYYY-MM'') = %s', quote_literal(p_periodo))); END IF;
  IF p_ano          IS NOT NULL THEN v_cond := array_append(v_cond, format('EXTRACT(YEAR FROM l.data_lancamento)::TEXT = %s', quote_literal(p_ano))); END IF;
  IF p_q            IS NOT NULL THEN
    v_cond := array_append(v_cond, format(
      '(LOWER(l.numero_conta_contabil) LIKE LOWER(%s) OR LOWER(l.nome_conta_contabil) LIKE LOWER(%s) OR LOWER(l.centro_custo) LIKE LOWER(%s))',
      quote_literal('%' || p_q || '%'), quote_literal('%' || p_q || '%'), quote_literal('%' || p_q || '%')));
  END IF;

  v_sql := 'FROM lancamentos l
    LEFT JOIN centros_custo    cc ON l.centro_custo          = cc.centro_custo
    LEFT JOIN contas_contabeis ca ON l.numero_conta_contabil = ca.numero_conta_contabil' ||
    CASE WHEN array_length(v_cond, 1) > 0 THEN ' WHERE ' || array_to_string(v_cond, ' AND ') ELSE '' END;

  EXECUTE 'SELECT COUNT(*) ' || v_sql INTO v_total;
  EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (
    SELECT l.id, l.tipo, l.data_lancamento, l.numero_conta_contabil, l.nome_conta_contabil,
      l.centro_custo, cc.nome_centro_custo, cc.nome_departamento,
      l.nome_conta_contrapartida, l.debito_credito, l.fonte, l.observacao, l.created_at
    ' || v_sql || ' ORDER BY l.data_lancamento DESC, l.id DESC
    LIMIT ' || p_page_size || ' OFFSET ' || v_offset || ') t' INTO v_rows;

  RETURN jsonb_build_object('rows', COALESCE(v_rows, '[]'::JSONB), 'total', v_total);
END;
$$;

-- ─── get_unidades_distintas: lista de unidades únicas presentes nos lançamentos ─
CREATE OR REPLACE FUNCTION get_unidades_distintas()
RETURNS JSONB LANGUAGE sql AS $$
  SELECT COALESCE(jsonb_agg(unidade ORDER BY unidade), '[]'::JSONB)
  FROM (
    SELECT DISTINCT COALESCE(cc.nome_departamento, 'Sem Unidade') AS unidade
    FROM lancamentos l
    LEFT JOIN centros_custo cc ON l.centro_custo = cc.centro_custo
  ) t;
$$;

-- ─── get_por_unidade: dados Budget vs Razão hierárquicos por unidade de negócio ─
-- Retorna linhas no nível conta, agrupadas por unidade → DRE → agrupamento → conta
-- O frontend agrega em qualquer nível da árvore
CREATE OR REPLACE FUNCTION get_por_unidade(
  p_periodos TEXT[] DEFAULT '{}',
  p_unidades TEXT[] DEFAULT '{}'
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_cond   TEXT[] := '{}';
  v_sql    TEXT;
  v_result JSONB;
BEGIN
  IF array_length(p_periodos, 1) > 0 THEN
    v_cond := array_append(v_cond,
      format('to_char(l.data_lancamento, ''YYYY-MM'') = ANY(%s)', quote_literal(p_periodos::TEXT)));
  END IF;
  IF array_length(p_unidades, 1) > 0 THEN
    v_cond := array_append(v_cond,
      format('COALESCE(cc.nome_departamento, ''Sem Unidade'') = ANY(%s)', quote_literal(p_unidades::TEXT)));
  END IF;

  v_sql :=
    'SELECT
      COALESCE(cc.nome_departamento, ''Sem Unidade'') AS unidade,
      COALESCE(ca.dre, ''Sem classificação'') AS dre,
      COALESCE(ca.agrupamento_arvore, '''') AS agrupamento,
      l.numero_conta_contabil AS conta,
      MAX(COALESCE(ca.nome_conta_contabil, l.nome_conta_contabil, l.numero_conta_contabil, '''')) AS nome_conta,
      COALESCE(MIN(ca.ordem_dre), 999) AS ordem_dre,
      SUM(CASE WHEN l.tipo=''budget'' THEN l.debito_credito ELSE 0 END) AS budget,
      SUM(CASE WHEN l.tipo=''razao''  THEN l.debito_credito ELSE 0 END) AS razao
    FROM lancamentos l
    LEFT JOIN centros_custo    cc ON l.centro_custo          = cc.centro_custo
    LEFT JOIN contas_contabeis ca ON l.numero_conta_contabil = ca.numero_conta_contabil' ||
    CASE WHEN array_length(v_cond, 1) > 0
      THEN ' WHERE ' || array_to_string(v_cond, ' AND ')
      ELSE ''
    END ||
    ' GROUP BY
        COALESCE(cc.nome_departamento, ''Sem Unidade''),
        COALESCE(ca.dre, ''Sem classificação''),
        COALESCE(ca.agrupamento_arvore, ''''),
        l.numero_conta_contabil
      ORDER BY
        COALESCE(cc.nome_departamento, ''Sem Unidade''),
        COALESCE(MIN(ca.ordem_dre), 999),
        COALESCE(ca.dre, ''Sem classificação''),
        COALESCE(ca.agrupamento_arvore, ''''),
        l.numero_conta_contabil';

  EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || v_sql || ') t' INTO v_result;
  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;
