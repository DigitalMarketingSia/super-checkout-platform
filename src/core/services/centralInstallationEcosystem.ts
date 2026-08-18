import { centralSupabase } from './centralClient';

export type InstallationEcosystemStatus = 'all' | 'active' | 'pending' | 'revoked';

export type InstallationEcosystemPerson = {
    id: string;
    name: string;
    email?: string;
};

export type InstallationEcosystemItem = {
    installation_id: string;
    service_order_id: string;
    domain: string;
    installation_status: string;
    order_status: string;
    installed_at: string | null;
    beneficiary: {
        id: string | null;
        name: string;
        email?: string;
    };
    partner: InstallationEcosystemPerson | null;
    seller: InstallationEcosystemPerson | null;
    provider: InstallationEcosystemPerson | null;
    actor_relationship: 'partner' | 'seller' | 'provider' | null;
};

export type InstallationEcosystemResponse = {
    scope: 'platform_owner' | 'partner';
    summary: {
        total: number;
        active: number;
        pending: number;
        revoked: number;
        partners: number;
    };
    pagination: {
        page: number;
        page_size: number;
        total_items: number;
        total_pages: number;
    };
    filter_options: {
        partners: InstallationEcosystemPerson[];
        providers: InstallationEcosystemPerson[];
    };
    items: InstallationEcosystemItem[];
};

export type InstallationEcosystemRequest = {
    page?: number;
    page_size?: number;
    search?: string;
    installation_status?: InstallationEcosystemStatus;
    partner_id?: string | null;
    provider_id?: string | null;
};

export type CentralInstallationEcosystemErrorKind =
    | 'session_expired'
    | 'access_denied'
    | 'unavailable'
    | 'request_failed';

export class CentralInstallationEcosystemError extends Error {
    constructor(
        message: string,
        public readonly kind: CentralInstallationEcosystemErrorKind,
        public readonly status?: number,
    ) {
        super(message);
        this.name = 'CentralInstallationEcosystemError';
    }
}

function isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isEcosystemResponse(value: unknown): value is InstallationEcosystemResponse {
    if (!isObject(value) || !isObject(value.summary) || !isObject(value.pagination) || !Array.isArray(value.items)) {
        return false;
    }
    return (value.scope === 'platform_owner' || value.scope === 'partner')
        && typeof value.summary.total === 'number'
        && typeof value.pagination.total_items === 'number';
}

async function parseResponse(response: Response): Promise<Record<string, unknown> | null> {
    try {
        const payload: unknown = await response.json();
        return isObject(payload) ? payload : null;
    } catch {
        return null;
    }
}

export async function listInstallationEcosystem(
    request: InstallationEcosystemRequest = {},
): Promise<InstallationEcosystemResponse> {
    const { data: sessionData, error: sessionError } = await centralSupabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (sessionError || !accessToken) {
        throw new CentralInstallationEcosystemError(
            'A sessão do Portal expirou. Entre novamente para acessar o ecossistema.',
            'session_expired',
            401,
        );
    }

    let response: Response;
    try {
        response = await fetch('/api/central/service-orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ action: 'list_installation_ecosystem', ...request }),
        });
    } catch {
        throw new CentralInstallationEcosystemError(
            'A Central está indisponível neste momento.',
            'unavailable',
        );
    }

    const payload = await parseResponse(response);
    if (response.status === 401) {
        throw new CentralInstallationEcosystemError(
            'A sessão do Portal expirou. Entre novamente para acessar o ecossistema.',
            'session_expired',
            response.status,
        );
    }
    if (response.status === 403) {
        throw new CentralInstallationEcosystemError(
            'Sua conta não tem acesso ao ecossistema de instalações.',
            'access_denied',
            response.status,
        );
    }
    if (response.status >= 500) {
        throw new CentralInstallationEcosystemError(
            'A Central está indisponível neste momento.',
            'unavailable',
            response.status,
        );
    }
    if (!response.ok || !payload) {
        throw new CentralInstallationEcosystemError(
            typeof payload?.error === 'string' ? payload.error : 'Não foi possível carregar o ecossistema de instalações.',
            'request_failed',
            response.status,
        );
    }
    if (!isEcosystemResponse(payload)) {
        throw new CentralInstallationEcosystemError(
            'A Central retornou um contrato de ecossistema inválido.',
            'unavailable',
            response.status,
        );
    }
    return payload;
}
