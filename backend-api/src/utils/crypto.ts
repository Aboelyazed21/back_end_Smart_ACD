import crypto from 'node:crypto';
import { env } from '../config/env';

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function hashRefreshToken(token: string): string {
  return sha256(`${token}.${env.JWT_REFRESH_PEPPER}`);
}

export function hmacSignature(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export interface QrPayload {
  planId: string;
  studentCode: string;
  issuedAt: number;
  expiresAt: number;
  v: 1;
}

export function signQrToken(payload: QrPayload, secret = env.QR_SIGNING_SECRET): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function verifyQrToken(token: string, secret = env.QR_SIGNING_SECRET): QrPayload | null {
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  if (!safeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as QrPayload;
    if (payload.expiresAt < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
