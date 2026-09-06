import axios from 'axios';
import { ONLYFLOW_BACKEND_CONFIG } from '../config/onlyflowBackend';
import { HttpError } from '../middleware/errorHandler';

export type CallContactContext = {
  contactId: string;
  contactName: string;
  userId: string;
  instanceId: string;
  integration: string;
  phone: string;
  waId: string;
  lastCustomerMessageAt: string | null;
  phoneNumberId: string;
  accessToken: string;
  displayPhoneNumber: string | null;
};

export async function fetchCallContactContext(
  tenantUserId: string,
  contactId: string
): Promise<CallContactContext> {
  const base = ONLYFLOW_BACKEND_CONFIG.BASE_URL;
  if (!base) {
    throw new HttpError(503, 'ONLYFLOW_API_BASE_URL não configurada no Call-Flow.');
  }
  const url = `${base}/api/internal/call-flow/contact-context/${encodeURIComponent(contactId)}`;
  const res = await axios.get(url, {
    params: { userId: tenantUserId },
    headers: { 'x-onlyflow-internal-key': ONLYFLOW_BACKEND_CONFIG.INTERNAL_KEY },
    timeout: ONLYFLOW_BACKEND_CONFIG.HTTP_TIMEOUT_MS,
    validateStatus: () => true,
  });
  if (res.status === 404) {
    throw new HttpError(404, 'Contato não encontrado.');
  }
  if (res.status >= 400) {
    const msg =
      (res.data as { message?: string })?.message ||
      `Backend recusou contexto de chamada (${res.status}).`;
    throw new HttpError(res.status >= 500 ? 502 : res.status, msg);
  }
  const data = (res.data as { data?: CallContactContext })?.data;
  if (!data?.contactId || !data.phoneNumberId || !data.accessToken || !data.waId) {
    throw new HttpError(502, 'Contexto de chamada incompleto no Backend.');
  }
  return data;
}
