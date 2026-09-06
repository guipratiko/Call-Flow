import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const message = err instanceof Error ? err.message : 'Erro interno';
  console.error('[call-flow]', message);
  if (!res.headersSent) {
    const status =
      err && typeof err === 'object' && 'statusCode' in err
        ? Number((err as { statusCode?: number }).statusCode) || 500
        : 500;
    res.status(status).json({ status: 'error', message });
  }
}

export class HttpError extends Error {
  statusCode: number;
  code?: string;
  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}
