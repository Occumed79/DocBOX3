import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/db/client';

export const runtime = 'nodejs';

function databaseError(error: unknown, fallback: string) {
  console.error(fallback, error);
  const detail = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: detail }, { status: 500 });
}

export async function GET() {
  try {
    const rows = await query(`
      SELECT f.*, 
        (SELECT COUNT(*) FROM sv_files fi WHERE fi.folder_id = f.id AND fi.is_archived = FALSE) AS file_count
      FROM sv_folders f
      ORDER BY f.parent_id NULLS FIRST, f.name ASC
    `);
    return NextResponse.json(rows);
  } catch (error) {
    return databaseError(error, 'Could not load folders.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, parent_id, color } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

    const rows = await query(
      `INSERT INTO sv_folders (name, parent_id, color) VALUES ($1, $2, $3) RETURNING *`,
      [name.trim(), parent_id || null, color || '#3b82f6']
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (error) {
    return databaseError(error, 'Could not create the folder.');
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, name, color, parent_id } = await req.json();
    const rows = await query(
      `UPDATE sv_folders SET name=COALESCE($2,name), color=COALESCE($3,color), parent_id=COALESCE($4,parent_id), updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [id, name, color, parent_id]
    );
    return NextResponse.json(rows[0]);
  } catch (error) {
    return databaseError(error, 'Could not update the folder.');
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    await query(`DELETE FROM sv_folders WHERE id=$1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return databaseError(error, 'Could not delete the folder.');
  }
}
