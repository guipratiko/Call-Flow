import cors from 'cors';
import { SERVER_CONFIG } from '../config/constants';

function isAllowedOnlyflowOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return (
      u.hostname === 'localhost' ||
      u.hostname === '127.0.0.1' ||
      u.hostname.endsWith('.onlyflow.com.br') ||
      u.hostname === 'onlyflow.com.br'
    );
  } catch {
    return false;
  }
}

export const callFlowCors = cors({
  origin: (origin, cb) => {
    if (!origin) {
      cb(null, true);
      return;
    }
    if (SERVER_CONFIG.CORS_ORIGINS.length > 0) {
      cb(null, SERVER_CONFIG.CORS_ORIGINS.includes(origin));
      return;
    }
    if (isAllowedOnlyflowOrigin(origin)) {
      cb(null, true);
      return;
    }
    if (SERVER_CONFIG.NODE_ENV !== 'production') {
      cb(null, true);
      return;
    }
    cb(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-effective-user-id',
    'x-self-user-id',
    'x-onlyflow-premium-plan',
    'x-onlyflow-internal-key',
  ],
});
