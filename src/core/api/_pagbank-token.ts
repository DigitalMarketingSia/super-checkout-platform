import { decrypt, encrypt } from '../utils/cryptoUtils.js';

const OFFICIAL_CENTRAL_API_URL = 'https://bcmnryxjweiovrwmztpn.supabase.co/functions/v1';
const OFFICIAL_CENTRAL_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_TWNJjc7T2N9vCNkiBHaP9A_2XIgMgCF';
const REFRESH_URL_PRODUCTION = 'https://api.pagseguro.com/oauth2/refresh';
const REFRESH_URL_SANDBOX = 'https://sandbox.api.pagseguro.com/oauth2/refresh';
const PUBLIC_KEY_URL_PRODUCTION = 'https://api.pagseguro.com/public-keys';
const PUBLIC_KEY_URL_SANDBOX = 'https://sandbox.api.pagseguro.com/public-keys';
const ACCESS_TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;
const ACCESS_TOKEN_FALLBACK_GRACE_MS = 10 * 60 * 1000;

type PagbankEnvironment = 'production' | 'sandbox';

type GatewayLike = {
  id?: string | null;
  user_id?: string | null;
  private_key?: string | null;
  public_key?: string | null;
  config?: Record<string, any> | null;
  credentials?: Record<string, any> | null;
};

type ResolveSource =
  | 'manual_mode'
  | 'stored_token'
  | 'stored_token_fallback'
  | 'central_refresh'
  | 'local_refresh';

type RefreshResponse = {
  access_token: string;
  refresh_token?: string | null;
  expires_in?: number | null;
  scope?: string | null;
  token_type?: string | null;
  public_key?: string | null;
};

export type ResolvePagbankAccessTokenResult = {
  accessToken: string;
  environment: PagbankEnvironment;
  expiresAt: string | null;
  refreshed: boolean;
  source: ResolveSource;
};

function normalizeCentralApiUrl(value: string) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function uniqueNonEmpty(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function getCentralApiUrlCandidates() {
  return uniqueNonEmpty([
    process.env.CENTRAL_API_URL,
    process.env.VITE_CENTRAL_API_URL,
    process.env.NEXT_PUBLIC_CENTRAL_API_URL,
    OFFICIAL_CENTRAL_API_URL,
  ]).map(normalizeCentralApiUrl);
}

function getCentralInvokeKeyCandidates() {
  const configuredCandidates = uniqueNonEmpty([
    process.env.CENTRAL_SUPABASE_SECRET_KEY,
    process.env.CENTRAL_SUPABASE_SECRET_KEY_NEW,
    process.env.CENTRAL_SUPABASE_SERVICE_ROLE_KEY,
    process.env.CENTRAL_SUPABASE_SERVICE_ROLE_KEY_NEW,
    process.env.CENTRAL_SUPABASE_PUBLISHABLE_KEY,
    process.env.VITE_CENTRAL_SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_CENTRAL_SUPABASE_PUBLISHABLE_KEY,
    process.env.CENTRAL_SUPABASE_ANON_KEY,
    process.env.VITE_CENTRAL_SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_CENTRAL_SUPABASE_ANON_KEY,
  ]);

  const secretCandidates = configuredCandidates.filter((value) => value.startsWith('sb_secret_'));
  const publishableCandidates = configuredCandidates.filter((value) => value.startsWith('sb_publishable_'));
  const legacyCandidates = configuredCandidates.filter((value) => !value.startsWith('sb_secret_') && !value.startsWith('sb_publishable_'));

  return uniqueNonEmpty([
    ...secretCandidates,
    ...publishableCandidates,
    ...legacyCandidates,
    OFFICIAL_CENTRAL_SUPABASE_PUBLISHABLE_KEY,
  ]);
}

function withCentralInvokeAuthHeaders(fetchOptions: RequestInit, invokeKey: string): RequestInit {
  return {
    ...fetchOptions,
    headers: {
      ...((fetchOptions.headers as Record<string, string>) || {}),
      apikey: invokeKey,
      Authorization: `Bearer ${invokeKey}`,
    },
  };
}

function resolvePagbankEnvironment(gateway: GatewayLike): PagbankEnvironment {
  return gateway?.config?.environment === 'sandbox' ? 'sandbox' : 'production';
}

function decryptGatewaySecret(value: unknown) {
  const encryptedValue = typeof value === 'string' ? value.trim() : '';
  if (!encryptedValue) return '';
  try {
    return decrypt(encryptedValue).replace(/\s/g, '').trim();
  } catch {
    return '';
  }
}

function hasUsableToken(value: string) {
  return Boolean(value) && !String(value).startsWith('iv:');
}

function parseExpiresAt(value: unknown) {
  const rawValue = typeof value === 'string' ? value.trim() : '';
  if (!rawValue) return 0;
  const parsed = Date.parse(rawValue);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toExpiresAt(expiresIn?: number | null) {
  if (!(Number.isFinite(expiresIn) && Number(expiresIn) > 0)) return null;
  return new Date(Date.now() + Number(expiresIn) * 1000).toISOString();
}

function buildPagbankReconnectError(message: string) {
  return new Error(message);
}

function buildLocalPagbankConfig(environment: PagbankEnvironment) {
  const sandbox = environment === 'sandbox';
  const clientId = String(
    sandbox
      ? process.env.PAGSEGURO_SANDBOX_CLIENT_ID || process.env.PAGBANK_SANDBOX_CLIENT_ID || ''
      : process.env.PAGSEGURO_CLIENT_ID || process.env.PAGBANK_CLIENT_ID || '',
  ).trim();
  const clientSecret = String(
    sandbox
      ? process.env.PAGSEGURO_SANDBOX_CLIENT_SECRET || process.env.PAGBANK_SANDBOX_CLIENT_SECRET || ''
      : process.env.PAGSEGURO_CLIENT_SECRET || process.env.PAGBANK_CLIENT_SECRET || '',
  ).trim();
  const authorizationToken = String(
    sandbox
      ? process.env.PAGSEGURO_SANDBOX_AUTHORIZATION_TOKEN
        || process.env.PAGBANK_SANDBOX_AUTHORIZATION_TOKEN
        || process.env.PAGSEGURO_SANDBOX_INTEGRATOR_TOKEN
        || process.env.PAGBANK_SANDBOX_INTEGRATOR_TOKEN
        || ''
      : process.env.PAGSEGURO_AUTHORIZATION_TOKEN
        || process.env.PAGBANK_AUTHORIZATION_TOKEN
        || process.env.PAGSEGURO_INTEGRATOR_TOKEN
        || process.env.PAGBANK_INTEGRATOR_TOKEN
        || '',
  ).trim();

  const missingEnv: string[] = [];
  if (!clientId) missingEnv.push(sandbox ? 'PAGSEGURO_SANDBOX_CLIENT_ID' : 'PAGSEGURO_CLIENT_ID');
  if (!clientSecret) missingEnv.push(sandbox ? 'PAGSEGURO_SANDBOX_CLIENT_SECRET' : 'PAGSEGURO_CLIENT_SECRET');
  if (!authorizationToken) missingEnv.push(sandbox ? 'PAGSEGURO_SANDBOX_AUTHORIZATION_TOKEN' : 'PAGSEGURO_AUTHORIZATION_TOKEN');

  return {
    sandbox,
    clientId,
    clientSecret,
    authorizationToken,
    missingEnv,
  };
}

async function createPagbankPublicKey(accessToken: string, environment: PagbankEnvironment) {
  const url = environment === 'sandbox' ? PUBLIC_KEY_URL_SANDBOX : PUBLIC_KEY_URL_PRODUCTION;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'card' }),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`PUBLIC_KEY_FAILED:${response.status}:${raw.slice(0, 200)}`);
  }

  const payload = JSON.parse(raw || '{}');
  return String(payload?.public_key || payload?.publicKey || payload?.data?.public_key || '').trim();
}

async function refreshTokenLocally(params: {
  environment: PagbankEnvironment;
  refreshToken: string;
  regeneratePublicKey: boolean;
}) {
  const config = buildLocalPagbankConfig(params.environment);
  if (config.missingEnv.length > 0) {
    throw new Error(`LOCAL_REFRESH_CONFIG_MISSING:${config.missingEnv.join(',')}`);
  }

  const url = config.sandbox ? REFRESH_URL_SANDBOX : REFRESH_URL_PRODUCTION;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.authorizationToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      X_CLIENT_ID: config.clientId,
      X_CLIENT_SECRET: config.clientSecret,
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: params.refreshToken,
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`LOCAL_REFRESH_FAILED:${response.status}:${raw.slice(0, 200)}`);
  }

  const payload = JSON.parse(raw || '{}');
  const accessToken = String(payload?.access_token || '').trim();
  if (!accessToken) {
    throw new Error('LOCAL_REFRESH_INVALID_RESPONSE');
  }

  return {
    access_token: accessToken,
    refresh_token: typeof payload?.refresh_token === 'string' ? payload.refresh_token.trim() : null,
    expires_in: Number(payload?.expires_in || 0) || null,
    scope: typeof payload?.scope === 'string' ? payload.scope : null,
    token_type: typeof payload?.token_type === 'string' ? payload.token_type : null,
    public_key: params.regeneratePublicKey ? await createPagbankPublicKey(accessToken, params.environment) : null,
  } satisfies RefreshResponse;
}

async function refreshTokenViaCentral(params: {
  environment: PagbankEnvironment;
  refreshToken: string;
  regeneratePublicKey: boolean;
}) {
  const sharedSecret = String(process.env.CENTRAL_SHARED_SECRET || process.env.SHARED_SECRET || '').trim();
  if (!sharedSecret) {
    throw new Error('CENTRAL_SHARED_SECRET_MISSING');
  }

  const apiUrlCandidates = getCentralApiUrlCandidates();
  const invokeKeyCandidates = getCentralInvokeKeyCandidates();
  let lastError: Error | null = null;

  for (const apiUrl of apiUrlCandidates) {
    for (const invokeKey of invokeKeyCandidates) {
      try {
        const response = await fetch(
          `${apiUrl}/pagbank-oauth`,
          withCentralInvokeAuthHeaders({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-admin-secret': sharedSecret,
            },
            body: JSON.stringify({
              action: 'resolve_token',
              environment: params.environment,
              sandbox: params.environment === 'sandbox',
              refresh_token: params.refreshToken,
              regenerate_public_key: params.regeneratePublicKey,
            }),
          }, invokeKey),
        );

        const raw = await response.text();
        if (!response.ok) {
          lastError = new Error(`CENTRAL_REFRESH_FAILED:${response.status}:${raw.slice(0, 200)}`);
          continue;
        }

        const payload = JSON.parse(raw || '{}');
        const accessToken = String(payload?.access_token || '').trim();
        if (!accessToken) {
          lastError = new Error('CENTRAL_REFRESH_INVALID_RESPONSE');
          continue;
        }

        return {
          access_token: accessToken,
          refresh_token: typeof payload?.refresh_token === 'string' ? payload.refresh_token.trim() : null,
          expires_in: Number(payload?.expires_in || 0) || null,
          scope: typeof payload?.scope === 'string' ? payload.scope : null,
          token_type: typeof payload?.token_type === 'string' ? payload.token_type : null,
          public_key: typeof payload?.public_key === 'string' ? payload.public_key.trim() : null,
        } satisfies RefreshResponse;
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error || 'CENTRAL_REFRESH_UNAVAILABLE'));
      }
    }
  }

  throw lastError || new Error('CENTRAL_REFRESH_UNAVAILABLE');
}

async function persistGatewayOauthState(params: {
  supabaseAdmin: any;
  gateway: GatewayLike;
  response: RefreshResponse;
}) {
  const accessToken = String(params.response.access_token || '').trim();
  if (!accessToken) {
    throw new Error('PAGBANK_REFRESH_EMPTY_ACCESS_TOKEN');
  }

  const nextCredentials = {
    ...((params.gateway?.credentials || {}) as Record<string, any>),
    connected_via_oauth: true,
    oauth_refresh_token: params.response.refresh_token
      ? encrypt(params.response.refresh_token)
      : ((params.gateway?.credentials || {}) as Record<string, any>)?.oauth_refresh_token || null,
    oauth_expires_at: toExpiresAt(params.response.expires_in),
    oauth_scope: params.response.scope || ((params.gateway?.credentials || {}) as Record<string, any>)?.oauth_scope || null,
    oauth_token_type: params.response.token_type || ((params.gateway?.credentials || {}) as Record<string, any>)?.oauth_token_type || null,
  };

  const updatePayload: Record<string, unknown> = {
    private_key: encrypt(accessToken),
    credentials: nextCredentials,
  };

  const publicKey = typeof params.response.public_key === 'string' ? params.response.public_key.trim() : '';
  if (publicKey) {
    updatePayload.public_key = publicKey;
  }

  let query = params.supabaseAdmin
    .from('gateways')
    .update(updatePayload)
    .eq('id', params.gateway.id);

  if (params.gateway.user_id) {
    query = query.eq('user_id', params.gateway.user_id);
  }

  const { error } = await query;
  if (error) throw error;

  params.gateway.private_key = String(updatePayload.private_key || params.gateway.private_key || '');
  params.gateway.public_key = publicKey || params.gateway.public_key || '';
  params.gateway.credentials = nextCredentials;

  return {
    accessToken,
    expiresAt: nextCredentials.oauth_expires_at || null,
  };
}

export async function resolvePagbankAccessToken(params: {
  supabaseAdmin: any;
  gateway: GatewayLike;
  reason: 'payment' | 'status';
}) {
  const gateway = params.gateway || {};
  const credentials = (gateway.credentials && typeof gateway.credentials === 'object')
    ? gateway.credentials
    : {};
  const environment = resolvePagbankEnvironment(gateway);
  const currentAccessToken = decryptGatewaySecret(gateway.private_key);
  const refreshToken = decryptGatewaySecret(credentials.oauth_refresh_token);
  const expiresAt = typeof credentials.oauth_expires_at === 'string' ? credentials.oauth_expires_at : null;
  const expiresAtMs = parseExpiresAt(expiresAt);
  const connectedViaOauth = credentials.connected_via_oauth === true;
  const shouldRegeneratePublicKey = !String(gateway.public_key || '').trim();
  const shouldRefresh = connectedViaOauth
    && Boolean(refreshToken)
    && (
      shouldRegeneratePublicKey
      || !expiresAtMs
      || expiresAtMs <= Date.now() + ACCESS_TOKEN_REFRESH_SKEW_MS
    );

  if (!connectedViaOauth || !refreshToken) {
    if (hasUsableToken(currentAccessToken)) {
      return {
        accessToken: currentAccessToken,
        environment,
        expiresAt,
        refreshed: false,
        source: 'manual_mode',
      } satisfies ResolvePagbankAccessTokenResult;
    }

    throw buildPagbankReconnectError('A conta PagBank nao possui um token valido. Reconecte o gateway no admin.');
  }

  if (!shouldRefresh && hasUsableToken(currentAccessToken)) {
    return {
      accessToken: currentAccessToken,
      environment,
      expiresAt,
      refreshed: false,
      source: 'stored_token',
    } satisfies ResolvePagbankAccessTokenResult;
  }

  let refreshResponse: RefreshResponse | null = null;
  let refreshSource: 'central_refresh' | 'local_refresh' | null = null;
  let refreshError: Error | null = null;

  try {
    refreshResponse = await refreshTokenViaCentral({
      environment,
      refreshToken,
      regeneratePublicKey: shouldRegeneratePublicKey,
    });
    refreshSource = 'central_refresh';
  } catch (centralError: any) {
    refreshError = centralError instanceof Error ? centralError : new Error(String(centralError || 'CENTRAL_REFRESH_FAILED'));

    try {
      refreshResponse = await refreshTokenLocally({
        environment,
        refreshToken,
        regeneratePublicKey: shouldRegeneratePublicKey,
      });
      refreshSource = 'local_refresh';
      refreshError = null;
    } catch (localError: any) {
      refreshError = localError instanceof Error ? localError : refreshError;
    }
  }

  if (refreshResponse) {
    try {
      const persisted = await persistGatewayOauthState({
        supabaseAdmin: params.supabaseAdmin,
        gateway,
        response: refreshResponse,
      });

      return {
        accessToken: persisted.accessToken,
        environment,
        expiresAt: persisted.expiresAt,
        refreshed: true,
        source: refreshSource || 'central_refresh',
      } satisfies ResolvePagbankAccessTokenResult;
    } catch (persistError: any) {
      refreshError = persistError instanceof Error ? persistError : new Error(String(persistError || 'PAGBANK_REFRESH_PERSIST_FAILED'));
      console.error('[PagBankToken] Failed to persist refreshed OAuth state:', refreshError.message);
    }
  }

  if (hasUsableToken(currentAccessToken) && (!expiresAtMs || expiresAtMs + ACCESS_TOKEN_FALLBACK_GRACE_MS > Date.now())) {
    console.warn('[PagBankToken] Falling back to the currently stored token after refresh failure.', {
      reason: params.reason,
      environment,
      error: refreshError?.message || 'unknown',
    });

    return {
      accessToken: currentAccessToken,
      environment,
      expiresAt,
      refreshed: false,
      source: 'stored_token_fallback',
    } satisfies ResolvePagbankAccessTokenResult;
  }

  console.error('[PagBankToken] OAuth token resolution failed:', {
    reason: params.reason,
    environment,
    error: refreshError?.message || 'unknown',
  });

  throw buildPagbankReconnectError('A conexao PagBank expirou ou precisa ser reconectada no admin antes de processar novos pagamentos.');
}
