import argon2 from 'argon2';
import { AppError } from './errors';

const OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,128}$/;

export function validatePasswordPolicy(password: string): void {
  if (!PASSWORD_POLICY.test(password)) {
    throw AppError.badRequest(
      'WEAK_PASSWORD',
      'Password must be 12-128 characters and include upper case, lower case, a digit and a symbol',
    );
  }
}

export async function hashPassword(password: string): Promise<string> {
  validatePasswordPolicy(password);
  return argon2.hash(password, OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function generateTemporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let body = '';
  for (let i = 0; i < 12; i += 1) {
    body += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `${body}!Aa1`;
}
