import { Request, Response, NextFunction } from 'express';
import {
  parseCallPermissionReply,
  upsertCallPermissionFromWebhook,
} from '../services/callPermissionService';
import { applyCallWebhookEvent, notifyBackendPermissionUpdated } from '../services/callingService';

/** POST /internal/webhook/call-permission — Backend encaminha reply da Meta */
export async function postInternalCallPermission(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { userId, instanceId, waId, contactId, interactive, requestWamid } = req.body as {
      userId?: string;
      instanceId?: string;
      waId?: string;
      contactId?: string | null;
      interactive?: unknown;
      requestWamid?: string | null;
    };
    if (!userId || !instanceId || !waId) {
      res.status(400).json({ status: 'error', message: 'userId, instanceId e waId são obrigatórios.' });
      return;
    }
    const parsed = parseCallPermissionReply(interactive);
    if (!parsed) {
      res.status(400).json({ status: 'error', message: 'interactive call_permission_reply inválido.' });
      return;
    }
    await upsertCallPermissionFromWebhook({
      userId,
      instanceId,
      waId,
      contactId,
      parsed,
      requestWamid,
    });
    await notifyBackendPermissionUpdated({
      userId,
      instanceId,
      contactId: contactId ?? null,
      waId,
    });
    res.status(200).json({ status: 'success' });
  } catch (error: unknown) {
    next(error);
  }
}

/** POST /internal/webhook/calls — Backend encaminha field=calls */
export async function postInternalCallsWebhook(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const {
      callId,
      event,
      status,
      sdp,
      sdpType,
      direction,
      fallbackUserId,
      fallbackInstanceId,
      fallbackContactId,
      fallbackWaId,
      contactName,
      contactAvatar,
    } = req.body as {
      callId?: string;
      event?: 'connect' | 'status' | 'terminate';
      status?: string | null;
      sdp?: string | null;
      sdpType?: string | null;
      direction?: string | null;
      fallbackUserId?: string;
      fallbackInstanceId?: string;
      fallbackContactId?: string;
      fallbackWaId?: string;
      contactName?: string | null;
      contactAvatar?: string | null;
    };
    if (!callId || !event) {
      res.status(400).json({ status: 'error', message: 'callId e event são obrigatórios.' });
      return;
    }
    const result = await applyCallWebhookEvent({
      callId,
      event,
      status,
      sdp,
      sdpType,
      direction,
      fallbackUserId,
      fallbackInstanceId,
      fallbackContactId,
      fallbackWaId,
      contactName,
      contactAvatar,
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (error: unknown) {
    next(error);
  }
}
