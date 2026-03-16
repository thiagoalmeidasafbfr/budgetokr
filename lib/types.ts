export interface Dataset {
  id: number;
  name: string;
  filename: string;
  columns: string[];
  column_mapping: ColumnMapping;
  row_count: number;
  created_at: string;
}

export interface ColumnMapping {
  department?: string;
  grp?: string;       // "group" is reserved in JS
  account?: string;
  period?: string;
  budget?: string;
  actual?: string;
  [key: string]: string | undefined;
}

export type FilterOperator = '=' | '!=' | 'contains' | 'not_contains' | 'starts_with' | 'in';

export interface FilterCondition {
  column: 'department' | 'grp' | 'account' | 'period';
  operator: FilterOperator;
  value: string;
}

export interface Metric {
  id: number;
  name: string;
  description?: string;
  color: string;
  filters: FilterCondition[];
  dataset_id?: number;
  created_at: string;
  updated_at: string;
}

export interface ComparisonRow {
  department: string;
  period: string;
  budget: number;
  actual: number;
  variance: number;
  variance_pct: number;
}

export interface MetricResult {
  metric: Metric;
  department: string;
  period: string;
  budget: number;
  actual: number;
  variance: number;
  variance_pct: number;
}
