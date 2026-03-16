import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    const datasets = db.prepare('SELECT * FROM datasets ORDER BY created_at DESC').all() as Array<{
      id: number; name: string; filename: string; columns: string;
      column_mapping: string; row_count: number; created_at: string;
    }>;

    const active = db.prepare('SELECT dataset_id FROM active_dataset WHERE id = 1').get() as { dataset_id: number | null };

    return NextResponse.json({
      datasets: datasets.map(d => ({
        ...d,
        columns: JSON.parse(d.columns),
        column_mapping: JSON.parse(d.column_mapping),
      })),
      activeId: active?.dataset_id ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { datasetId } = await req.json();
    const db = getDb();
    db.prepare('UPDATE active_dataset SET dataset_id = ? WHERE id = 1').run(datasetId);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const db = getDb();
    db.prepare('DELETE FROM datasets WHERE id = ?').run(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
