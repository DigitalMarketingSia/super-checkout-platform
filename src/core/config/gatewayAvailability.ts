// PagBank remains in the repository only as a non-operational archive. Reactivation
// requires a new provider approval, threat review and coordinated server rollout;
// it must never be enabled by an environment variable or a UI-only change.
export const PAGBANK_GATEWAY_STATUS = 'retired_pending_reapproval' as const;
export const PAGBANK_GATEWAY_ENABLED = false;

const PAGBANK_PROVIDER_NAMES = new Set(['pagbank', 'pagseguro']);

export function isRetiredGatewayProvider(value: unknown) {
  const provider = String(value || '').trim().toLowerCase();
  return !PAGBANK_GATEWAY_ENABLED && PAGBANK_PROVIDER_NAMES.has(provider);
}

export const RETIRED_GATEWAY_RESPONSE = {
  error: 'Gateway retired',
  code: 'GATEWAY_RETIRED',
} as const;
