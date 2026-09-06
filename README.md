# Call-Flow

Microserviço OnlyFlow para **WhatsApp Cloud Calling API** (permissão + VoIP business-initiated).

## Planos

Disponível apenas para **Pro** e **Enterprise** (header `x-onlyflow-premium-plan` + gate no Backend).

## Rotas (via Backend proxy)

Mantidas em `/api/crm/contacts/:contactId/whatsapp-call*` (Backend encaminha para este serviço).

Internas (chave `x-onlyflow-internal-key`):

- `POST /api/internal/call-flow/webhook/call-permission`
- `POST /api/internal/call-flow/webhook/calls`

## Env

Ver `.env.example`. Porta padrão **4348**.
