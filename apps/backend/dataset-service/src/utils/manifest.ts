import type { ManifestRow } from '../models/Dataset';
import { stemAndVariant } from './zipPaths';

const FILENAME_COLUMNS = ['filename', 'file', 'path', 'stem'];

const stemOf = (value: string): string => stemAndVariant(value).stem;

const toAttributes = (row: Record<string, unknown>, filenameKey: string): Record<string, string> =>
  Object.fromEntries(
    Object.entries(row)
      .filter(([key, value]) => key !== filenameKey && value !== null && value !== undefined && typeof value !== 'object')
      .map(([key, value]) => [key, String(value)])
  );

/** Split one CSV line, honouring double-quoted cells with `""` escapes. */
export const splitCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
};

/**
 * Rows of a manifest CSV (header row) or JSONL (one object per line), keyed by
 * the stem of their `filename` / `file` / `path` / `stem` column. Every other
 * scalar column becomes an attribute — a label job's `stratum` is one.
 */
export const parseManifest = (content: string, format: 'csv' | 'jsonl'): ManifestRow[] => {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) throw new Error('Manifest is empty');

  if (format === 'jsonl') {
    return lines.map((line, index) => {
      let row: unknown;
      try {
        row = JSON.parse(line);
      } catch {
        throw new Error(`Manifest line ${index + 1} is not valid JSON`);
      }
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        throw new Error(`Manifest line ${index + 1} is not an object`);
      }
      const record = row as Record<string, unknown>;
      const key = FILENAME_COLUMNS.find((column) => typeof record[column] === 'string' && record[column]);
      if (!key) throw new Error(`Manifest line ${index + 1} names no file (${FILENAME_COLUMNS.join(' / ')})`);
      return { stem: stemOf(record[key] as string), attributes: toAttributes(record, key) };
    });
  }

  const header = splitCsvLine(lines[0]).map((column) => column.toLowerCase());
  const key = FILENAME_COLUMNS.find((column) => header.includes(column));
  if (!key) throw new Error(`Manifest CSV needs a ${FILENAME_COLUMNS.join(' / ')} header column`);
  const keyIndex = header.indexOf(key);

  return lines.slice(1).map((line, index) => {
    const cells = splitCsvLine(line);
    if (!cells[keyIndex]) throw new Error(`Manifest CSV row ${index + 2} names no file`);
    const record = Object.fromEntries(header.map((column, i) => [column, cells[i] ?? '']));
    return { stem: stemOf(cells[keyIndex]), attributes: toAttributes(record, key) };
  });
};
