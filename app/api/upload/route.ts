import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getDb } from '@/lib/db';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const name = formData.get('name') as string;
    const mappingRaw = formData.get('mapping') as string;

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const workbook = XLSX.read(bytes, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];

    if (raw.length === 0) return NextResponse.json({ error: 'Empty file' }, { status: 400 });

    const columns = Object.keys(raw[0]);

    // If no mapping provided, return columns for mapping step
    if (!mappingRaw) {
      // Return sample rows for mapping UI
      const sample = raw.slice(0, 5);
      return NextResponse.json({ columns, sample, total: raw.length });
    }

    const mapping: Record<string, string> = JSON.parse(mappingRaw);

    const db = getDb();

    // Insert dataset
    const datasetStmt = db.prepare(`
      INSERT INTO datasets (name, filename, columns, column_mapping, row_count)
      VALUES (?, ?, ?, ?, ?)
    `);
    const datasetResult = datasetStmt.run(
      name || file.name,
      file.name,
      JSON.stringify(columns),
      JSON.stringify(mapping),
      raw.length
    );
    const datasetId = datasetResult.lastInsertRowid as number;

    // Batch insert rows
    const insertRow = db.prepare(`
      INSERT INTO data_rows (dataset_id, department, grp, account, period, budget, actual, extra)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((rows: Record<string, unknown>[]) => {
      for (const row of rows) {
        const extra: Record<string, unknown> = {};
        const mappedCols = new Set(Object.values(mapping));

        for (const col of columns) {
          if (!mappedCols.has(col)) extra[col] = row[col];
        }

        const getRaw = (key: string) => (mapping[key] ? row[mapping[key]] : null);

        const budget = parseFloat(String(getRaw('budget') ?? '0').replace(/[^0-9.-]/g, '')) || 0;
        const actual = parseFloat(String(getRaw('actual') ?? '0').replace(/[^0-9.-]/g, '')) || 0;

        // Format period
        let period = String(getRaw('period') ?? '');
        const rawPeriod = getRaw('period');
        if (rawPeriod !== null && typeof rawPeriod === 'object' && 'toISOString' in (rawPeriod as object)) {
          period = (rawPeriod as Date).toISOString().substring(0, 7);
        }

        insertRow.run(
          datasetId,
          String(getRaw('department') ?? ''),
          String(getRaw('grp') ?? ''),
          String(getRaw('account') ?? ''),
          period,
          budget,
          actual,
          JSON.stringify(extra)
        );
      }
    });

    insertMany(raw);

    // Set as active dataset
    db.prepare('UPDATE active_dataset SET dataset_id = ? WHERE id = 1').run(datasetId);

    return NextResponse.json({ success: true, datasetId, rowCount: raw.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
