import { Router } from 'express';
import { requireInternalKey } from '../middleware/auth';
import {
  postInternalCallPermission,
  postInternalCallsWebhook,
} from '../controllers/internalWebhookController';

const router = Router();
router.use(requireInternalKey);
router.post('/webhook/call-permission', postInternalCallPermission);
router.post('/webhook/calls', postInternalCallsWebhook);

export default router;
