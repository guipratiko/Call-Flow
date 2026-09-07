/**
 * WhatsApp Calling API: connect / terminate + notify Backend (Socket.IO).
 */

import axios from 'axios';
import { META_GRAPH_BASE_URL, ONLYFLOW_BACKEND_CONFIG } from '../config/constants';
import { formatMetaGraphErrorMessage } from '../utils/metaErrors';
import { markLastCall } from './callPermissionService';

export type WhatsappCallSignalingPayload = {
  contactId: string;
  instanceId: string;
  callId: string;
  event: 'connect' | 'status' | 'terminate' | 'incoming';
  status?: string | null;
  sdp?: string | null;
  sdpType?: string | null;
  direction?: 'USER_INITIATED' | 'BUSINESS_INITIATED' | null;
  waId?: string | null;
  contactName?: string | null;
  contactAvatar?: string | null;
};

type PendingCall = {
  userId: string;
  contactId: string;
  instanceId: string;
  waId: string;
  direction?: 'USER_INITIATED' | 'BUSINESS_INITIATED';
};

const pendingByCallId = new Map<string, PendingCall>();

export function rememberPendingCall(callId: string, pending: PendingCall): void {
  pendingByCallId.set(callId, pending);
}

export function forgetPendingCall(callId: string): void {
  pendingByCallId.delete(callId);
}

async function notifyBackendSignaling(userId: string, payload: WhatsappCallSignalingPayload): Promise<void> {
  const base = ONLYFLOW_BACKEND_CONFIG.BASE_URL;
  if (!base) return;
  try {
    await axios.post(
      `${base}/api/internal/call-flow/emit-signaling`,
      { userId, ...payload },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-onlyflow-internal-key': ONLYFLOW_BACKEND_CONFIG.INTERNAL_KEY,
        },
        timeout: ONLYFLOW_BACKEND_CONFIG.HTTP_TIMEOUT_MS,
        validateStatus: () => true,
      }
    );
  } catch {
    /* ignore */
  }
}

export async function notifyBackendPermissionUpdated(params: {
  userId: string;
  instanceId: string;
  contactId: string | null;
  waId: string;
}): Promise<void> {
  const base = ONLYFLOW_BACKEND_CONFIG.BASE_URL;
  if (!base) return;
  try {
    await axios.post(
      `${base}/api/internal/call-flow/emit-permission-updated`,
      params,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-onlyflow-internal-key': ONLYFLOW_BACKEND_CONFIG.INTERNAL_KEY,
        },
        timeout: ONLYFLOW_BACKEND_CONFIG.HTTP_TIMEOUT_MS,
        validateStatus: () => true,
      }
    );
  } catch {
    /* ignore */
  }
}

export async function connectWhatsappCall(params: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  sdp: string;
}): Promise<{ callId: string }> {
  const url = `${META_GRAPH_BASE_URL}/${encodeURIComponent(params.phoneNumberId)}/calls`;
  const res = await axios.post(
    url,
    {
      messaging_product: 'whatsapp',
      to: params.to,
      action: 'connect',
      session: { sdp_type: 'offer', sdp: params.sdp },
    },
    {
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
      validateStatus: () => true,
    }
  );
  if (res.status >= 400) {
    throw new Error(formatMetaGraphErrorMessage(res.data) || `Calling API ${res.status}`);
  }
  const callId = String(
    (res.data as { calls?: Array<{ id?: string }> })?.calls?.[0]?.id || ''
  ).trim();
  if (!callId) {
    throw new Error('A Meta não devolveu o id da chamada.');
  }
  return { callId };
}

export async function terminateWhatsappCall(params: {
  phoneNumberId: string;
  accessToken: string;
  callId: string;
}): Promise<void> {
  const url = `${META_GRAPH_BASE_URL}/${encodeURIComponent(params.phoneNumberId)}/calls`;
  const res = await axios.post(
    url,
    {
      messaging_product: 'whatsapp',
      call_id: params.callId,
      action: 'terminate',
    },
    {
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 20_000,
      validateStatus: () => true,
    }
  );
  if (res.status >= 400) {
    throw new Error(formatMetaGraphErrorMessage(res.data) || `Calling API ${res.status}`);
  }
}

async function postCallAction(params: {
  phoneNumberId: string;
  accessToken: string;
  callId: string;
  action: 'pre_accept' | 'accept' | 'reject';
  sdp?: string;
}): Promise<void> {
  const url = `${META_GRAPH_BASE_URL}/${encodeURIComponent(params.phoneNumberId)}/calls`;
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    call_id: params.callId,
    action: params.action,
  };
  if (params.action !== 'reject' && params.sdp) {
    body.session = { sdp_type: 'answer', sdp: params.sdp };
  }
  const res = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 30_000,
    validateStatus: () => true,
  });
  if (res.status >= 400) {
    throw new Error(formatMetaGraphErrorMessage(res.data) || `Calling API ${res.status}`);
  }
}

/** UIC: pré-aceitar oferta (SDP answer provisório / rápido). */
export async function preAcceptWhatsappCall(params: {
  phoneNumberId: string;
  accessToken: string;
  callId: string;
  sdp: string;
}): Promise<void> {
  await postCallAction({ ...params, action: 'pre_accept' });
}

/** UIC: aceitar chamada com SDP answer final. */
export async function acceptWhatsappCall(params: {
  phoneNumberId: string;
  accessToken: string;
  callId: string;
  sdp: string;
}): Promise<void> {
  await postCallAction({ ...params, action: 'accept' });
}

/** UIC: recusar chamada entrante. */
export async function rejectWhatsappCall(params: {
  phoneNumberId: string;
  accessToken: string;
  callId: string;
}): Promise<void> {
  await postCallAction({ ...params, action: 'reject' });
}

/** Persiste estado da ligação no Backend (whatsapp_calls). */
export async function notifyBackendUpsertCall(params: {
  userId: string;
  instanceId: string;
  contactId: string | null;
  callId: string;
  waId: string;
  direction: 'USER_INITIATED' | 'BUSINESS_INITIATED';
  status: string;
  event: string;
}): Promise<void> {
  const base = ONLYFLOW_BACKEND_CONFIG.BASE_URL;
  if (!base) return;
  try {
    await axios.post(
      `${base}/api/internal/call-flow/upsert-call`,
      params,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-onlyflow-internal-key': ONLYFLOW_BACKEND_CONFIG.INTERNAL_KEY,
        },
        timeout: ONLYFLOW_BACKEND_CONFIG.HTTP_TIMEOUT_MS,
        validateStatus: () => true,
      }
    );
  } catch {
    /* ignore */
  }
}

export async function sendCallPermissionRequestMessage(params: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  bodyText: string;
}): Promise<{ messageId: string }> {
  const url = `${META_GRAPH_BASE_URL}/${encodeURIComponent(params.phoneNumberId)}/messages`;
  const res = await axios.post(
    url,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: params.to,
      type: 'interactive',
      interactive: {
        type: 'call_permission_request',
        action: { name: 'call_permission_request' },
        body: { text: params.bodyText },
      },
    },
    {
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 20_000,
      validateStatus: () => true,
    }
  );
  if (res.status >= 400) {
    throw new Error(formatMetaGraphErrorMessage(res.data) || `Graph ${res.status}`);
  }
  const messageId = String(
    (res.data as { messages?: Array<{ id?: string }> })?.messages?.[0]?.id || ''
  ).trim();
  if (!messageId) {
    throw new Error('A Meta aceitou o pedido, mas não devolveu message id.');
  }
  return { messageId };
}

/** Envia template APPROVED com call_permission_request (fora da janela 24h). */
export async function sendCallPermissionTemplateMessage(params: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  templateName: string;
  languageCode: string;
  bodyParams?: string[];
}): Promise<{ messageId: string }> {
  const url = `${META_GRAPH_BASE_URL}/${encodeURIComponent(params.phoneNumberId)}/messages`;
  const components: Array<Record<string, unknown>> = [];
  const bodyParams = Array.isArray(params.bodyParams) ? params.bodyParams.filter(Boolean) : [];
  if (bodyParams.length > 0) {
    components.push({
      type: 'body',
      parameters: bodyParams.map((text) => ({ type: 'text', text: String(text) })),
    });
  }
  const res = await axios.post(
    url,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: params.to,
      type: 'template',
      template: {
        name: params.templateName,
        language: { code: params.languageCode || 'pt_BR' },
        ...(components.length > 0 ? { components } : {}),
      },
    },
    {
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 20_000,
      validateStatus: () => true,
    }
  );
  if (res.status >= 400) {
    throw new Error(formatMetaGraphErrorMessage(res.data) || `Graph ${res.status}`);
  }
  const messageId = String(
    (res.data as { messages?: Array<{ id?: string }> })?.messages?.[0]?.id || ''
  ).trim();
  if (!messageId) {
    throw new Error('A Meta aceitou o template, mas não devolveu message id.');
  }
  return { messageId };
}

/** Espelha o pedido de permissão no chat CRM (Backend). */
export async function mirrorPermissionRequestToCrm(params: {
  userId: string;
  instanceId: string;
  contactPhone: string;
  messageId: string;
  bodyText: string;
}): Promise<void> {
  const base = ONLYFLOW_BACKEND_CONFIG.BASE_URL;
  if (!base) return;
  try {
    await axios.post(
      `${base}/api/internal/workflow/crm-mirror-outbound`,
      {
        userId: params.userId,
        instanceId: params.instanceId,
        contactPhone: params.contactPhone,
        messageId: params.messageId,
        content: `${params.bodyText}\n\n• Permitir\n• Permitir temporariamente\n• Recusar`,
        messageType: 'call_permission_request',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-onlyflow-internal-key': ONLYFLOW_BACKEND_CONFIG.INTERNAL_KEY,
        },
        timeout: ONLYFLOW_BACKEND_CONFIG.HTTP_TIMEOUT_MS,
        validateStatus: () => true,
      }
    );
  } catch {
    /* ignore mirror failures */
  }
}

export async function applyCallWebhookEvent(params: {
  callId: string;
  event: 'connect' | 'status' | 'terminate';
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
}): Promise<{ consecutiveUnanswered: number }> {
  const pending = pendingByCallId.get(params.callId);
  const userId = pending?.userId || params.fallbackUserId;
  if (!userId) return { consecutiveUnanswered: 0 };
  const contactId = pending?.contactId || params.fallbackContactId || '';
  const instanceId = pending?.instanceId || params.fallbackInstanceId || '';
  const waId = pending?.waId || params.fallbackWaId || '';
  const directionRaw = String(params.direction || pending?.direction || '').toUpperCase();
  const direction: 'USER_INITIATED' | 'BUSINESS_INITIATED' =
    directionRaw === 'USER_INITIATED' ? 'USER_INITIATED' : 'BUSINESS_INITIATED';
  const sdpType = String(params.sdpType || '').toLowerCase();
  const isIncomingOffer =
    params.event === 'connect' &&
    Boolean(params.sdp) &&
    (direction === 'USER_INITIATED' || (!pending && sdpType === 'offer'));

  if (isIncomingOffer) {
    rememberPendingCall(params.callId, {
      userId,
      contactId,
      instanceId,
      waId,
      direction: 'USER_INITIATED',
    });
    await notifyBackendSignaling(userId, {
      contactId,
      instanceId,
      callId: params.callId,
      event: 'incoming',
      status: params.status ?? 'RINGING',
      sdp: params.sdp ?? null,
      sdpType: params.sdpType || 'offer',
      direction: 'USER_INITIATED',
      waId: waId || null,
      contactName: params.contactName ?? null,
      contactAvatar: params.contactAvatar ?? null,
    });
    await notifyBackendUpsertCall({
      userId,
      instanceId,
      contactId: contactId || null,
      callId: params.callId,
      waId,
      direction: 'USER_INITIATED',
      status: 'ringing',
      event: 'incoming',
    });
    return { consecutiveUnanswered: 0 };
  }

  await notifyBackendSignaling(userId, {
    contactId,
    instanceId,
    callId: params.callId,
    event: params.event,
    status: params.status ?? null,
    sdp: params.sdp ?? null,
    sdpType: params.sdpType ?? null,
    direction: pending?.direction || direction,
    waId: waId || null,
  });

  if (params.event === 'connect' || params.event === 'status' || params.event === 'terminate') {
    const statusUpper = String(params.status || '').toUpperCase();
    const isMissed =
      statusUpper === 'MISSED' ||
      statusUpper === 'TIMEOUT' ||
      statusUpper === 'FAILED' ||
      statusUpper === 'BUSY';
    const statusMap =
      statusUpper === 'REJECTED'
        ? 'rejected'
        : statusUpper === 'ACCEPTED'
          ? 'connected'
          : isMissed
            ? 'missed'
            : params.event === 'terminate'
              ? 'ended'
              : params.event === 'connect'
                ? 'ringing'
                : 'ringing';
    await notifyBackendUpsertCall({
      userId,
      instanceId,
      contactId: contactId || null,
      callId: params.callId,
      waId,
      direction: pending?.direction || direction,
      status: statusMap,
      event: params.event,
    });
  }

  let consecutiveUnanswered = 0;
  if (waId && instanceId) {
    try {
      const marked = await markLastCall({
        userId,
        instanceId,
        waId,
        callId: params.callId,
        callStatus: params.status || params.event,
      });
      consecutiveUnanswered = marked.consecutiveUnanswered;
    } catch {
      /* ignore */
    }
  }
  if (params.event === 'terminate') {
    forgetPendingCall(params.callId);
  }
  return { consecutiveUnanswered };
}
