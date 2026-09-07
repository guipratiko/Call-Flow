import { Router, Request, Response } from 'express';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'call-flow',
    api: '/api/call-flow',
    publicStatus: '/api/public/status',
  });
});

export default router;
