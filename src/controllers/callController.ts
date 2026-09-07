import { Response, NextFunction } from 'express';
import { CallFlowAuthRequest } from '../middleware/auth';
import { HttpError } from '../middleware/errorHandler';
import { fetchCallContactContext } from '../services/backendClient';
import { resolveCallPermissionForContact } from '../services/callPermissionService';
import {
  acceptWhatsappCall,
  connectWhatsappCall,
  mirrorPermissionRequestToCrm,
  preAcceptWhatsappCall,
  rejectWhatsappCall,
  rememberPendingCall,
  sendCallPermissionRequestMessage,
  sendCallPermissionTemplateMessage,
  terminateWhatsappCall,
} from '../services/callingService';
import {
  isBusinessInitiatedCallingBlocked,
  isWithinCustomerServiceWindow,
} from '../utils/callingPolicy';
import {
  assertCallStartRateLimit,
  assertPermissionRequestRateLimit,
} from '../utils/operatorRateLimit';
import axios from 'axios';
import { META_GRAPH_BASE_URL } from '../config/constants';

async function assertCallingEnabledOnNumber(params: {
  phoneNumberId: string;
  accessToken: string;
}): Promise<void> {
  try {
    const res = await axios.get(
      `${META_GRAPH_BASE_URL}/${encodeURIComponent(params.phoneNumberId)}/settings`,
      {
        headers: { Authorization: `Bearer ${params.accessToken}` },
        timeout: 15_000,
        validateStatus: () => true,
      }
    );
    if (res.status >= 400) return;
    const calling = (res.data as { calling?: { status?: string } })?.calling;
    const st = String(calling?.status || '').toUpperCase();
    if (st && st !== 'ENABLED') {
      throw new HttpError(
        400,
        'Calling API ainda não está ENABLED neste número. Abra Configurações da instância → Ativar Calling (Meta).',
        '138000'
      );
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
  }
}


async function loadCloudContext(req: CallFlowAuthRequest, contactId: string) {
  const userId = req.tenantUserId;
  if (!userId) throw new HttpError(401, 'Usuário não autenticado');
  const ctx = await fetchCallContactContext(userId, contactId);
  if (ctx.integration !== 'WHATSAPP-CLOUD') {
    throw new HttpError(400, 'Ligações WhatsApp só na API Oficial.');
  }
  const geo = isBusinessInitiatedCallingBlocked(ctx.displayPhoneNumber);
  return { ...ctx, bicBlocked: geo.blocked, bicReason: geo.reason };
}

/** GET /contacts/:contactId/whatsapp-call-permission */
export async function getWhatsappCallPermission(
  req: CallFlowAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const ctx = await loadCloudContext(req, req.params.contactId);
    const permission = await resolveCallPermissionForContact({
      userId: ctx.userId,
      instanceId: ctx.instanceId,
      waId: ctx.waId,
      phoneNumberId: ctx.phoneNumberId,
      accessToken: ctx.accessToken,
    });
    const inWindow = isWithinCustomerServiceWindow(ctx.lastCustomerMessageAt);
    res.status(200).json({
      status: 'success',
      data: {
        ...permission,
        expiresAt: permission.expiresAt ? permission.expiresAt.toISOString() : null,
        supported: true,
        businessInitiatedBlocked: ctx.bicBlocked,
        businessInitiatedBlockedReason: ctx.bicReason,
        withinCustomerServiceWindow: inWindow,
        canRequestPermission:
          !ctx.bicBlocked &&
          permission.canRequestPermission &&
          permission.status !== 'permanent',
        canStartCall: !ctx.bicBlocked && permission.canStartCall,
      },
    });
  } catch (error: unknown) {
    next(error);
  }
}

/** POST /contacts/:contactId/whatsapp-call-permission-request */
export async function postWhatsappCallPermissionRequest(
  req: CallFlowAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const operatorId = req.jwtUserId || req.tenantUserId || '';
    assertPermissionRequestRateLimit(operatorId);

    const ctx = await loadCloudContext(req, req.params.contactId);
    if (ctx.bicBlocked) {
      throw new HttpError(403, ctx.bicReason || 'Calling indisponível neste número.');
    }

    await assertCallingEnabledOnNumber({
      phoneNumberId: ctx.phoneNumberId,
      accessToken: ctx.accessToken,
    });

    const permission = await resolveCallPermissionForContact({
      userId: ctx.userId,
      instanceId: ctx.instanceId,
      waId: ctx.waId,
      phoneNumberId: ctx.phoneNumberId,
      accessToken: ctx.accessToken,
    });
    if (
      permission.canStartCall ||
      permission.isPermanent ||
      permission.status === 'temporary' ||
      permission.status === 'permanent'
    ) {
      throw new HttpError(
        400,
        'Permissão já concedida. Use o botão de ligar (não peça autorização outra vez).',
        permission.isPermanent || permission.status === 'permanent'
          ? '138017'
          : 'PERMISSION_ALREADY_GRANTED'
      );
    }
    if (!permission.canRequestPermission) {
      throw new HttpError(
        429,
        'Limite de pedidos de permissão atingido (Meta: 1/24h, 2/7 dias).',
        '138009'
      );
    }

    // Preferir sempre o template configurado na instância (também dentro das 24h).
    // Free-form só como fallback se não houver template e estiver na janela de atendimento.
    const templateName = String(ctx.callPermissionTemplateName || '').trim();
    const languageCode = String(ctx.callPermissionTemplateLanguage || 'pt_BR').trim() || 'pt_BR';
    const inWindow = isWithinCustomerServiceWindow(ctx.lastCustomerMessageAt);

    if (templateName) {
      const sentTpl = await sendCallPermissionTemplateMessage({
        phoneNumberId: ctx.phoneNumberId,
        accessToken: ctx.accessToken,
        to: ctx.waId,
        templateName,
        languageCode,
        bodyParams: ctx.callPermissionTemplateBodyParams || [],
      });
      await mirrorPermissionRequestToCrm({
        userId: ctx.userId,
        instanceId: ctx.instanceId,
        contactPhone: ctx.waId,
        messageId: sentTpl.messageId,
        bodyText: `[Template ${templateName}] Pedido de permissão de ligação`,
      });
      res.status(200).json({
        status: 'success',
        data: {
          messageId: sentTpl.messageId,
          via: 'template',
          templateName,
          hint: 'Template de permissão enviado. O contacto deve autorizar no WhatsApp.',
        },
      });
      return;
    }

    if (!inWindow) {
      throw new HttpError(
        400,
        'Fora da janela de 24h: selecione um template APPROVED de permissão de ligação nas definições da instância.',
        'OUTSIDE_CSW'
      );
    }

    const bodyText =
      String(req.body?.text || '').trim() ||
      `Olá${ctx.contactName ? ` ${ctx.contactName}` : ''}! Gostaríamos de ligar para você no WhatsApp para dar continuidade ao seu atendimento. Pode autorizar?`.trim();

    if (bodyText.length < 20) {
      throw new HttpError(
        400,
        'O pedido de permissão precisa de um texto com contexto (mín. 20 caracteres).'
      );
    }

    const sent = await sendCallPermissionRequestMessage({
      phoneNumberId: ctx.phoneNumberId,
      accessToken: ctx.accessToken,
      to: ctx.waId,
      bodyText,
    });

    await mirrorPermissionRequestToCrm({
      userId: ctx.userId,
      instanceId: ctx.instanceId,
      contactPhone: ctx.waId,
      messageId: sent.messageId,
      bodyText,
    });

    res.status(200).json({
      status: 'success',
      data: {
        messageId: sent.messageId,
        via: 'free_form',
        hint: 'O contacto deve ver no WhatsApp um pedido interativo para autorizar a ligação.',
      },
    });
  } catch (error: unknown) {
    next(error);
  }
}

/** POST /contacts/:contactId/whatsapp-call */
export async function postWhatsappCall(
  req: CallFlowAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const operatorId = req.jwtUserId || req.tenantUserId || '';
    assertCallStartRateLimit(operatorId);

    const ctx = await loadCloudContext(req, req.params.contactId);
    if (ctx.bicBlocked) {
      throw new HttpError(403, ctx.bicReason || 'Calling indisponível neste número.');
    }

    await assertCallingEnabledOnNumber({
      phoneNumberId: ctx.phoneNumberId,
      accessToken: ctx.accessToken,
    });

    const sdp = String(req.body?.sdp || '').trim();
    if (!sdp) throw new HttpError(400, 'sdp é obrigatório (oferta WebRTC).');

    const permission = await resolveCallPermissionForContact({
      userId: ctx.userId,
      instanceId: ctx.instanceId,
      waId: ctx.waId,
      phoneNumberId: ctx.phoneNumberId,
      accessToken: ctx.accessToken,
    });
    if (!permission.canStartCall) {
      throw new HttpError(
        400,
        'Sem permissão ativa para ligar. Peça autorização ao contacto primeiro.'
      );
    }

    const { callId } = await connectWhatsappCall({
      phoneNumberId: ctx.phoneNumberId,
      accessToken: ctx.accessToken,
      to: ctx.waId,
      sdp,
    });
    rememberPendingCall(callId, {
      userId: ctx.userId,
      contactId: ctx.contactId,
      instanceId: ctx.instanceId,
      waId: ctx.waId,
      direction: 'BUSINESS_INITIATED',
    });

    res.status(200).json({
      status: 'success',
      data: {
        callId,
        consecutiveUnansweredHint:
          (permission.consecutiveUnanswered || 0) >= 2
            ? 'Atenção: várias ligações sem resposta podem revogar a permissão (Meta: 4 consecutivas).'
            : null,
      },
    });
  } catch (error: unknown) {
    next(error);
  }
}

/** POST /contacts/:contactId/whatsapp-call/pre-accept — UIC */
export async function postWhatsappCallPreAccept(
  req: CallFlowAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const ctx = await loadCloudContext(req, req.params.contactId);
    const callId = String(req.body?.callId || '').trim();
    const sdp = String(req.body?.sdp || '').trim();
    if (!callId) throw new HttpError(400, 'callId é obrigatório.');
    if (!sdp) throw new HttpError(400, 'sdp é obrigatório (answer WebRTC).');

    await preAcceptWhatsappCall({
      phoneNumberId: ctx.phoneNumberId,
      accessToken: ctx.accessToken,
      callId,
      sdp,
    });
    rememberPendingCall(callId, {
      userId: ctx.userId,
      contactId: ctx.contactId,
      instanceId: ctx.instanceId,
      waId: ctx.waId,
      direction: 'USER_INITIATED',
    });

    res.status(200).json({ status: 'success' });
  } catch (error: unknown) {
    next(error);
  }
}

/** POST /contacts/:contactId/whatsapp-call/accept — UIC */
export async function postWhatsappCallAccept(
  req: CallFlowAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const ctx = await loadCloudContext(req, req.params.contactId);
    const callId = String(req.body?.callId || '').trim();
    const sdp = String(req.body?.sdp || '').trim();
    if (!callId) throw new HttpError(400, 'callId é obrigatório.');
    if (!sdp) throw new HttpError(400, 'sdp é obrigatório (answer WebRTC).');

    await acceptWhatsappCall({
      phoneNumberId: ctx.phoneNumberId,
      accessToken: ctx.accessToken,
      callId,
      sdp,
    });
    rememberPendingCall(callId, {
      userId: ctx.userId,
      contactId: ctx.contactId,
      instanceId: ctx.instanceId,
      waId: ctx.waId,
      direction: 'USER_INITIATED',
    });

    res.status(200).json({ status: 'success', data: { callId } });
  } catch (error: unknown) {
    next(error);
  }
}

/** POST /contacts/:contactId/whatsapp-call/reject — UIC */
export async function postWhatsappCallReject(
  req: CallFlowAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const ctx = await loadCloudContext(req, req.params.contactId);
    const callId = String(req.body?.callId || '').trim();
    if (!callId) throw new HttpError(400, 'callId é obrigatório.');

    await rejectWhatsappCall({
      phoneNumberId: ctx.phoneNumberId,
      accessToken: ctx.accessToken,
      callId,
    });

    res.status(200).json({ status: 'success' });
  } catch (error: unknown) {
    next(error);
  }
}

/** POST /contacts/:contactId/whatsapp-call/terminate */
export async function postWhatsappCallTerminate(
  req: CallFlowAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const ctx = await loadCloudContext(req, req.params.contactId);
    const callId = String(req.body?.callId || '').trim();
    if (!callId) throw new HttpError(400, 'callId é obrigatório.');

    await terminateWhatsappCall({
      phoneNumberId: ctx.phoneNumberId,
      accessToken: ctx.accessToken,
      callId,
    });

    res.status(200).json({ status: 'success' });
  } catch (error: unknown) {
    next(error);
  }
}
