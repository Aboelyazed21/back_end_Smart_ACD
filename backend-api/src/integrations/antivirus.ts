import { AppError } from '../utils/errors';

/**
 * Upload scanning hook. A ClamAV daemon can be wired in production by
 * implementing the same interface; the local fallback performs structural
 * checks only (no execution, no archive expansion).
 */
export interface ScanResult {
  clean: boolean;
  reason?: string;
}

export async function scanUpload(buffer: Buffer): Promise<ScanResult> {
  if (buffer.length === 0) {
    throw AppError.badRequest('EMPTY_FILE', 'Uploaded file is empty');
  }
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  if (sample.includes(0)) {
    throw AppError.badRequest('SUSPICIOUS_FILE', 'Uploaded file contains binary content');
  }
  const text = sample.toString('utf8').toLowerCase();
  if (text.includes('<script') || text.includes('activexobject')) {
    throw AppError.badRequest('SUSPICIOUS_FILE', 'Uploaded file contains active content');
  }
  return { clean: true };
}
