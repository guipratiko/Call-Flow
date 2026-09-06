/**
 * Configurações centralizadas do Call-Flow.
 */

import './loadEnv';
import { parseCommaSeparatedOrigins } from './serviceUrl';
import { ONLYFLOW_BACKEND_CONFIG, resolveOnlyflowApiBaseUrl } from './onlyflowBackend';
import { resolveJwtSecret } from '../utils/securitySecrets';

export { ONLYFLOW_BACKEND_CONFIG, resolveOnlyflowApiBaseUrl } from './onlyflowBackend';

export const SERVER_CONFIG = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT) || 4348,
  TIMEZONE: process.env.TZ || 'America/Sao_Paulo',
  CORS_ORIGINS: parseCommaSeparatedOrigins(process.env.CORS_ORIGINS),
} as const;

export const JWT_CONFIG = {
  SECRET: resolveJwtSecret(),
} as const;

export const DATABASE_CONFIG = {
  POSTGRES_URI: (process.env.POSTGRES_URI || '').trim(),
  POOL_MAX: Math.min(20, Math.max(2, parseInt(process.env.POSTGRES_POOL_MAX || '10', 10) || 10)),
} as const;

const metaGraphVerRaw = (process.env.META_GRAPH_API_VERSION || 'v25.0').trim();
export const META_GRAPH_API_VERSION = metaGraphVerRaw.startsWith('v')
  ? metaGraphVerRaw
  : `v${metaGraphVerRaw}`;
export const META_GRAPH_BASE_URL = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

export const RATE_LIMIT_CONFIG = {
  MAX_PERMISSION_REQUESTS_PER_OPERATOR_HOUR: Math.max(
    1,
    parseInt(process.env.CALL_FLOW_MAX_PERMISSION_REQUESTS_PER_OPERATOR_HOUR || '30', 10) || 30
  ),
  MAX_CALLS_PER_OPERATOR_HOUR: Math.max(
    1,
    parseInt(process.env.CALL_FLOW_MAX_CALLS_PER_OPERATOR_HOUR || '40', 10) || 40
  ),
} as const;

/** Planos com Calling habilitado. */
export const CALLING_ALLOWED_PLANS = new Set(['pro', 'enterprise']);
