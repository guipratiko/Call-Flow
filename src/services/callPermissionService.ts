/**
 * Permissões de chamada WhatsApp (Calling API).
 */

import axios from 'axios';
import { getPgPool } from '../config/database';
import { META_GRAPH_BASE_URL } from '../config/constants';
import { formatMetaGraphErrorMessage } from '../utils/metaErrors';

export type CallPermissionStatus = 'no_permission' | 'temporary' | 'permanent' | 'rejected';

export type StoredCallPermission = {
  status: CallPermissionStatus;
  response: string | null;
  isPermanent: boolean;
  expiresAt: Date | null;
  responseSource: string | null;
  canStartCall: boolean;
  canRequestPermission: boolean;
  metaPermissionStatus: string | null;
  consecutiveUnanswered?: number;
};

export type CallPermissionReplyParsed = {
  response: 'accept' | 'reject' | 'temporarily_accept';
  isPermanent: boolean;
  expiresAt: Date | null;
  responseSource: string | null;
};

export function parseCallPermissionReply(interactive: unknown): CallPermissionReplyParsed | null {
  if (!interactive || typeof interactive !== 'object') return null;
  const row = interactive as Record<string, unknown>;
  const type = String(row.type || '').toLowerCase();
  const payload =
    row.call_permission_reply && typeof row.call_permission_reply === 'object'
      ? (row.call_permission_reply as Record<string, unknown>)
      : type === 'call_permission_reply'
        ? row
        : null;
  if (type !== 'call_permission_reply' && !row.call_permission_reply) return null;
  if (!payload) return null;

  const raw = String(payload.response || '').toLowerCase().trim();
  let response: CallPermissionReplyParsed['response'] | null = null;
  if (raw === 'accept' || raw === 'temporarily_accept' || raw === 'reject') {
    response = raw;
  }
  if (!response) return null;

  const isPermanent =
    response === 'accept' &&
    (payload.is_permanent === true || String(payload.is_permanent).toLowerCase() === 'true');

  let expiresAt: Date | null = null;
  const expRaw = payload.expiration_timestamp ?? payload.expiration_time;
  if (expRaw != null && Number.isFinite(Number(expRaw))) {
    const n = Number(expRaw);
    expiresAt = new Date(n * (String(expRaw).length <= 10 ? 1000 : 1));
  }

  return {
    response,
    isPermanent: response === 'temporarily_accept' ? false : isPermanent,
    expiresAt,
    responseSource: payload.response_source != null ? String(payload.response_source) : null,
  };
}

export function statusFromReply(parsed: CallPermissionReplyParsed): CallPermissionStatus {
  if (parsed.response === 'reject') return 'rejected';
  if (parsed.isPermanent) return 'permanent';
  return 'temporary';
}

export function isPermissionActive(row: {
  status: string;
  isPermanent?: boolean;
  expiresAt?: Date | null;
}): boolean {
  if (row.status === 'permanent' || row.isPermanent) return true;
  if (row.status !== 'temporary') return false;
  if (!row.expiresAt) return true;
  return row.expiresAt.getTime() > Date.now();
}

export async function upsertCallPermissionFromWebhook(params: {
  userId: string;
  instanceId: string;
  waId: string;
  contactId?: string | null;
  parsed: CallPermissionReplyParsed;
  requestWamid?: string | null;
}): Promise<void> {
  const status = statusFromReply(params.parsed);
  const pool = getPgPool();
  await pool.query(
    `INSERT INTO whatsapp_call_permissions (
       user_id, instance_id, wa_id, contact_id, status, response,
       is_permanent, expires_at, response_source, request_wamid, source, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'call_permission_reply', NOW())
     ON CONFLICT (user_id, instance_id, wa_id)
     DO UPDATE SET
       contact_id = COALESCE(EXCLUDED.contact_id, whatsapp_call_permissions.contact_id),
       status = EXCLUDED.status,
       response = EXCLUDED.response,
       is_permanent = EXCLUDED.is_permanent,
       expires_at = EXCLUDED.expires_at,
       response_source = EXCLUDED.response_source,
       request_wamid = COALESCE(EXCLUDED.request_wamid, whatsapp_call_permissions.request_wamid),
       source = EXCLUDED.source,
       updated_at = NOW()`,
    [
      params.userId,
      params.instanceId,
      params.waId,
      params.contactId ?? null,
      status,
      params.parsed.response,
      params.parsed.isPermanent,
      params.parsed.expiresAt,
      params.parsed.responseSource,
      params.requestWamid ?? null,
    ]
  );
}

export async function markLastCall(params: {
  userId: string;
  instanceId: string;
  waId: string;
  callId: string;
  callStatus: string;
}): Promise<{ consecutiveUnanswered: number }> {
  const pool = getPgPool();
  const statusUpper = String(params.callStatus || '').toUpperCase();
  const isUnanswered =
    statusUpper === 'REJECTED' ||
    statusUpper === 'MISSED' ||
    statusUpper === 'FAILED' ||
    statusUpper === 'TIMEOUT' ||
    statusUpper === 'BUSY';
  const isConnected = statusUpper === 'ACCEPTED' || statusUpper === 'CONNECTED';

  const current = await pool.query<{ last_call_status: string | null }>(
    `SELECT last_call_status FROM whatsapp_call_permissions
      WHERE user_id = $1 AND instance_id = $2 AND wa_id = $3`,
    [params.userId, params.instanceId, params.waId]
  );

  let consecutive = 0;
  if (isConnected) {
    consecutive = 0;
  } else if (isUnanswered) {
    const prev = String(current.rows[0]?.last_call_status || '');
    const prevN = Number(prev.match(/^UNANSWERED:(\d+)/)?.[1] || 0);
    consecutive = prevN + 1;
  }

  const storeStatus = isUnanswered
    ? `UNANSWERED:${consecutive}`
    : String(params.callStatus || '').slice(0, 64);

  await pool.query(
    `UPDATE whatsapp_call_permissions
        SET last_call_id = $4, last_call_status = $5, updated_at = NOW()
      WHERE user_id = $1 AND instance_id = $2 AND wa_id = $3`,
    [params.userId, params.instanceId, params.waId, params.callId, storeStatus]
  );

  return { consecutiveUnanswered: consecutive };
}

async function fetchMetaCallPermission(params: {
  phoneNumberId: string;
  accessToken: string;
  waId: string;
}): Promise<{
  status: string | null;
  expirationTime: number | null;
  canStartCall: boolean;
  canRequestPermission: boolean;
} | null> {
  try {
    const url = `${META_GRAPH_BASE_URL}/${encodeURIComponent(params.phoneNumberId)}/call_permissions`;
    const res = await axios.get(url, {
      params: { user_wa_id: params.waId },
      headers: { Authorization: `Bearer ${params.accessToken}` },
      timeout: 20_000,
      validateStatus: () => true,
    });
    if (res.status >= 400) return null;
    const data = res.data as {
      permission?: { status?: string; expiration_time?: number };
      actions?: Array<{ action_name?: string; can_perform_action?: boolean }>;
    };
    const actions = Array.isArray(data.actions) ? data.actions : [];
    const start = actions.find((a) => a.action_name === 'start_call');
    const request = actions.find((a) => a.action_name === 'send_call_permission_request');
    return {
      status: data.permission?.status ? String(data.permission.status) : null,
      expirationTime:
        data.permission?.expiration_time != null && Number.isFinite(Number(data.permission.expiration_time))
          ? Number(data.permission.expiration_time)
          : null,
      canStartCall: start?.can_perform_action === true,
      canRequestPermission: request?.can_perform_action !== false,
    };
  } catch {
    return null;
  }
}

export async function resolveCallPermissionForContact(params: {
  userId: string;
  instanceId: string;
  waId: string;
  phoneNumberId?: string | null;
  accessToken?: string | null;
}): Promise<StoredCallPermission> {
  const pool = getPgPool();
  const local = await pool.query<{
    status: string;
    response: string | null;
    is_permanent: boolean;
    expires_at: Date | null;
    response_source: string | null;
    last_call_status: string | null;
  }>(
    `SELECT status, response, is_permanent, expires_at, response_source, last_call_status
       FROM whatsapp_call_permissions
      WHERE user_id = $1 AND instance_id = $2 AND wa_id = $3`,
    [params.userId, params.instanceId, params.waId]
  );
  const row = local.rows[0];
  let status: CallPermissionStatus = (row?.status as CallPermissionStatus) || 'no_permission';
  let expiresAt = row?.expires_at ?? null;
  const isPermanent = row?.is_permanent === true || status === 'permanent';

  if (status === 'temporary' && expiresAt && expiresAt.getTime() <= Date.now()) {
    status = 'no_permission';
  }

  let canStartCall = isPermissionActive({ status, isPermanent, expiresAt });
  let canRequestPermission = status !== 'permanent';
  let metaPermissionStatus: string | null = null;

  if (params.phoneNumberId && params.accessToken) {
    const meta = await fetchMetaCallPermission({
      phoneNumberId: params.phoneNumberId,
      accessToken: params.accessToken,
      waId: params.waId,
    });
    if (meta) {
      metaPermissionStatus = meta.status;
      canStartCall = meta.canStartCall;
      canRequestPermission = meta.canRequestPermission && meta.status !== 'permanent';
      if (meta.status === 'permanent' || meta.status === 'temporary' || meta.status === 'no_permission') {
        status = meta.status;
      }
      if (meta.expirationTime) {
        expiresAt = new Date(meta.expirationTime * 1000);
      }
    }
  }

  if (status === 'permanent') {
    canRequestPermission = false;
  }

  const consecutiveUnanswered = Number(
    String(row?.last_call_status || '').match(/^UNANSWERED:(\d+)/)?.[1] || 0
  );

  return {
    status,
    response: row?.response ?? null,
    isPermanent: status === 'permanent',
    expiresAt,
    responseSource: row?.response_source ?? null,
    canStartCall,
    canRequestPermission,
    metaPermissionStatus,
    consecutiveUnanswered,
  };
}

export function graphCallErrorMessage(error: unknown): string {
  return formatMetaGraphErrorMessage(error);
}
