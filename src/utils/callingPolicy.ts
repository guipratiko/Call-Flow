/**
 * Países onde business-initiated calling não está disponível (Meta).
 * Baseado no country code do número do negócio.
 */
const BLOCKED_BIC_PREFIXES = [
  { prefix: '234', label: 'Nigéria' },
  { prefix: '84', label: 'Vietnã' },
  { prefix: '20', label: 'Egito' },
  { prefix: '1', label: 'EUA/Canadá' },
];

export function isBusinessInitiatedCallingBlocked(
  displayPhoneNumber: string | null | undefined
): { blocked: boolean; reason: string | null } {
  const digits = String(displayPhoneNumber || '').replace(/\D/g, '');
  if (!digits) return { blocked: false, reason: null };
  for (const row of BLOCKED_BIC_PREFIXES) {
    if (digits.startsWith(row.prefix)) {
      return {
        blocked: true,
        reason: `Ligações iniciadas pelo negócio não estão disponíveis para números de ${row.label} (política Meta).`,
      };
    }
  }
  return { blocked: false, reason: null };
}

/** Janela de atendimento Cloud API: 24h após última mensagem do cliente. */
export function isWithinCustomerServiceWindow(lastCustomerMessageAt: string | Date | null | undefined): boolean {
  if (!lastCustomerMessageAt) return false;
  const ms = new Date(lastCustomerMessageAt).getTime();
  if (!Number.isFinite(ms)) return false;
  return Date.now() - ms < 24 * 60 * 60 * 1000;
}
