import { Router, Request, Response } from 'express';
import { DATABASE_CONFIG, SERVER_CONFIG } from '../config/constants';
import { getPgPool } from '../config/database';
import packageJson from '../../package.json';

const router = Router();

/**
 * GET /api/public/status
 * Health público alinhado ao padrão OnlyFlow (consumido pelo GET /api/status do backend principal).
 */
router.get('/status', async (_req: Request, res: Response) => {
  const timestamp = new Date().toISOString();
  const packageVersion = packageJson.version || '1.0.0';
  const dbUrl = DATABASE_CONFIG.POSTGRES_URI.trim();

  if (!dbUrl) {
    res.status(500).json({
      status: 'error',
      service: 'call-flow',
      version: packageVersion,
      message: 'Call-Flow indisponível: POSTGRES_URI não configurado.',
      timestamp,
      details: { postgresql: false },
    });
    return;
  }

  try {
    await getPgPool().query('SELECT 1');
    res.status(200).json({
      status: 'ok',
      service: 'call-flow',
      version: packageVersion,
      message: 'Call-Flow API está funcionando',
      timestamp,
      environment: SERVER_CONFIG.NODE_ENV,
      details: { postgresql: true },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro ao consultar Postgres';
    res.status(500).json({
      status: 'error',
      service: 'call-flow',
      version: packageVersion,
      message: `Call-Flow com problemas: ${msg}`,
      timestamp,
      details: { postgresql: false, error: msg },
    });
  }
});

export default router;
