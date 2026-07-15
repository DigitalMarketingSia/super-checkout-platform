import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const SETUP_BOOTSTRAP_KEYS = {
  tokenHash: 'setup_bootstrap_token_hash',
  expiresAt: 'setup_bootstrap_expires_at',
  installationId: 'setup_bootstrap_installation_id',
  centralUserId: 'setup_bootstrap_central_user_id',
  domain: 'setup_bootstrap_domain',
  issuedAt: 'setup_bootstrap_issued_at',
} as const;

type SetupBootstrapState = {
  tokenHash: string | null;
  expiresAt: string | null;
  installationId: string | null;
  centralUserId: string | null;
  domain: string | null;
  issuedAt: string | null;
};

function parseConfigValue(value: any) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed.replace(/^"(.*)"$/, '$1');
  }
}

function sha256Hex(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function equalsHash(left: string, right: string) {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function normalizeBootstrapDomain(value: unknown) {
  const hostname = String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .split(':')[0]
    .toLowerCase();

  if (!hostname || !/^[a-z0-9.-]+$/.test(hostname) || hostname.startsWith('.') || hostname.endsWith('.')) {
    return '';
  }

  return hostname;
}

async function upsertAppConfigEntries(supabase: any, entries: Record<string, unknown>) {
  const payload = Object.entries(entries).map(([key, value]) => ({
    key,
    value: value ?? '',
  }));

  const { error } = await supabase
    .from('app_config')
    .upsert(payload, { onConflict: 'key' });

  if (error) throw error;
}

export async function readSetupBootstrapState(supabase: any): Promise<SetupBootstrapState> {
  const { data, error } = await supabase
    .from('app_config')
    .select('key, value')
    .in('key', Object.values(SETUP_BOOTSTRAP_KEYS));

  if (error) throw error;

  const config = new Map<string, any>();
  for (const row of data || []) {
    config.set(row.key, parseConfigValue(row.value));
  }

  return {
    tokenHash: typeof config.get(SETUP_BOOTSTRAP_KEYS.tokenHash) === 'string'
      ? config.get(SETUP_BOOTSTRAP_KEYS.tokenHash)
      : null,
    expiresAt: typeof config.get(SETUP_BOOTSTRAP_KEYS.expiresAt) === 'string'
      ? config.get(SETUP_BOOTSTRAP_KEYS.expiresAt)
      : null,
    installationId: typeof config.get(SETUP_BOOTSTRAP_KEYS.installationId) === 'string'
      ? config.get(SETUP_BOOTSTRAP_KEYS.installationId)
      : null,
    centralUserId: typeof config.get(SETUP_BOOTSTRAP_KEYS.centralUserId) === 'string'
      ? config.get(SETUP_BOOTSTRAP_KEYS.centralUserId)
      : null,
    domain: typeof config.get(SETUP_BOOTSTRAP_KEYS.domain) === 'string'
      ? config.get(SETUP_BOOTSTRAP_KEYS.domain)
      : null,
    issuedAt: typeof config.get(SETUP_BOOTSTRAP_KEYS.issuedAt) === 'string'
      ? config.get(SETUP_BOOTSTRAP_KEYS.issuedAt)
      : null,
  };
}

export async function persistInstallationIdConfig(supabase: any, installationId: string) {
  await upsertAppConfigEntries(supabase, {
    installation_id: installationId,
  });
}

export async function issueSetupBootstrapToken(supabase: any, params: {
  installationId: string;
  centralUserId?: string | null;
  domain?: string | null;
  ttlMinutes?: number;
}) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + (params.ttlMinutes || 60) * 60 * 1000).toISOString();
  const normalizedDomain = normalizeBootstrapDomain(params.domain);

  await upsertAppConfigEntries(supabase, {
    [SETUP_BOOTSTRAP_KEYS.tokenHash]: sha256Hex(token),
    [SETUP_BOOTSTRAP_KEYS.expiresAt]: expiresAt,
    [SETUP_BOOTSTRAP_KEYS.installationId]: params.installationId,
    [SETUP_BOOTSTRAP_KEYS.centralUserId]: params.centralUserId || null,
    [SETUP_BOOTSTRAP_KEYS.domain]: normalizedDomain || null,
    [SETUP_BOOTSTRAP_KEYS.issuedAt]: new Date().toISOString(),
    installation_id: params.installationId,
  });

  return {
    token,
    expiresAt,
    domain: normalizedDomain || null,
  };
}

export async function clearSetupBootstrapToken(supabase: any) {
  const { error } = await supabase
    .from('app_config')
    .delete()
    .in('key', [
      SETUP_BOOTSTRAP_KEYS.tokenHash,
      SETUP_BOOTSTRAP_KEYS.expiresAt,
      SETUP_BOOTSTRAP_KEYS.domain,
      SETUP_BOOTSTRAP_KEYS.issuedAt,
    ]);

  if (error) throw error;
}

export async function validateSetupBootstrapToken(supabase: any, token: string, expectedDomain?: string | null) {
  const state = await readSetupBootstrapState(supabase);
  const normalizedExpectedDomain = normalizeBootstrapDomain(expectedDomain);

  if (!token || !state.tokenHash || !state.installationId || !state.expiresAt) {
    return {
      valid: false,
      reason: 'missing_bootstrap_state',
      state,
    };
  }

  const tokenHash = sha256Hex(token);
  if (!equalsHash(tokenHash, state.tokenHash)) {
    return {
      valid: false,
      reason: 'token_mismatch',
      state,
    };
  }

  if (new Date(state.expiresAt).getTime() <= Date.now()) {
    return {
      valid: false,
      reason: 'token_expired',
      state,
    };
  }

  if (state.domain && normalizedExpectedDomain && state.domain !== normalizedExpectedDomain) {
    return {
      valid: false,
      reason: 'domain_mismatch',
      state,
    };
  }

  return {
    valid: true,
    reason: null,
    state,
  };
}
