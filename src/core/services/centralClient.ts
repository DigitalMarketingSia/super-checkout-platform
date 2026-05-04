import { createClient } from '@supabase/supabase-js';
import { CENTRAL_CONFIG } from '../config/central';
import { getEnv } from '../utils/env';

const SUPABASE_URL = CENTRAL_CONFIG.API_URL.replace('/functions/v1', '');
const SUPABASE_ANON_KEY = getEnv('VITE_CENTRAL_SUPABASE_ANON_KEY') || '';

if (!SUPABASE_ANON_KEY) {
    throw new Error('Missing required env var VITE_CENTRAL_SUPABASE_ANON_KEY.');
}

export const CENTRAL_SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;

export const centralSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storageKey: 'sb-central-auth-token'
    }
});
