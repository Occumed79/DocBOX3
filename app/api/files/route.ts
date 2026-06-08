import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/db/client';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const folderId = searchParams.get('folder_id');
  const archived = searchParams.get('archived') === 'true';

  let sql = `
    SELECT f.*, fo.name AS folder_name
    FROM sv_files f
    LEFT JOIN sv_folders fo ON fo.id = f.folder_id
    WHERE f.is_archived = $1
  `;
  const params: any[] = [archived];

  if (folderId === 'null' || folderId === 'root') {
    sql += ` AND f.folder_id IS NULL`;
  } else if (folderId) {
    sql += ` AND f.folder_id = $2`;
    params.push(folderId);
  }

  sql += ` ORDER BY f.upload_date DESC`;
  const rows = await query(sql, params);
  return NextResponse.json(rows);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, name, notes, tags, folder_id, is_archived } = body;
  const rows = await query(
    `UPDATE sv_files SET
      name=COALESCE($2,name),
      notes=COALESCE($3,notes),
      tags=COALESCE($4,tags),
      folder_id=CASE WHEN $5::text IS NOT NULL THEN $5::uuid ELSE folder_id END,
      is_archived=COALESCE($6,is_archived),
      updated_at=NOW()
     WHERE id=$1 RETURNING *`,
    [id, name, notes, tags ? `{${tags.map((t: string) => `"${t}"`).join(',')}}` : null, folder_id ?? null, is_archived ?? null]
  );
  return NextResponse.json(rows[0]);
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await query(`DELETE FROM sv_files WHERE id=$1`, [id]);
  return NextResponse.json({ ok: true });
}
