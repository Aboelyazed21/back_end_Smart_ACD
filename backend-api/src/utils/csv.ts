import { AppError } from './errors';

const ALLOWED_MIME = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'text/plain',
  'application/octet-stream',
]);

export function assertCsvUpload(file: Express.Multer.File | undefined): void {
  if (!file) {
    throw AppError.badRequest('FILE_REQUIRED', 'A CSV file is required');
  }
  const extension = file.originalname.toLowerCase().split('.').pop();
  if (extension !== 'csv') {
    throw AppError.badRequest('INVALID_FILE_TYPE', 'Only .csv files are accepted');
  }
  if (!ALLOWED_MIME.has(file.mimetype)) {
    throw AppError.badRequest('INVALID_MIME_TYPE', 'Invalid upload content type');
  }
  if (file.size > 5_000_000) {
    throw AppError.badRequest('FILE_TOO_LARGE', 'CSV file exceeds the 5 MB limit');
  }
}

export function assertNoNullBytes(filePath: string, fileBuffer: Buffer): void {
  const sample = fileBuffer.subarray(0, Math.min(fileBuffer.length, 4096));
  if (sample.includes(0)) {
    throw AppError.badRequest('INVALID_FILE_SIGNATURE', 'File contains binary data');
  }
  if (!filePath.toLowerCase().endsWith('.csv')) {
    throw AppError.badRequest('INVALID_FILE_TYPE', 'Only .csv files are accepted');
  }
}

export function parseCsvBuffer(buffer: Buffer): string[][] {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
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
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  if (rows.length > 5000) {
    throw AppError.badRequest('CSV_TOO_MANY_ROWS', 'CSV exceeds 5000 data rows');
  }
  return rows;
}

export function mapCsvRows(rows: string[][]): Array<Record<string, string>> {
  if (rows.length === 0) throw AppError.badRequest('CSV_EMPTY', 'CSV is empty');
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  if (new Set(header).size !== header.length) {
    throw AppError.badRequest('CSV_DUPLICATE_HEADER', 'CSV header contains duplicate columns');
  }
  return rows.slice(1).map((values) => {
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      record[key] = (values[index] ?? '').trim();
    });
    return record;
  });
}
