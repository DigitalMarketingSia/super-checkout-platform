/**
 * Helper padronizado para buscar variáveis de ambiente com a seguinte prioridade:
 * 1. Runtime ENV (injetado via window._env_ em tempo de execução - ideal para Docker/Vercel)
 * 2. Build time ENV (Vite import.meta.env)
 * 3. LocalStorage (Fallback apenas para chaves específicas do instalador)
 */
export const getEnv = (key: string): string | undefined => {
  // 1. Prioridade Máxima: Injeção em tempo de execução (window._env_)
  if (typeof window !== 'undefined' && (window as any)._env_ && (window as any)._env_[key]) {
    return (window as any)._env_[key];
  }

  // 1.5. Override para Desenvolvimento Local (LocalStorage)
  // Se estivermos no localhost, permitimos que o LocalStorage sobrescreva o .env.local
  // Isso evita o loop infinito no Modal de Setup quando as chaves do .env estão erradas.
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    const isSupabaseKey = key.includes('SUPABASE');
    if (isSupabaseKey) {
      const localKey = key.includes('URL') ? 'installer_supabase_url' :
        key.includes('ANON') ? 'installer_supabase_anon_key' :
          key.includes('SERVICE') ? 'installer_supabase_service_key' : null;

      if (localKey) {
        const localVal = window.localStorage.getItem(localKey);
        if (localVal) {
          console.log(`[getEnv] Using local override for ${key}`);
          return localVal;
        }
      }
    }
  }

  // 2. Segunda Prioridade: Variáveis de Build (Vite)
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    if (import.meta.env[key]) return import.meta.env[key];
    
    // Tenta sem o prefixo VITE_
    const cleanKey = key.replace('VITE_', '');
    if (import.meta.env[cleanKey]) return import.meta.env[cleanKey];

    // Tenta com prefixo NEXT_PUBLIC_ (comum na Vercel)
    const nextKey = key.startsWith('VITE_') ? key.replace('VITE_', 'NEXT_PUBLIC_') : `NEXT_PUBLIC_${key}`;
    if (import.meta.env[nextKey]) return import.meta.env[nextKey];
  }

  // 3. Fallback: LocalStorage (Apenas em ambiente de navegador para o instalador)
  if (typeof window !== 'undefined') {
    if (key === 'VITE_LICENSE_KEY' || key === 'LICENSE_KEY') {
      const localLicense = window.localStorage.getItem('installer_license_key');
      if (localLicense) return localLicense;
    }

    const isSupabaseKey = key.includes('SUPABASE');
    if (isSupabaseKey) {
      const localKey = key.includes('URL') ? 'installer_supabase_url' :
        key.includes('ANON') ? 'installer_supabase_anon_key' :
          key.includes('SERVICE') ? 'installer_supabase_service_key' : null;

      if (localKey) {
        const localVal = window.localStorage.getItem(localKey);
        if (localVal) return localVal;
      }
    }
  }

  return undefined;
};
