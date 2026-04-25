
import { createClient } from '@supabase/supabase-js';

import { getEnv } from '../utils/env';

const SUPABASE_URL = getEnv('VITE_SUPABASE_URL');
const SUPABASE_ANON_KEY = getEnv('VITE_SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY');

// Initialize with valid keys OR dummy values to prevent crash
// If keys are missing, the client will fail network requests but the UI can still load (for Installer)
const finalUrl = SUPABASE_URL || 'https://placeholder.supabase.co';
const finalKey = (typeof window === 'undefined' && SUPABASE_SERVICE_KEY) ? SUPABASE_SERVICE_KEY : (SUPABASE_ANON_KEY || 'placeholder-key');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[Supabase] Credenciais não encontradas. O app pode estar em modo de Instalação.');
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
      storage: customStorage, // Use custom storage to avoid locking
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    // Explicitly set realtime options to fallback to polling if websockets fail
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    },
    // Force Fetch implementation to ensure proper header handling on Vercel/proxies
    global: {
      fetch: (input, init?) => fetch(input, init)
    }
  };

export const supabase = createClient(finalUrl, finalKey, clientOptions);
export const CLIENT_INSTANCE_ID = `instance_${Math.random().toString(36).slice(2, 9)}`;
console.log('[Supabase Service] Initialized client:', CLIENT_INSTANCE_ID);
