import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG, CALLING_ALLOWED_PLANS } from '../config/constants';
import { timingSafeEqualString } from '../utils/securitySecrets';
import { ONLYFLOW_BACKEND_CONFIG } from '../config/onlyflowBackend';

export interface CallFlowAuthRequest extends Request {
  jwtUserId?: string;
  tenantUserId?: string;
  premiumPlan?: string;
}

export function jwtAuth(req: Request, res: Response, next: NextFunction): void {
  if (!JWT_CONFIG.SECRET) {
    res.status(503).json({ status: 'error', message: 'JWT_SECRET não configurado no Call-Flow.' });
    return;
  }
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) {
    res.status(401).json({ status: 'error', message: 'Token não fornecido.' });
    return;
  }
  const token = h.slice(7).trim();
  try {
    const decoded = jwt.verify(token, JWT_CONFIG.SECRET, { algorithms: ['HS256'] }) as {
      id: string;
      effectiveUserId?: string;
    };
    const r = req as CallFlowAuthRequest;
    r.jwtUserId = decoded.id;
    r.tenantUserId = decoded.effectiveUserId?.trim() || decoded.id;
    const planHdr = String(req.headers['x-onlyflow-premium-plan'] || '')
      .trim()
      .toLowerCase();
    r.premiumPlan = planHdr || undefined;
    next();
  } catch {
    res.status(401).json({ status: 'error', message: 'Token inválido ou expirado.' });
  }
}

export function requireCallingPlan(req: Request, res: Response, next: NextFunction): void {
  const r = req as CallFlowAuthRequest;
  const plan = String(r.premiumPlan || '').toLowerCase();
  if (CALLING_ALLOWED_PLANS.has(plan)) {
    next();
    return;
  }
  res.status(403).json({
    status: 'error',
    code: 'CALLING_PLAN_REQUIRED',
    message: 'Ligações WhatsApp estão disponíveis nos planos Pro e Enterprise.',
  });
}

export function requireInternalKey(req: Request, res: Response, next: NextFunction): void {
  const expected = ONLYFLOW_BACKEND_CONFIG.INTERNAL_KEY;
  const got = String(req.headers['x-onlyflow-internal-key'] || '').trim();
  if (!expected || !got || !timingSafeEqualString(got, expected)) {
    res.status(401).json({ status: 'error', message: 'Não autorizado' });
    return;
  }
  next();
}
