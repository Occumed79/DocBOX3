import { query } from '@/db/client';

export interface SearchResult {
  id: string;
  name: string;
  original_name: string;
  file_type: string;
  mime_type: string;
  size_bytes: number;
  storage_url: string;
  folder_id: string | null;
  folder_name: string | null;
  notes: string;
  tags: string[];
  upload_date: string;
  is_archived: boolean;
  headline: string;
  rank: number;
}

export async function searchVault(q: string): Promise<SearchResult[]> {
  if (!q.trim()) return [];

  // Tokenize query for tsquery (handle plain English)
  const words = q.trim()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1)
    .map(w => w.toLowerCase());

  if (!words.length) return [];

  // Build tsquery: all words with prefix matching and OR fallback
  const tsquery = words.map(w => `${w}:*`).join(' & ');
  const tsqueryOr = words.map(w => `${w}:*`).join(' | ');

  const rows = await query(`
    SELECT
      f.id, f.name, f.original_name, f.file_type, f.mime_type,
      f.size_bytes, f.storage_url, f.folder_id,
      fo.name AS folder_name,
      f.notes, f.tags, f.upload_date, f.is_archived,
      ts_headline('english',
        coalesce(f.extracted_text,'') || ' ' || coalesce(f.notes,''),
        websearch_to_tsquery('english', $3),
        'MaxFragments=2,MaxWords=15,MinWords=4,StartSel=<mark>,StopSel=</mark>'
      ) AS headline,
      ts_rank_cd(
        to_tsvector('english',
          coalesce(f.name,'') || ' ' ||
          coalesce(f.original_name,'') || ' ' ||
          coalesce(f.extracted_text,'') || ' ' ||
          coalesce(f.notes,'') || ' ' ||
          array_to_string(f.tags, ' ')
        ),
        to_tsquery('english', $1)
      ) AS rank
    FROM sv_files f
    LEFT JOIN sv_folders fo ON fo.id = f.folder_id
    WHERE f.is_archived = FALSE
      AND (
        to_tsvector('english',
          coalesce(f.name,'') || ' ' ||
          coalesce(f.original_name,'') || ' ' ||
          coalesce(f.extracted_text,'') || ' ' ||
          coalesce(f.notes,'') || ' ' ||
          array_to_string(f.tags, ' ')
        ) @@ to_tsquery('english', $1)
        OR
        to_tsvector('english',
          coalesce(f.name,'') || ' ' ||
          coalesce(f.original_name,'') || ' ' ||
          coalesce(f.extracted_text,'') || ' ' ||
          coalesce(f.notes,'') || ' ' ||
          array_to_string(f.tags, ' ')
        ) @@ to_tsquery('english', $2)
        OR lower(f.name) LIKE $4
        OR lower(f.original_name) LIKE $4
      )
    ORDER BY rank DESC
    LIMIT 40
  `, [tsquery, tsqueryOr, q, `%${q.toLowerCase()}%`]);

  return rows as SearchResult[];
}
