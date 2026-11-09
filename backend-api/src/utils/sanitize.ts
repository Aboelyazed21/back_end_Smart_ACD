const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const HTML_TAGS = /<[^>]*>/g;

/** Sanitize user-supplied text before storage; never echo raw HTML back. */
export function sanitizeText(value: string, maxLength = 5000): string {
  const withoutControl = value.replace(CONTROL_CHARS, ' ');
  const withoutTags = withoutControl.replace(HTML_TAGS, '');
  return withoutTags.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/** Neutralise spreadsheet formula injection when writing CSV cells. */
export function escapeCsvFormula(value: string): string {
  const trimmed = value.trimStart();
  if (/^[=+\-@]/.test(trimmed)) {
    return `'${value}`;
  }
  return value;
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function hasHtmlTags(value: string): boolean {
  return /<[^>]*>/.test(value);
}

export function isPlainText(value: string): boolean {
  // Use a non-global expression: a global regex would keep state between calls.
  return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}

export function isValidEmailDomain(email: string, allowedDomain: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(normalized)) return false;
  return normalized.endsWith(`@${allowedDomain.toLowerCase()}`);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
