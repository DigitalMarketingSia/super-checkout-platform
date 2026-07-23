/**
 * Helper padronizado para buscar variaveis de ambiente com a seguinte prioridade:
 * 1. Runtime ENV (injetado via window._env_ em tempo de execucao - ideal para Docker/Vercel)
 * 2. Build time ENV (Vite import.meta.env, apenas allowlist publica)
 * 3. LocalStorage (fallback apenas para configuracao publica do instalador)
 */
const PUBLIC_BUILD_ENV: Record<string, string | undefined> = {
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_URL: import.meta.env.NEXT_PUBLIC_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  VITE_CENTRAL_SUPABASE_ANON_KEY: import.meta.env.VITE_CENTRAL_SUPABASE_ANON_KEY,
  VITE_CENTRAL_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_CENTRAL_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_CENTRAL_SUPABASE_ANON_KEY: import.meta.env.NEXT_PUBLIC_CENTRAL_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_CENTRAL_SUPABASE_PUBLISHABLE_KEY: import.meta.env.NEXT_PUBLIC_CENTRAL_SUPABASE_PUBLISHABLE_KEY,
  VITE_CENTRAL_API_URL: import.meta.env.VITE_CENTRAL_API_URL,
  VITE_TURNSTILE_SITE_KEY: import.meta.env.VITE_TURNSTILE_SITE_KEY,
  VITE_ENABLE_SUPABASE_AUTH_CAPTCHA: import.meta.env.VITE_ENABLE_SUPABASE_AUTH_CAPTCHA,
  VITE_GITHUB_UPDATE_APP_SLUG: import.meta.env.VITE_GITHUB_UPDATE_APP_SLUG,
  VITE_GITHUB_UPDATE_APP_INSTALL_URL: import.meta.env.VITE_GITHUB_UPDATE_APP_INSTALL_URL,
  VITE_UPDATE_SOURCE_REPOSITORY: import.meta.env.VITE_UPDATE_SOURCE_REPOSITORY,
};

export const getEnv = (key: string): string | undefined => {
  const aliases: Record<string, string[]> = {
    VITE_SUPABASE_ANON_KEY: ['VITE_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLISHABLE_KEY'],
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLISHABLE_KEY'],
    SUPABASE_ANON_KEY: ['SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
    SUPABASE_SERVICE_ROLE_KEY: ['SUPABASE_SECRET_KEY'],
    VITE_CENTRAL_SUPABASE_ANON_KEY: ['VITE_CENTRAL_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_CENTRAL_SUPABASE_PUBLISHABLE_KEY', 'CENTRAL_SUPABASE_PUBLISHABLE_KEY'],
    CENTRAL_SUPABASE_ANON_KEY: ['CENTRAL_SUPABASE_PUBLISHABLE_KEY', 'VITE_CENTRAL_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_CENTRAL_SUPABASE_PUBLISHABLE_KEY'],
    CENTRAL_SUPABASE_SERVICE_ROLE_KEY: ['CENTRAL_SUPABASE_SECRET_KEY'],
  };
  const aliasKeys = aliases[key] || [];
  const prefersPublishableKey = key.includes('SUPABASE') && key.includes('ANON');
  const candidateKeys = prefersPublishableKey ? [...aliasKeys, key] : [key, ...aliasKeys];
  const isSupabasePublicClientKey = key.includes('SUPABASE') && (key.includes('ANON') || key.includes('PUBLISHABLE'));
  const isServerOnlyKey =
    key.includes('SERVICE_ROLE')
    || key.endsWith('_SECRET_KEY')
    || key.includes('PRIVATE_KEY')
    || key.includes('PAYMENT_ENCRYPTION_KEY')
    || key === 'LICENSE_KEY'
    || key === 'MASTER_LICENSE_KEY';
  const getStoredPublishableKey = (): string | undefined => {
    if (typeof window === 'undefined' || !isSupabasePublicClientKey || key.includes('CENTRAL_')) {
      return undefined;
    }

    const localVal = window.localStorage.getItem('installer_supabase_anon_key');
    return localVal?.startsWith('sb_publishable_') ? localVal : undefined;
  };
  const resolveSupabasePublicKey = (value: unknown): string => {
    const current = String(value);
    if (!isSupabasePublicClientKey || current.startsWith('sb_publishable_')) {
      return current;
    }

    return getStoredPublishableKey() || current;
  };

  // 1. Prioridade maxima: injecao em tempo de execucao (window._env_)
  if (typeof window !== 'undefined' && (window as any)._env_) {
    if (isServerOnlyKey) {
      return undefined;
    }

    for (const candidate of candidateKeys) {
      const value = (window as any)._env_[candidate];
      if (value) return resolveSupabasePublicKey(value);
    }
  }

  // 1.5. Override para desenvolvimento local (LocalStorage)
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    const isSupabaseKey = key.includes('SUPABASE');
    const isCentralKey = key.includes('CENTRAL_');
    if (isSupabaseKey && !isCentralKey && !isServerOnlyKey) {
      const localKey = key.includes('URL') ? 'installer_supabase_url' :
        (key.includes('ANON') || key.includes('PUBLISHABLE')) ? 'installer_supabase_anon_key' :
          null;

      if (localKey) {
        const localVal = window.localStorage.getItem(localKey);
        if (localVal) {
          console.log(`[getEnv] Using local override for ${key}`);
          return localVal;
        }
      }
    }
  }

  // 2. Segunda prioridade: variaveis de build explicitamente publicas.
  // Nunca indexe import.meta.env dinamicamente: isso faz o Vite serializar todas
  // as variaveis publicas, inclusive uma chave marcada acidentalmente como VITE_.
  if (!isServerOnlyKey) {
    for (const candidate of candidateKeys) {
      const value = PUBLIC_BUILD_ENV[candidate];
      if (value) return resolveSupabasePublicKey(value);
    }
  }

  // 3. Fallback: LocalStorage (apenas configuracao publica do instalador)
  if (typeof window !== 'undefined') {
    const isSupabaseKey = key.includes('SUPABASE');
    const isCentralKey = key.includes('CENTRAL_');
    if (isSupabaseKey && !isCentralKey && !isServerOnlyKey) {
      const localKey = key.includes('URL') ? 'installer_supabase_url' :
        (key.includes('ANON') || key.includes('PUBLISHABLE')) ? 'installer_supabase_anon_key' :
          null;

      if (localKey) {
        const localVal = window.localStorage.getItem(localKey);
        if (localVal) return localVal;
      }
    }
  }

  return undefined;
};
