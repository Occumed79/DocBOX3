import { NextRequest, NextResponse } from 'next/server';
import { searchVault } from '@/lib/search';

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  if (!q.trim()) return NextResponse.json([]);
  try {
    const results = await searchVault(q);
    return NextResponse.json(results);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
