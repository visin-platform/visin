import { BadRequestError } from '@visin/backend-core';

export interface ManifestRow {
  stem: string;
  stratum?: string;
}

/** `frames/0001.jpg` → `0001`; `0001.ids.png` → `0001`; `0001.masks.json` → `0001`. */
export const toStem = (filenameOrPath: string): string => {
  const base = filenameOrPath.split('/').pop() || '';
  return base.replace(/\.(ids|masks)(\.[^.]+)$/, '').replace(/\.[^.]+$/, '');
};

/**
 * Parse a selection manifest. CSV: header row with `filename` (+ optional `stratum`)
 * columns. JSONL: one `{"filename": ..., "stratum"?: ...}` object per line.
 * Filenames may be bare basenames or bundle paths — both reduce to the stem.
 */
export const parseManifest = (content: string, format: 'csv' | 'jsonl'): ManifestRow[] => {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new BadRequestError('Manifest is empty');
  }

  if (format === 'jsonl') {
    return lines.map((line, i) => {
      let row: { filename?: unknown; stratum?: unknown };
      try {
        row = JSON.parse(line);
      } catch {
        throw new BadRequestError(`Manifest line ${i + 1} is not valid JSON`);
      }
      if (typeof row.filename !== 'string' || !row.filename) {
        throw new BadRequestError(`Manifest line ${i + 1} is missing "filename"`);
      }
      return { stem: toStem(row.filename), ...(row.stratum != null ? { stratum: String(row.stratum) } : {}) };
    });
  }

  const header = lines[0].split(',').map((column) => column.trim().toLowerCase());
  const filenameIdx = header.indexOf('filename');
  if (filenameIdx === -1) {
    throw new BadRequestError('Manifest CSV needs a "filename" header column');
  }
  const stratumIdx = header.indexOf('stratum');

  return lines.slice(1).map((line, i) => {
    const cells = line.split(',').map((cell) => cell.trim());
    const filename = cells[filenameIdx];
    if (!filename) {
      throw new BadRequestError(`Manifest CSV row ${i + 2} is missing "filename"`);
    }
    const stratum = stratumIdx === -1 ? undefined : cells[stratumIdx];
    return { stem: toStem(filename), ...(stratum ? { stratum } : {}) };
  });
};
