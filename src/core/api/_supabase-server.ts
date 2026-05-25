import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const LOCAL_SUPABASE_URL_ENV_ORDER = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'VITE_SUPABASE_URL',
] as const;

const LOCAL_SUPABASE_PUBLIC_KEY_ENV_ORDER = [
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_ANON_KEY',
] as const;

const LOCAL_SUPABASE_SERVER_KEY_ENV_ORDER = [
  'SUPABASE_SECRET_KEY_NEW',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY_NEW',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

const LOCAL_SUPABASE_SERVER_KEY_FAILURES = [
  'invalid api key',
  'legacy api keys are disabled',
  'permission denied for table users',
  'permission denied for relation users',
  'permission denied for schema auth',
] as const;

function readFirstEnv(names: readonly string[]) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }

  return '';
}

export function getLocalSupabaseUrl() {
  return readFirstEnv(LOCAL_SUPABASE_URL_ENV_ORDER);
}

export function getLocalSupabasePublicConfig() {
  return {
    supabaseUrl: getLocalSupabaseUrl(),
    publicKey: readFirstEnv(LOCAL_SUPABASE_PUBLIC_KEY_ENV_ORDER),
  };
}

export function getLocalSupabaseServerKeyCandidates() {
  const seen = new Set<string>();
  const candidates: Array<{ source: string; value: string }> = [];

  for (const source of LOCAL_SUPABASE_SERVER_KEY_ENV_ORDER) {
    const value = String(process.env[source] || '').trim();
    if (!value || seen.has(value)) continue;

    seen.add(value);
    candidates.push({ source, value });
  }

  return candidates;
}

export function getLocalSupabaseServerConfig() {
  const [firstCandidate] = getLocalSupabaseServerKeyCandidates();

  return {
    supabaseUrl: getLocalSupabaseUrl(),
    serverKey: firstCandidate?.value || '',
    serverKeySource: firstCandidate?.source || null,
  };
}

export function createLocalSupabaseServerClient(serverKey?: string): SupabaseClient | null {
  const supabaseUrl = getLocalSupabaseUrl();
  const key = String(serverKey || getLocalSupabaseServerConfig().serverKey || '').trim();
  if (!supabaseUrl || !key) return null;

  return createClient(supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function getLocalSupabaseServerKeyErrorMessage() {
  return 'As credenciais server-side do Supabase estao desatualizadas apos a rotacao. Revise SUPABASE_SECRET_KEY na Vercel e redeploye o app.';
}

export function isLocalSupabaseServerKeyFailure(
  errorLike: { message?: string | null; details?: string | null; hint?: string | null } | string | null | undefined,
) {
  const normalized = typeof errorLike === 'string'
    ? errorLike.toLowerCase()
    : `${errorLike?.message || ''} ${errorLike?.details || ''} ${errorLike?.hint || ''}`.toLowerCase();

  return LOCAL_SUPABASE_SERVER_KEY_FAILURES.some((fragment) => normalized.includes(fragment));
}

export async function resolveLocalSupabaseServerClient() {
  const supabaseUrl = getLocalSupabaseUrl();
  if (!supabaseUrl) {
    return {
      supabase: null,
      serverKeySource: null,
      probeError: null,
    };
  }

  let lastFailure: { message?: string | null; details?: string | null; hint?: string | null } | null = null;

  for (const candidate of getLocalSupabaseServerKeyCandidates()) {
    const supabase = createLocalSupabaseServerClient(candidate.value);
    if (!supabase) continue;

    const { error } = await supabase
      .from('profiles')
      .select('id')
      .limit(1);

    if (!error || !isLocalSupabaseServerKeyFailure(error)) {
      return {
        supabase,
        serverKeySource: candidate.source,
        probeError: error || null,
      };
    }

    lastFailure = error;
  }

  return {
    supabase: null,
    serverKeySource: null,
    probeError: lastFailure,
  };
}

export async function validateLocalUserWithPublicKey(jwt: string) {
  const { supabaseUrl, publicKey } = getLocalSupabasePublicConfig();
  if (!supabaseUrl || !publicKey || !jwt) return null;

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: publicKey,
      Authorization: `Bearer ${jwt}`,
    },
  });

  if (!response.ok) return null;
  const user = await response.json();
  return user?.id ? user : null;
}
