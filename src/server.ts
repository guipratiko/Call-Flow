import express, { Router } from 'express';
import { SERVER_CONFIG, DATABASE_CONFIG, resolveOnlyflowApiBaseUrl } from './config/constants';
import { callFlowCors } from './middleware/cors';
import healthRoutes from './routes/health';
import publicStatusRoutes from './routes/publicStatus';
import callsRoutes from './routes/calls';
import internalRoutes from './routes/internal';
import { errorHandler, HttpError } from './middleware/errorHandler';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(callFlowCors);

const api = Router();
api.use('/call-flow', callsRoutes);
api.use('/internal/call-flow', internalRoutes);
api.use('/public', publicStatusRoutes);

app.use('/api', api);
app.use('/', healthRoutes);

app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof HttpError) {
    if (!res.headersSent) {
      res.status(err.statusCode).json({
        status: 'error',
        message: err.message,
        code: err.code,
      });
    }
    return;
  }
  errorHandler(err, req, res, next);
});

app.listen(SERVER_CONFIG.PORT, () => {
  console.log(`[call-flow] listening on port ${SERVER_CONFIG.PORT} (${SERVER_CONFIG.NODE_ENV})`);
  if (!DATABASE_CONFIG.POSTGRES_URI) {
    console.warn('[call-flow] POSTGRES_URI ausente — permissões locais não funcionarão.');
  }
  const backendUrl = resolveOnlyflowApiBaseUrl();
  if (!backendUrl) {
    console.warn('[call-flow] ONLYFLOW_API_BASE_URL ausente — contexto de contacto falhará.');
  } else {
    console.log(`[call-flow] ONLYFLOW_API_BASE_URL=${backendUrl}`);
  }
});

export default app;
