import { Router } from 'express';
import { jwtAuth, requireCallingPlan } from '../middleware/auth';
import {
  getWhatsappCallPermission,
  postWhatsappCall,
  postWhatsappCallPermissionRequest,
  postWhatsappCallTerminate,
} from '../controllers/callController';

const router = Router();

router.use(jwtAuth);
router.use(requireCallingPlan);

router.get('/contacts/:contactId/whatsapp-call-permission', getWhatsappCallPermission);
router.post('/contacts/:contactId/whatsapp-call-permission-request', postWhatsappCallPermissionRequest);
router.post('/contacts/:contactId/whatsapp-call', postWhatsappCall);
router.post('/contacts/:contactId/whatsapp-call/terminate', postWhatsappCallTerminate);

export default router;
