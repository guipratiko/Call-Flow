import axios from 'axios';

type MetaErrorDetail = {
  message?: string;
  code?: number;
  error_subcode?: number;
  error_user_msg?: string;
  error_user_title?: string;
};

/** Mensagem amigável + mapeamento de códigos Calling (1380xx). */
export function formatMetaGraphErrorMessage(error: unknown): string {
  let detail: MetaErrorDetail | undefined;
  if (axios.isAxiosError(error)) {
    detail = (error.response?.data as { error?: MetaErrorDetail } | undefined)?.error;
  } else if (error && typeof error === 'object' && 'error' in error) {
    detail = (error as { error?: MetaErrorDetail }).error;
  } else if (error && typeof error === 'object' && 'message' in (error as object)) {
    const maybe = error as MetaErrorDetail & { error?: MetaErrorDetail };
    detail = maybe.error || maybe;
  }

  if (!detail) {
    if (error instanceof Error) return error.message;
    return 'Erro na API da Meta';
  }

  const code = detail.code;
  const callingHints: Record<number, string> = {
    138006: 'Sem permissão ativa para ligar. Peça autorização ao contacto primeiro.',
    138009: 'Limite de pedidos de permissão atingido (Meta: 1/24h, 2/7 dias). Aguarde ou conecte uma chamada.',
    138012: 'Limite diário de ligações iniciadas pelo negócio atingido (Meta). Tente amanhã.',
    138014: 'Calling temporariamente desativado neste número por baixa qualidade (Meta).',
    138017: 'Já existe permissão permanente; não é necessário pedir de novo.',
    138005: 'Limite de taxa de ligações atingido. Aguarde e tente novamente.',
    138002: 'Limite de chamadas simultâneas atingido.',
  };
  if (code != null && callingHints[code]) return callingHints[code];

  return (
    detail.error_user_msg ||
    detail.error_user_title ||
    detail.message ||
    `Erro Graph${code != null ? ` #${code}` : ''}`
  );
}
