import './loadEnv';
import { normalizeServiceBaseUrl } from './serviceUrl';
import { resolveOnlyflowInternalKey } from '../utils/securitySecrets';

export function resolveOnlyflowApiBaseUrl(): string {
  const explicit = normalizeServiceBaseUrl(
    process.env.ONLYFLOW_API_BASE_URL ||
      process.env.BACKEND_URL ||
      process.env.BACKEND_PUBLIC_URL ||
      ''
  );
  if (explicit) return explicit;

  const nodeEnv = (process.env.NODE_ENV || 'development').trim().toLowerCase();
  if (nodeEnv === 'production') return '';

  const port = (process.env.ONLYFLOW_BACKEND_PORT || process.env.BACKEND_PORT || '4331').trim();
  return `http://127.0.0.1:${port}`;
}

export const ONLYFLOW_BACKEND_CONFIG = {
  get BASE_URL() {
    return resolveOnlyflowApiBaseUrl();
  },
  INTERNAL_KEY: resolveOnlyflowInternalKey(),
  HTTP_TIMEOUT_MS: 15_000,
} as const;
