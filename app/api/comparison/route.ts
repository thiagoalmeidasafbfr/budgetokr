import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getComparisonData, getMetricResults, getDistinctValues } from '@/lib/query';
import type { FilterCondition } from '@/lib/types';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const datasetId = parseInt(searchParams.get('datasetId') ?? '0');
    const metricId = searchParams.get('metricId');
    const type = searchParams.get('type') ?? 'comparison';

    if (!datasetId) return NextResponse.json({ error: 'datasetId required' }, { status: 400 });

    if (type === 'distinct') {
      const col = searchParams.get('col') as 'department' | 'grp' | 'account' | 'period';
      const values = getDistinctValues(datasetId, col);
      return NextResponse.json(values);
    }

    if (type === 'metric' && metricId) {
      const results = getMetricResults(datasetId, parseInt(metricId));
      return NextResponse.json(results);
    }

    if (type === 'summary') {
      const db = getDb();
      const summary = db.prepare(`
        SELECT
          COUNT(DISTINCT department) as departments,
          COUNT(DISTINCT period) as periods,
          SUM(budget) as total_budget,
          SUM(actual) as total_actual,
          SUM(actual) - SUM(budget) as total_variance,
          COUNT(*) as total_rows
        FROM data_rows WHERE dataset_id = ?
      `).get(datasetId) as {
        departments: number; periods: number; total_budget: number;
        total_actual: number; total_variance: number; total_rows: number;
      };
      return NextResponse.json(summary);
    }

    // Default: full comparison
    const departments = searchParams.get('departments')?.split(',').filter(Boolean);
    const periods = searchParams.get('periods')?.split(',').filter(Boolean);
    const filtersRaw = searchParams.get('filters');
    const filters: FilterCondition[] = filtersRaw ? JSON.parse(filtersRaw) : [];

    const data = getComparisonData(datasetId, filters, departments, periods);
    return NextResponse.json(data);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
