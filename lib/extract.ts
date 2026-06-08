/**
 * Text extraction from uploaded files.
 * Falls back gracefully — extraction failure never blocks upload.
 */

export async function extractText(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<string> {
  try {
    // Plain text types
    if (
      mimeType.startsWith('text/') ||
      filename.endsWith('.txt') ||
      filename.endsWith('.csv') ||
      filename.endsWith('.html') ||
      filename.endsWith('.htm')
    ) {
      return buffer.toString('utf-8').slice(0, 50000);
    }

    // JSON
    if (mimeType === 'application/json') {
      return buffer.toString('utf-8').slice(0, 50000);
    }

    // PDF — extract raw text from stream (no native deps required)
    if (mimeType === 'application/pdf' || filename.endsWith('.pdf')) {
      return extractPdfText(buffer);
    }

    return '';
  } catch {
    return '';
  }
}

function extractPdfText(buffer: Buffer): string {
  try {
    const raw = buffer.toString('latin1');
    const matches: string[] = [];
    // Extract text between BT and ET markers
    const btEt = /BT\s*([\s\S]*?)\s*ET/g;
    let m: RegExpExecArray | null;
    while ((m = btEt.exec(raw)) !== null) {
      // Extract strings from Tj, TJ, ' operators
      const strMatches = m[1].matchAll(/\(([^)]*)\)/g);
      for (const sm of strMatches) {
        const t = sm[1].replace(/\\(\d{3})/g, (_, oct) =>
          String.fromCharCode(parseInt(oct, 8))
        ).replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\/g, '');
        if (t.trim()) matches.push(t.trim());
      }
    }
    return matches.join(' ').replace(/\s+/g, ' ').slice(0, 50000);
  } catch {
    return '';
  }
}
