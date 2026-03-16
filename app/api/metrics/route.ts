import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    const metrics = db.prepare('SELECT * FROM metrics ORDER BY created_at DESC').all() as Array<{
      id: number; name: string; description: string; color: string;
      filters: string; dataset_id: number; created_at: string; updated_at: string;
    }>;

    return NextResponse.json(metrics.map(m => ({
      ...m,
      filters: JSON.parse(m.filters || '[]'),
    })));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, color, filters, dataset_id } = body;

    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });

    const db = getDb();
    const result = db.prepare(`
      INSERT INTO metrics (name, description, color, filters, dataset_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, description ?? '', color ?? '#6366f1', JSON.stringify(filters ?? []), dataset_id ?? null);

    const metric = db.prepare('SELECT * FROM metrics WHERE id = ?').get(result.lastInsertRowid) as {
      id: number; name: string; description: string; color: string;
      filters: string; dataset_id: number; created_at: string; updated_at: string;
    };
    return NextResponse.json({ ...metric, filters: JSON.parse(metric.filters) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, description, color, filters, dataset_id } = body;

    const db = getDb();
    db.prepare(`
      UPDATE metrics SET name=?, description=?, color=?, filters=?, dataset_id=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(name, description ?? '', color ?? '#6366f1', JSON.stringify(filters ?? []), dataset_id ?? null, id);

    const metric = db.prepare('SELECT * FROM metrics WHERE id = ?').get(id) as {
      id: number; name: string; description: string; color: string;
      filters: string; dataset_id: number; created_at: string; updated_at: string;
    };
    return NextResponse.json({ ...metric, filters: JSON.parse(metric.filters) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const db = getDb();
    db.prepare('DELETE FROM metrics WHERE id = ?').run(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
