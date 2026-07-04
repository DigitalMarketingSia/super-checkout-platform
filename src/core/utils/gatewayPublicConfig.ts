const PRIVATE_GATEWAY_CONFIG_KEYS = new Set([
  'access_token',
  'refresh_token',
  'oauth_access_token',
  'oauth_refresh_token',
  'oauth_expires_in',
  'oauth_expires_at',
  'oauth_account_id',
  'connected_via_oauth',
  'oauth_scope',
  'oauth_token_type',
  'oauth_status',
  'oauth_last_refresh_attempt_at',
  'oauth_last_refresh_status',
  'oauth_last_refresh_source',
  'oauth_last_refresh_error',
  'oauth_last_refresh_error_code',
  'oauth_reconnect_required_at',
  'oauth_last_connected_at',
  'oauth_last_token_source',
  'oauth_last_disconnected_at',
  'client_secret',
  'authorization_token',
  'integrator_token',
]);

const PUBLIC_GATEWAY_CONFIG_KEYS = [
  'demo',
  'environment',
  'env',
  'max_installments',
  'maxInstallments',
  'min_installment_value',
  'minInstallmentValue',
  'interest_rate',
  'interestRate',
] as const;

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function stripGatewayPrivateConfig(config?: Record<string, any> | null): Record<string, any> {
  if (!isPlainObject(config)) return {};

  return Object.fromEntries(
    Object.entries(config).filter(([key]) => !PRIVATE_GATEWAY_CONFIG_KEYS.has(String(key || '').trim()))
  );
}

export function sanitizeGatewayPublicConfig(config?: Record<string, any> | null): Record<string, any> {
  const sanitized = stripGatewayPrivateConfig(config);
  const publicConfig: Record<string, any> = {};

  for (const key of PUBLIC_GATEWAY_CONFIG_KEYS) {
    const value = sanitized[key];
    if (value === undefined || value === null || value === '') continue;
    publicConfig[key] = value;
  }

  return publicConfig;
}
