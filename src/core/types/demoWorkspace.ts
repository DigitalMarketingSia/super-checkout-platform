export type DemoWorkspaceStatus = 'provisioning' | 'active' | 'expired' | 'purged' | 'failed';

export interface DemoWorkspaceProduct {
    id: string;
    name: string;
    price_brl: number;
    kind: 'main' | 'order_bump' | 'upsell';
    status: 'active' | 'draft';
}

export interface DemoWorkspaceCheckout {
    id: string;
    name: string;
    slug: string;
    product_id: string;
    scenario: 'approved' | 'rejected' | 'pix_pending' | 'pix_paid';
}

export interface DemoWorkspaceOrder {
    id: string;
    customer_name: string;
    customer_email: string;
    product_name: string;
    total_brl: number;
    status: 'paid' | 'rejected' | 'pending';
    payment_method: 'credit_card' | 'pix';
    scenario: 'approved' | 'rejected' | 'pix_pending' | 'pix_paid';
}

export interface DemoWorkspaceDomain {
    id: string;
    host: string;
    usage: 'checkout' | 'member_area';
    status: 'simulated_connected' | 'simulated_pending_dns';
}

export interface DemoWorkspaceIntegration {
    id: string;
    category: 'gateway' | 'tracking' | 'email' | 'webhook';
    provider: string;
    status: 'simulated_connected' | 'blocked_demo' | 'sandbox_internal';
    note: string;
}

export interface DemoWorkspaceMemberModule {
    id: string;
    title: string;
    lesson_count: number;
}

export interface DemoWorkspaceMemberArea {
    id: string;
    name: string;
    slug: string;
    creator_name: string;
    student_name: string;
    student_email: string;
    modules: DemoWorkspaceMemberModule[];
}

export interface DemoWorkspaceScenario {
    id: string;
    label: string;
    status: 'approved' | 'rejected' | 'pix_pending' | 'pix_paid';
    description: string;
}

export interface DemoWorkspaceBusiness {
    name: string;
    niche: string;
    support_email: string;
    currency: 'BRL';
}

export interface DemoWorkspaceSeedPayload {
    business: DemoWorkspaceBusiness;
    products: DemoWorkspaceProduct[];
    checkouts: DemoWorkspaceCheckout[];
    orders: DemoWorkspaceOrder[];
    domains: DemoWorkspaceDomain[];
    integrations: DemoWorkspaceIntegration[];
    member_area: DemoWorkspaceMemberArea;
    scenarios: DemoWorkspaceScenario[];
}

export interface DemoWorkspaceSummary {
    products: number;
    checkouts: number;
    orders: number;
    member_modules: number;
    integrations: number;
    domains: number;
}

export interface DemoWorkspace {
    id: string;
    owner_user_id: string;
    owner_email: string;
    status: DemoWorkspaceStatus;
    template_version: string;
    created_from_template: string;
    reset_count: number;
    expires_at: string;
    last_activity_at: string | null;
    seeded_at: string | null;
    storage_prefix: string | null;
    seed_payload: DemoWorkspaceSeedPayload;
    metadata: Record<string, unknown>;
    failure_reason: string | null;
    purge_requested_at: string | null;
    purged_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface DemoWorkspaceResponse {
    success: boolean;
    workspace: DemoWorkspace;
    summary: DemoWorkspaceSummary;
}
