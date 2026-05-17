/**
 * Helper padronizado para buscar variaveis de ambiente com a seguinte prioridade:
 * 1. Runtime ENV (injetado via window._env_ em tempo de execucao - ideal para Docker/Vercel)
 * 2. Build time ENV (Vite import.meta.env)
 * 3. LocalStorage (fallback apenas para chaves especificas do instalador)
 */
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
    || key.includes('PAYMENT_ENCRYPTION_KEY');
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
    for (const candidate of candidateKeys) {
      const value = (window as any)._env_[candidate];
      if (value) return resolveSupabasePublicKey(value);
    }
  }

  // 1.5. Override para desenvolvimento local (LocalStorage)
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    const isSupabaseKey = key.includes('SUPABASE');
    const isCentralKey = key.includes('CENTRAL_');
    if (isSupabaseKey && !isCentralKey) {
      const localKey = key.includes('URL') ? 'installer_supabase_url' :
        (key.includes('ANON') || key.includes('PUBLISHABLE')) ? 'installer_supabase_anon_key' :
          (key.includes('SERVICE') || key.includes('SECRET')) ? 'installer_supabase_service_key' : null;

      if (localKey) {
        const localVal = window.localStorage.getItem(localKey);
        if (localVal) {
          console.log(`[getEnv] Using local override for ${key}`);
          return localVal;
        }
      }
    }
  }

  // 2. Segunda prioridade: variaveis de build (Vite)
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    for (const candidate of candidateKeys) {
      if (isServerOnlyKey && (candidate.startsWith('VITE_') || candidate.startsWith('NEXT_PUBLIC_'))) {
        continue;
      }

      if (import.meta.env[candidate]) return resolveSupabasePublicKey(import.meta.env[candidate]);

      if (isServerOnlyKey) {
        continue;
      }

      const cleanKey = candidate.replace('VITE_', '');
      if (import.meta.env[cleanKey]) return resolveSupabasePublicKey(import.meta.env[cleanKey]);

      const nextKey = candidate.startsWith('VITE_') ? candidate.replace('VITE_', 'NEXT_PUBLIC_') : `NEXT_PUBLIC_${candidate}`;
      if (import.meta.env[nextKey]) return resolveSupabasePublicKey(import.meta.env[nextKey]);
    }
  }

  // 3. Fallback: LocalStorage (apenas em ambiente de navegador para o instalador)
  if (typeof window !== 'undefined') {
    if (key === 'VITE_LICENSE_KEY' || key === 'LICENSE_KEY') {
      const localLicense = window.localStorage.getItem('installer_license_key');
      if (localLicense) return localLicense;
    }

    const isSupabaseKey = key.includes('SUPABASE');
    const isCentralKey = key.includes('CENTRAL_');
    if (isSupabaseKey && !isCentralKey) {
      const localKey = key.includes('URL') ? 'installer_supabase_url' :
        (key.includes('ANON') || key.includes('PUBLISHABLE')) ? 'installer_supabase_anon_key' :
          (key.includes('SERVICE') || key.includes('SECRET')) ? 'installer_supabase_service_key' : null;

      if (localKey) {
        const localVal = window.localStorage.getItem(localKey);
        if (localVal) return localVal;
      }
    }
  }

  return undefined;
};
