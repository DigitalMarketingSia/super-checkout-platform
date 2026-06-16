import { CENTRAL_CONFIG } from '../config/central';
import { CENTRAL_SUPABASE_ANON_KEY, centralSupabase } from './centralClient';
import type { DemoWorkspaceResponse } from '../types/demoWorkspace';

const CACHE_KEY = 'demo_workspace_snapshot';

const cacheWorkspace = (payload: DemoWorkspaceResponse) => {
    if (typeof window === 'undefined') return;

    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
};

const getAuthHeaders = async () => {
    const { data: { session } } = await centralSupabase.auth.getSession();
    const accessToken = session?.access_token || '';

    if (!accessToken || !CENTRAL_SUPABASE_ANON_KEY) {
        throw new Error('Sua sessao demo nao esta pronta. Volte ao portal e abra o demo novamente.');
    }

    return {
        'Content-Type': 'application/json',
        apikey: CENTRAL_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
    };
};

const invokeDemoWorkspace = async (action: string): Promise<DemoWorkspaceResponse> => {
    const response = await fetch(`${CENTRAL_CONFIG.API_URL}/demo-workspace`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ action }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Nao foi possivel carregar o workspace demo.');
    }

    cacheWorkspace(payload as DemoWorkspaceResponse);
    return payload as DemoWorkspaceResponse;
};

export const demoWorkspaceService = {
    async ensureWorkspace(): Promise<DemoWorkspaceResponse> {
        return invokeDemoWorkspace('ensure_workspace');
    },

    async getWorkspace(): Promise<DemoWorkspaceResponse> {
        return invokeDemoWorkspace('get_workspace');
    },

    async resetWorkspace(): Promise<DemoWorkspaceResponse> {
        return invokeDemoWorkspace('reset_workspace');
    },

    async touchWorkspace(): Promise<DemoWorkspaceResponse> {
        return invokeDemoWorkspace('touch_workspace');
    },

    getCachedWorkspace(): DemoWorkspaceResponse | null {
        if (typeof window === 'undefined') return null;

        try {
            const raw = window.sessionStorage.getItem(CACHE_KEY);
            return raw ? JSON.parse(raw) as DemoWorkspaceResponse : null;
        } catch {
            return null;
        }
    },
};
