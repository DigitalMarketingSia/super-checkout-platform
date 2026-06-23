import { createClient } from '@supabase/supabase-js';

import { getEnv } from '../utils/env';

const SUPABASE_URL = getEnv('VITE_SUPABASE_URL');
const SUPABASE_ANON_KEY = getEnv('VITE_SUPABASE_ANON_KEY') || getEnv('VITE_SUPABASE_PUBLISHABLE_KEY');
const SUPABASE_SERVICE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY');

// Initialize with valid keys OR dummy values to prevent crash
// If keys are missing, the client will fail network requests but the UI can still load (for Installer)
const finalUrl = SUPABASE_URL || 'https://placeholder.supabase.co';
const finalPublicKey = SUPABASE_ANON_KEY || 'placeholder-key';
const finalKey = (typeof window === 'undefined' && SUPABASE_SERVICE_KEY) ? SUPABASE_SERVICE_KEY : finalPublicKey;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[Supabase] Credenciais nao encontradas. O app pode estar em modo de Instalacao.');
}

// Custom storage adapter to bypass navigator.locks which causes deadlocks in some environments
const customStorage = {
  getItem: (key: string): string | null => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  },
  setItem: (key: string, value: string): void => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
  },
  removeItem: (key: string): void => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
  },
};

const browserGlobalOptions = typeof window === 'undefined'
  ? {}
  : {
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init)
    }
  };

// Configure client based on environment
const clientOptions = typeof window === 'undefined'
  ? {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  }
  : {
    auth: {
      persistSession: true,
      storage: customStorage,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    },
    ...browserGlobalOptions,
  };

const publicClientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  ...browserGlobalOptions,
};

export const supabase = createClient(finalUrl, finalKey, clientOptions);
export const publicSupabase = createClient(finalUrl, finalPublicKey, publicClientOptions);
export const CLIENT_INSTANCE_ID = `instance_${Math.random().toString(36).slice(2, 9)}`;
console.log('[Supabase Service] Initialized client:', CLIENT_INSTANCE_ID);