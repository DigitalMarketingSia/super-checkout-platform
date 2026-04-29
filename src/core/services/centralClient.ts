import { createClient } from '@supabase/supabase-js';
import { CENTRAL_CONFIG } from '../config/central';
import { getEnv } from '../utils/env';

const SUPABASE_URL = CENTRAL_CONFIG.API_URL.replace('/functions/v1', '');
const DEFAULT_CENTRAL_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjbW5yeXhqd2Vpb3Zyd216dHBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2NjM2MjMsImV4cCI6MjA4MzIzOTYyM30.F86wf0xwTR1K_P9500JwnESStPb2bCo3dwuouHBPcQM';
const SUPABASE_ANON_KEY = getEnv('VITE_CENTRAL_SUPABASE_ANON_KEY') || DEFAULT_CENTRAL_SUPABASE_ANON_KEY;

if (!getEnv('VITE_CENTRAL_SUPABASE_ANON_KEY')) {
    console.warn('VITE_CENTRAL_SUPABASE_ANON_KEY is missing; using the public Central anon fallback.');
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
