import { CENTRAL_CONFIG } from '../config/central';

export interface License {
    key: string;
    client_name: string;
    client_email: string;
    plan: string;
    status: 'active' | 'suspended';
    max_instances: number;
    created_at: string;
    allowed_domain?: string;
    current_domain?: string;
    has_unlimited_domains?: boolean;
    has_partner_panel?: boolean;
}

export interface LicensesResponse {
    data: License[];
    meta: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

export interface Installation {
    id: string;
    license_key: string;
    installation_id: string;
    domain: string;
    status: string;
    installed_at: string;
    last_check_in: string;
}

export interface LicenseFeature {
    id: string;
    license_key: string;
    feature_key: string;
    is_enabled: boolean;
    settings: any;
}

export interface PartnerOpportunityVisibility {
    partner_opportunity_enabled: boolean;
    plan_type: string | null;
    account_id: string | null;
}

export interface CreateUpgradeIntentRequest {
    plan_slug: 'saas' | 'upgrade_domains' | 'whitelabel';
    checkout_id?: string | null;
    product_id?: string | null;
    source_surface?: 'portal' | 'installation' | 'crm' | 'direct_link' | 'manual';
    source_context?: Record<string, unknown>;
}

export interface UpgradeIntentContext {
    token: string;
    status: string;
    expires_at: string;
    target_plan_slug: string;
    source_surface: string;
    source_context: Record<string, unknown>;
    checkout_id: string | null;
    product_id: string | null;
    beneficiary: {
        display_name: string | null;
        display_email_masked: string | null;
    };
    target_license_key: string;
    can_auto_apply: boolean;
}

/**
 * Get JWT-only headers for Central API calls.
 * The x-admin-secret is now added server-side by /api/central-proxy.
 */
const getHeaders = async () => {
    const { centralSupabase } = await import('./centralClient');
    const { supabase: localSupabase } = await import('./supabase');
    
    // Check both central and local sessions
    const { data: centralSession } = await centralSupabase.auth.getSession();
    const { data: localSession } = await localSupabase.auth.getSession();
    
    const session = centralSession?.session || localSession?.session;
    
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
    }

    return headers;
};

/**
 * Routes admin-protected endpoints through the secure BFF proxy.
 * The proxy (api/central-proxy.ts) validates JWT+admin role and adds x-admin-secret server-side.
 * The vercel.json rewrite maps /api/central/:endpoint to /api/central-proxy?endpoint=:endpoint
 */
const getProxyUrl = (endpoint: string) => `/api/central/${endpoint}`;

export const licenseService = {
    async list(page = 1, search = '', limit = 10): Promise<LicensesResponse> {
        const params = new URLSearchParams({
            page: page.toString(),
            limit: limit.toString(),
            search
        });

        const response = await fetch(`${getProxyUrl('manage-licenses')}?${params.toString()}`, {
            method: 'GET',
            headers: await getHeaders()
        });

        if (!response.ok) throw new Error('Failed to fetch licenses');
        return response.json();
    },

    async getDetails(key: string): Promise<License | null> {
        const params = new URLSearchParams({
            search: key,
            limit: '1'
        });

        const response = await fetch(`${getProxyUrl('manage-licenses')}?${params.toString()}`, {
            method: 'GET',
            headers: await getHeaders()
        });

        if (!response.ok) return null;

        const json = await response.json();
        if (json.data && json.data.length > 0) {
            const match = json.data.find((l: License) => l.key === key);
            return match || null;
        }
        return null;
    },

    async getInstallations(key: string): Promise<Installation[]> {
        const params = new URLSearchParams({
            view: 'installations',
            license_key: key
        });

        const response = await fetch(`${getProxyUrl('manage-licenses')}?${params.toString()}`, {
            method: 'GET',
            headers: await getHeaders()
        });

        if (!response.ok) throw new Error('Failed to fetch installations');
        const json = await response.json();
        return json.data || [];
    },

    async toggleStatus(key: string, action: 'activate' | 'suspend' | 'delete'): Promise<void> {
        const response = await fetch(getProxyUrl('manage-licenses'), {
            method: 'POST',
            headers: await getHeaders(),
            body: JSON.stringify({ key, action })
        });

        if (!response.ok) throw new Error(`Failed to ${action} license`);
    },

    async create(data: { client_name: string; client_email: string; plan_id: string }): Promise<void> {
        const response = await fetch(getProxyUrl('manage-licenses'), {
            method: 'POST',
            headers: await getHeaders(),
            body: JSON.stringify({
                action: 'create',
                ...data
            })
        });

        if (!response.ok) throw new Error('Failed to create license');
    },

    async createCommercial(data: { name: string; email: string; plan: string; source: 'manual_admin' }, token: string): Promise<{ install_url: string; license_key: string; token: string }> {
        const response = await fetch(getProxyUrl('create-commercial-license'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to create commercial license');
        }
        return response.json();
    },

    async update(key: string, data: Partial<License>): Promise<void> {
        const response = await fetch(getProxyUrl('manage-licenses'), {
            method: 'POST',
            headers: await getHeaders(),
            body: JSON.stringify({ key, action: 'update', data })
        });

        if (!response.ok) throw new Error('Failed to update license');
    },

    async getLicenseByUserId(userId: string, email?: string): Promise<License | null> {
        const headers = await getHeaders();
        let url = getProxyUrl('get-license-status');

        if (email) {
            const params = new URLSearchParams({ email, _t: Date.now().toString() });
            url = `${url}?${params.toString()}`;
        } else {
            url = `${url}?_t=${Date.now()}`;
        }

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers
            });

            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            console.error('Error in getLicenseByUserId:', error);
            return null;
        }
    },

    async requestActivationLink(email: string): Promise<void> {
        const response = await fetch(getProxyUrl('request-activation-link'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });

        if (!response.ok) {
            throw new Error('Failed to request link');
        }
    },

    async generateInstallToken(
        licenseKey: string,
        options: { resetExisting?: boolean } = {}
    ): Promise<{ token: string, expires_at: string, revoked_existing?: boolean }> {
        const response = await fetch(getProxyUrl('generate-install-token'), {
            method: 'POST',
            headers: await getHeaders(),
            body: JSON.stringify({
                license_key: licenseKey,
                reset_existing: Boolean(options.resetExisting)
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => null);
            throw new Error(errData?.error || 'Falha ao gerar token de instalação (Server Error)');
        }
        return await response.json();
    },

    async getMyInstallations(): Promise<Installation[]> {
        const { supabase } = await import('../services/supabase');
        const { data: { user } } = await supabase.auth.getUser();

        if (!user?.email) return [];

        const params = new URLSearchParams({ email: user.email });
        const response = await fetch(`${getProxyUrl('manage-user-installations')}?${params.toString()}`, {
            method: 'GET',
            headers: await getHeaders()
        });

        if (!response.ok) throw new Error('Falha ao buscar instalações');
        const data = await response.json();
        return data.installations || [];
    },

    async revokeInstallation(installationId: string): Promise<void> {
        const { supabase } = await import('../services/supabase');
        const { data: { user } } = await supabase.auth.getUser();

        if (!user?.email) throw new Error('E-mail do usuário não encontrado');

        const response = await fetch(getProxyUrl('manage-user-installations'), {
            method: 'POST',
            headers: await getHeaders(),
            body: JSON.stringify({
                action: 'revoke',
                installation_id: installationId,
                email: user.email
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Falha ao desvincular instalação');
        }
    },

    async getLicenseFeatures(licenseKey: string): Promise<LicenseFeature[]> {
        const response = await fetch(getProxyUrl('manage-licenses'), {
            method: 'POST',
            headers: await getHeaders(),
            body: JSON.stringify({ action: 'get_license_features', license_key: licenseKey })
        });

        if (!response.ok) throw new Error('Failed to fetch features');
        const json = await response.json();
        return json.data || [];
    },

    async toggleLicenseFeature(licenseKey: string, featureKey: string, isEnabled: boolean, settings: any = {}): Promise<void> {
        const response = await fetch(getProxyUrl('manage-licenses'), {
            method: 'POST',
            headers: await getHeaders(),
            body: JSON.stringify({
                action: 'toggle_license_feature',
                license_key: licenseKey,
                feature_key: featureKey,
                is_enabled: isEnabled,
                settings
            })
        });

        if (!response.ok) throw new Error('Failed to update feature');
    },

    async getOfficialPlans(): Promise<any[]> {
        const { centralSupabase } = await import('./centralClient');

        const { data, error } = await centralSupabase
            .from('plans')
            .select('*')
            .eq('active', true)
            .neq('slug', 'free');

        if (error) {
            console.error('Error fetching official plans:', error.message);
            return [];
        }

        return (data || []).map(p => ({
            id: p.id,
            name: p.name,
            description: p.description || '',
            active: p.active,
            imageUrl: p.image_url,
            price_real: p.price,
            checkout_url: p.checkout_url,
            saas_plan_slug: p.slug,
            limits: p.limits
        }));
    },

    async getAllPlans(): Promise<any[]> {
        const { centralSupabase } = await import('./centralClient');

        const { data, error } = await centralSupabase
            .from('plans')
            .select('*')
            .eq('active', true)
            .order('price', { ascending: true });

        if (error) {
            console.error('Error fetching all plans:', error.message);
            return [];
        }

        return (data || []).map(p => ({
            id: p.slug,
            label: p.name,
            maxInstallations: p.limits?.max_installations || 0,
            price: p.price ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.price) : 'Grátis',
            type: p.type || 'personal'
        }));
    },

    async activateFree(data: { termsAccepted: boolean; cpf?: string }): Promise<{ success: boolean; message: string; license?: any }> {
        const response = await fetch(getProxyUrl('activate-free-license'), {
            method: 'POST',
            headers: await getHeaders(),
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Falha ao ativar licença');
        }

        return await response.json();
    },

    async getPartnerOpportunityVisibility(): Promise<PartnerOpportunityVisibility> {
        const response = await fetch(getProxyUrl('account-flags'), {
            method: 'POST',
            headers: await getHeaders(),
            body: JSON.stringify({
                action: 'get_partner_opportunity_visibility'
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Falha ao consultar a visibilidade do plano parceiro');
        }

        const data = await response.json();
        return {
            partner_opportunity_enabled: Boolean(data.partner_opportunity_enabled),
            plan_type: data.plan_type || null,
            account_id: data.account_id || null
        };
    },

    async createUpgradeIntent(payload: CreateUpgradeIntentRequest): Promise<{
        token: string;
        status: string;
        expires_at: string;
        target_plan_slug: string;
        target_license_key: string;
        target_account_id: string | null;
        beneficiary_name: string | null;
        beneficiary_email: string | null;
        source_surface: string;
    }> {
        const response = await fetch(getProxyUrl('upgrade-intents'), {
            method: 'POST',
            headers: await getHeaders(),
            body: JSON.stringify({
                action: 'create_upgrade_intent',
                ...payload
            })
        });

        const raw = await response.text();
        const json = raw
            ? (() => {
                try {
                    return JSON.parse(raw);
                } catch {
                    return {};
                }
            })()
            : {};
        if (!response.ok) {
            throw new Error(json?.error || raw || 'Falha ao criar upgrade intent');
        }

        return json.data;
    },

    async getUpgradeIntentContext(token: string): Promise<UpgradeIntentContext> {
        const response = await fetch(`${CENTRAL_CONFIG.API_URL}/upgrade-intents`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'get_upgrade_intent_context',
                token
            })
        });

        const raw = await response.text();
        const json = raw
            ? (() => {
                try {
                    return JSON.parse(raw);
                } catch {
                    return {};
                }
            })()
            : {};
        if (!response.ok) {
            throw new Error(json?.error || raw || 'Falha ao consultar upgrade intent');
        }

        return json.data;
    }
};
