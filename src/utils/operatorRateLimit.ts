import { RATE_LIMIT_CONFIG } from '../config/constants';
import { HttpError } from '../middleware/errorHandler';

type Bucket = { count: number; resetAt: number };

const permissionBuckets = new Map<string, Bucket>();
const callBuckets = new Map<string, Bucket>();

function hit(map: Map<string, Bucket>, key: string, max: number, label: string): void {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  let b = map.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + hour };
    map.set(key, b);
  }
  if (b.count >= max) {
    throw new HttpError(
      429,
      `Limite OnlyFlow: máximo de ${max} ${label} por hora para este operador.`,
      'CALL_FLOW_RATE_LIMIT'
    );
  }
  b.count += 1;
}

export function assertPermissionRequestRateLimit(operatorUserId: string): void {
  hit(
    permissionBuckets,
    operatorUserId,
    RATE_LIMIT_CONFIG.MAX_PERMISSION_REQUESTS_PER_OPERATOR_HOUR,
    'pedidos de permissão'
  );
}

export function assertCallStartRateLimit(operatorUserId: string): void {
  hit(
    callBuckets,
    operatorUserId,
    RATE_LIMIT_CONFIG.MAX_CALLS_PER_OPERATOR_HOUR,
    'ligações'
  );
}
