import { getDb } from './db';
import type { FilterCondition, MetricResult, Metric } from './types';

function buildFilterSQL(filters: FilterCondition[]): { where: string; params: (string | number)[] } {
  if (!filters || filters.length === 0) return { where: '', params: [] };

  const parts: string[] = [];
  const params: (string | number)[] = [];

  for (const f of filters) {
    const col = f.column === 'grp' ? 'grp' : f.column;
    switch (f.operator) {
      case '=':
        parts.push(`LOWER(${col}) = LOWER(?)`);
        params.push(f.value);
        break;
      case '!=':
        parts.push(`LOWER(${col}) != LOWER(?)`);
        params.push(f.value);
        break;
      case 'contains':
        parts.push(`LOWER(${col}) LIKE LOWER(?)`);
        params.push(`%${f.value}%`);
        break;
      case 'not_contains':
        parts.push(`LOWER(${col}) NOT LIKE LOWER(?)`);
        params.push(`%${f.value}%`);
        break;
      case 'starts_with':
        parts.push(`LOWER(${col}) LIKE LOWER(?)`);
        params.push(`${f.value}%`);
        break;
      case 'in': {
        const vals = f.value.split(',').map(v => v.trim()).filter(Boolean);
        parts.push(`LOWER(${col}) IN (${vals.map(() => 'LOWER(?)').join(',')})`);
        params.push(...vals);
        break;
      }
    }
  }

  return { where: parts.join(' AND '), params };
}

export function getMetricResults(
  datasetId: number,
  metricId: number,
  groupByDept = true,
  groupByPeriod = true
): MetricResult[] {
  const db = getDb();

  const metric = db.prepare('SELECT * FROM metrics WHERE id = ?').get(metricId) as {
    id: number; name: string; description: string; color: string;
    filters: string; dataset_id: number; created_at: string; updated_at: string;
  } | undefined;

  if (!metric) return [];

  const filters: FilterCondition[] = JSON.parse(metric.filters || '[]');
  const { where, params } = buildFilterSQL(filters);

  const groupCols: string[] = [];
  const selectCols: string[] = [];
  if (groupByDept) { groupCols.push('department'); selectCols.push('department'); }
  if (groupByPeriod) { groupCols.push('period'); selectCols.push('period'); }

  const whereClause = where ? `AND ${where}` : '';
  const groupClause = groupCols.length ? `GROUP BY ${groupCols.join(', ')}` : '';
  const selectClause = selectCols.length ? `${selectCols.join(', ')},` : '';

  const sql = `
    SELECT
      ${selectClause}
      SUM(budget) as budget,
      SUM(actual) as actual,
      SUM(actual) - SUM(budget) as variance
    FROM data_rows
    WHERE dataset_id = ?
    ${whereClause}
    ${groupClause}
    ORDER BY ${selectCols.length ? selectCols.join(', ') : '1'}
  `;

  const rows = db.prepare(sql).all(datasetId, ...params) as Array<{
    department?: string; period?: string; budget: number; actual: number; variance: number;
  }>;

  return rows.map(r => ({
    metric: {
      id: metric.id,
      name: metric.name,
      description: metric.description,
      color: metric.color,
      filters,
      dataset_id: metric.dataset_id,
      created_at: metric.created_at,
      updated_at: metric.updated_at,
    } as Metric,
    department: r.department ?? 'Total',
    period: r.period ?? 'All',
    budget: r.budget ?? 0,
    actual: r.actual ?? 0,
    variance: r.variance ?? 0,
    variance_pct: r.budget ? ((r.actual - r.budget) / Math.abs(r.budget)) * 100 : 0,
  }));
}

export function getDistinctValues(datasetId: number, col: 'department' | 'grp' | 'account' | 'period'): string[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT DISTINCT ${col} FROM data_rows WHERE dataset_id = ? AND ${col} IS NOT NULL AND ${col} != '' ORDER BY ${col}`
  ).all(datasetId) as Array<Record<string, string>>;
  return rows.map(r => r[col]).filter(Boolean);
}

export function getComparisonData(
  datasetId: number,
  filters: FilterCondition[],
  departments?: string[],
  periods?: string[]
) {
  const db = getDb();
  const conditions: string[] = [`dataset_id = ?`];
  const params: (string | number)[] = [datasetId];

  const { where, params: filterParams } = buildFilterSQL(filters);
  if (where) { conditions.push(where); params.push(...filterParams); }

  if (departments?.length) {
    conditions.push(`department IN (${departments.map(() => '?').join(',')})`);
    params.push(...departments);
  }
  if (periods?.length) {
    conditions.push(`period IN (${periods.map(() => '?').join(',')})`);
    params.push(...periods);
  }

  const sql = `
    SELECT
      department,
      period,
      SUM(budget) as budget,
      SUM(actual) as actual,
      SUM(actual) - SUM(budget) as variance
    FROM data_rows
    WHERE ${conditions.join(' AND ')}
    GROUP BY department, period
    ORDER BY department, period
  `;

  const rows = db.prepare(sql).all(...params) as Array<{
    department: string; period: string; budget: number; actual: number; variance: number;
  }>;

  return rows.map(r => ({
    ...r,
    budget: r.budget ?? 0,
    actual: r.actual ?? 0,
    variance: r.variance ?? 0,
    variance_pct: r.budget ? ((r.actual - r.budget) / Math.abs(r.budget)) * 100 : 0,
  }));
}
