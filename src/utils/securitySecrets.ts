import crypto from 'crypto';

export const DEFAULT_JWT_SECRET = 'your-secret-key-change-in-production';

export function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function resolveJwtSecret(): string {
  const secret = (process.env.JWT_SECRET || '').trim();
  if (!secret || secret === DEFAULT_JWT_SECRET) {
    if (isProductionEnv()) {
      throw new Error('JWT_SECRET obrigatório em produção (não use o valor default).');
    }
    return secret || DEFAULT_JWT_SECRET;
  }
  return secret;
}

export function resolveOnlyflowInternalKey(): string {
  const key = (process.env.ONLYFLOW_INTERNAL_KEY || '').trim();
  if (key) return key;
  if (isProductionEnv()) {
    throw new Error('ONLYFLOW_INTERNAL_KEY obrigatória em produção.');
  }
  const jwt = (process.env.JWT_SECRET || '').trim();
  return jwt || DEFAULT_JWT_SECRET;
}

export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
