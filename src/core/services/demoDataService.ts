import {
  AccessGrant,
  Checkout,
  Content,
  Domain,
  DomainStatus,
  DomainType,
  DomainUsage,
  Gateway,
  GatewayProvider,
  Lesson,
  MemberArea,
  Module,
  Order,
  OrderItem,
  OrderStatus,
  Payment,
  Product,
  Track,
  TrackItem,
  WebhookConfig,
  WebhookLog,
} from '../types';
import type { User } from '@supabase/supabase-js';
import { getRuntimeMode } from '../config/runtimeMode';
import { demoWorkspaceService } from './demoWorkspaceService';
import { clearDemoWebhookSession, dispatchDemoWebhookEvent, syncDemoWebhookSession } from './demoWebhookService';
import type {
  DemoWorkspace,
  DemoWorkspaceProduct,
  DemoWorkspaceResponse,
} from '../types/demoWorkspace';
import type {
  BusinessLegalSettingsLike,
  LegalDocumentHistorySnapshot,
} from '../utils/legalDocuments';

const DEMO_GATEWAY_ID = 'demo-gateway-fake';
const DEMO_RUNTIME_KEY_PREFIX = 'demo_workspace_runtime';
const DEMO_MEMBER_SESSION_KEY_PREFIX = 'demo_member_session';
const DEMO_MEMBER_TICKET_TTL_MS = 30 * 60 * 1000;
const DEMO_MEMBER_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const DEMO_RUNTIME_VERSION = 3;

export interface DemoOrderDeliverable {
  id: string;
  title: string;
  delivery_type: 'external_link' | 'member_area' | 'file_download' | 'none';
  status: 'available' | 'not_configured';
  url: string | null;
  visual_url?: string | null;
  label: string;
  instructions?: string | null;
}

type DemoScenarioStatus = DemoWorkspace['seed_payload']['scenarios'][number]['status'];

interface DemoRuntimeMember {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  updated_at: string;
  source: 'seed' | 'checkout';
}

interface DemoRuntimeMemberTicket {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  member_area_slug: string;
  order_id: string | null;
  expires_at: string;
}

interface DemoMemberSession {
  user_id: string;
  email: string;
  full_name: string;
  member_area_slug: string;
  expires_at: string;
  source: 'ticket' | 'login';
}

interface DemoMemberIdentity {
  user: User;
  profile: {
    id: string;
    email: string;
    full_name: string;
    role: 'member';
    effective_role: 'member';
    status: 'active';
  };
  session: DemoMemberSession;
}

export interface DemoBusinessSettingsRecord extends BusinessLegalSettingsLike {
  business_email?: string | null;
  currency: 'BRL' | 'USD' | 'EUR';
  is_ready_to_sell: boolean;
  compliance_status: string;
  logo_url: string;
  primary_color: string;
  demo_mode: true;
  show_legal_footer: boolean;
}

export interface DemoLegalHistoryEntry {
  id: string;
  document_key: 'privacy_policy' | 'terms_of_purchase';
  source: 'custom' | 'default';
  version: string;
  published_at: string;
  legal_name: string | null;
  legal_contact: string | null;
  support_email: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface DemoProductContentLink {
  product_id: string;
  content_id: string;
}

interface DemoRuntimeState {
  version: number;
  workspace_id: string;
  expires_at: string;
  selected_scenarios: Record<string, DemoScenarioStatus>;
  orders: Order[];
  payments: Payment[];
  access_grants: AccessGrant[];
  members: DemoRuntimeMember[];
  member_tickets: DemoRuntimeMemberTicket[];
  business_settings: DemoBusinessSettingsRecord | null;
  legal_history: DemoLegalHistoryEntry[];
  products: Product[];
  checkouts: Checkout[];
  member_areas: MemberArea[];
  contents: Content[];
  modules: Module[];
  product_content_links: DemoProductContentLink[];
  tracks: Track[];
  track_items: TrackItem[];
  webhooks: WebhookConfig[];
  webhook_logs: WebhookLog[];
}

export const isDemoDataRuntime = () => getRuntimeMode() === 'demo';

const getWorkspacePayload = async (): Promise<DemoWorkspaceResponse | null> => {
  const cached = demoWorkspaceService.getCachedWorkspace();

  if (cached?.workspace?.status === 'active') {
    return cached;
  }

  try {
    return await demoWorkspaceService.ensureWorkspace();
  } catch (error) {
    console.warn('[DemoData] Workspace unavailable:', error);
    return cached;
  }
};

const getWorkspace = async (): Promise<DemoWorkspace | null> => {
  const payload = await getWorkspacePayload();
  return payload?.workspace || null;
};

const getProductKindFlags = (product: DemoWorkspaceProduct) => ({
  is_order_bump: product.kind === 'order_bump',
  is_upsell: product.kind === 'upsell',
});

const getRuntimeStorageKey = (workspaceId: string) => `${DEMO_RUNTIME_KEY_PREFIX}:${workspaceId}`;
const getMemberSessionStorageKey = (workspaceId: string) => `${DEMO_MEMBER_SESSION_KEY_PREFIX}:${workspaceId}`;

const normalizeEmail = (value?: string | null) => String(value || '').trim().toLowerCase();

const simpleHash = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
};

const clampExpiry = (workspace: DemoWorkspace, ttlMs: number) =>
  new Date(Math.min(
    new Date(workspace.expires_at).getTime(),
    Date.now() + ttlMs,
  )).toISOString();

const createMemberId = (workspaceId: string, email: string) =>
  `demo-member:${workspaceId}:${simpleHash(normalizeEmail(email) || 'member')}`;

const buildSeedMember = (workspace: DemoWorkspace): DemoRuntimeMember => {
  const seedEmail = workspace.seed_payload.member_area.student_email || 'aluno.demo@supercheckout.app';
  const nowIso = new Date().toISOString();

  return {
    id: createMemberId(workspace.id, seedEmail),
    email: normalizeEmail(seedEmail),
    full_name: workspace.seed_payload.member_area.student_name || 'Aluno Demo',
    created_at: nowIso,
    updated_at: nowIso,
    source: 'seed',
  };
};

const buildDefaultDemoBusinessSettings = (workspace: DemoWorkspace): DemoBusinessSettingsRecord => ({
  business_name: workspace.seed_payload.business.name,
  business_email: workspace.seed_payload.business.support_email,
  support_email: workspace.seed_payload.business.support_email,
  legal_name: workspace.seed_payload.business.name,
  legal_responsible_email: workspace.seed_payload.business.support_email,
  privacy_policy: '',
  privacy_policy_version: '',
  privacy_policy_published_at: '',
  terms_of_purchase: '',
  terms_of_purchase_version: '',
  terms_of_purchase_published_at: '',
  show_legal_footer: true,
  currency: workspace.seed_payload.business.currency,
  is_ready_to_sell: true,
  compliance_status: 'verified',
  logo_url: '/logo.png',
  primary_color: '#8A2BE2',
  demo_mode: true,
  updated_at: workspace.updated_at || workspace.created_at,
});

const normalizeDemoBusinessSettings = (
  workspace: DemoWorkspace,
  input: unknown,
): DemoBusinessSettingsRecord => {
  const defaults = buildDefaultDemoBusinessSettings(workspace);
  if (!input || typeof input !== 'object') return defaults;

  const candidate = input as Partial<DemoBusinessSettingsRecord>;

  return {
    ...defaults,
    business_name: String(candidate.business_name || defaults.business_name || '').trim(),
    business_email: String(candidate.business_email || candidate.support_email || defaults.business_email || '').trim(),
    support_email: String(candidate.support_email || defaults.support_email || '').trim(),
    legal_name: String(candidate.legal_name || candidate.business_name || defaults.legal_name || defaults.business_name || '').trim(),
    legal_responsible_email: String(candidate.legal_responsible_email || candidate.support_email || defaults.legal_responsible_email || defaults.support_email || '').trim(),
    privacy_policy: String(candidate.privacy_policy || ''),
    privacy_policy_version: String(candidate.privacy_policy_version || ''),
    privacy_policy_published_at: String(candidate.privacy_policy_published_at || ''),
    terms_of_purchase: String(candidate.terms_of_purchase || ''),
    terms_of_purchase_version: String(candidate.terms_of_purchase_version || ''),
    terms_of_purchase_published_at: String(candidate.terms_of_purchase_published_at || ''),
    show_legal_footer: candidate.show_legal_footer !== false,
    currency: candidate.currency === 'USD' || candidate.currency === 'EUR' ? candidate.currency : defaults.currency,
    is_ready_to_sell: candidate.is_ready_to_sell !== false,
    compliance_status: String(candidate.compliance_status || defaults.compliance_status || 'verified'),
    logo_url: String(candidate.logo_url || defaults.logo_url || '/logo.png'),
    primary_color: String(candidate.primary_color || defaults.primary_color || '#8A2BE2'),
    demo_mode: true,
    updated_at: String(candidate.updated_at || defaults.updated_at || new Date().toISOString()),
  };
};

const normalizeDemoLegalHistory = (entries: unknown): DemoLegalHistoryEntry[] => {
  if (!Array.isArray(entries)) return [];

  const byId = new Map<string, DemoLegalHistoryEntry>();

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;

    const candidate = entry as Partial<DemoLegalHistoryEntry>;
    const id = String(candidate.id || '').trim();
    const documentKey = candidate.document_key === 'terms_of_purchase' ? 'terms_of_purchase' : candidate.document_key === 'privacy_policy' ? 'privacy_policy' : null;
    const version = String(candidate.version || '').trim();

    if (!id || !documentKey || !version) continue;

    byId.set(id, {
      id,
      document_key: documentKey,
      source: candidate.source === 'custom' ? 'custom' : 'default',
      version,
      published_at: String(candidate.published_at || candidate.created_at || ''),
      legal_name: candidate.legal_name ? String(candidate.legal_name) : null,
      legal_contact: candidate.legal_contact ? String(candidate.legal_contact) : null,
      support_email: candidate.support_email ? String(candidate.support_email) : null,
      created_at: String(candidate.created_at || candidate.published_at || new Date().toISOString()),
      metadata: candidate.metadata && typeof candidate.metadata === 'object'
        ? candidate.metadata as Record<string, unknown>
        : null,
    });
  }

  return Array.from(byId.values()).sort((left, right) => {
    const rightPublished = new Date(right.published_at || right.created_at).getTime();
    const leftPublished = new Date(left.published_at || left.created_at).getTime();
    if (rightPublished !== leftPublished) return rightPublished - leftPublished;

    const rightCreated = new Date(right.created_at).getTime();
    const leftCreated = new Date(left.created_at).getTime();
    return rightCreated - leftCreated;
  });
};

const buildEmptyRuntimeState = (workspace: DemoWorkspace): DemoRuntimeState => ({
  version: DEMO_RUNTIME_VERSION,
  workspace_id: workspace.id,
  expires_at: workspace.expires_at,
  selected_scenarios: {},
  orders: [],
  payments: [],
  access_grants: [],
  members: [buildSeedMember(workspace)],
  member_tickets: [],
  business_settings: buildDefaultDemoBusinessSettings(workspace),
  legal_history: [],
  products: buildDefaultDemoProducts(workspace),
  checkouts: buildDefaultDemoCheckouts(workspace),
  member_areas: buildDefaultDemoMemberAreas(workspace),
  contents: buildDefaultDemoContents(workspace),
  modules: buildDefaultDemoModules(workspace),
  product_content_links: buildDefaultDemoProductContentLinks(workspace),
  tracks: buildDefaultDemoTracks(workspace),
  track_items: buildDefaultDemoTrackItems(workspace),
  webhooks: [],
  webhook_logs: [],
});

const upsertById = <T extends { id: string }>(items: T[], nextItem: T) => {
  const next = items.filter((item) => item.id !== nextItem.id);
  next.unshift(nextItem);
  return next;
};

const upsertBatchById = <T extends { id: string }>(current: T[], nextItems: T[]) =>
  nextItems.reduce((acc, item) => upsertById(acc, item), current);

const getMainDemoProductRecord = (workspace: DemoWorkspace) =>
  workspace.seed_payload.products.find((product) => product.kind === 'main') || workspace.seed_payload.products[0];

const getScenarioStateKey = (checkoutId: string, paymentMethod: string) => `${checkoutId}:${paymentMethod}`;

const getContentId = (workspace: DemoWorkspace) => `${workspace.seed_payload.member_area.id}-content`;

const createProductGrantId = (userId: string, productId: string) => `demo-grant-product:${userId}:${productId}`;
const createContentGrantId = (userId: string, contentId: string) => `demo-grant-content:${userId}:${contentId}`;

const getDefaultScenario = (paymentMethod: string): DemoScenarioStatus => (
  paymentMethod === 'pix' ? 'pix_pending' : 'approved'
);

const mapProduct = (workspace: DemoWorkspace, product: DemoWorkspaceProduct): Product => ({
  id: product.id,
  name: product.name,
  description:
    product.kind === 'main'
      ? 'Produto principal do workspace demo. Use esta tela como faria no seu ambiente real.'
      : 'Oferta complementar simulada para demonstrar bumps, upsells e entregas.',
  active: product.status === 'active',
  imageUrl: '/logo.png',
  price_real: product.price_brl,
  price_fake: Math.round(product.price_brl * 1.8),
  sku: `DEMO-${product.kind.toUpperCase()}`,
  category: workspace.seed_payload.business.niche,
  delivery_file_path: null,
  delivery_file_name: null,
  delivery_file_mime_type: null,
  delivery_file_size_bytes: null,
  visible_in_member_area: true,
  for_sale: true,
  member_area_action: 'checkout',
  member_area_checkout_id: workspace.seed_payload.checkouts[0]?.id || '',
  checkout_slug: workspace.seed_payload.checkouts[0]?.slug || '',
  checkout_url: workspace.seed_payload.checkouts[0]?.slug ? `/c/${workspace.seed_payload.checkouts[0].slug}` : '',
  redirect_link: workspace.seed_payload.checkouts[0]?.slug ? `/c/${workspace.seed_payload.checkouts[0].slug}` : '',
  member_area_id: workspace.seed_payload.member_area.id,
  currency: 'BRL',
  ...getProductKindFlags(product),
});

const getDemoProductsFromWorkspace = (workspace: DemoWorkspace): Product[] =>
  workspace.seed_payload.products.map((product) => mapProduct(workspace, product));

const buildAssociatedMainProduct = (workspace: DemoWorkspace) => {
  const mainProduct = getMainDemoProductRecord(workspace);
  return mainProduct ? mapProduct(workspace, mainProduct) : undefined;
};

const normalizeMembers = (workspace: DemoWorkspace, members: unknown): DemoRuntimeMember[] => {
  const seedMember = buildSeedMember(workspace);
  const normalized: DemoRuntimeMember[] = Array.isArray(members)
    ? members
        .filter((member) => member && typeof member === 'object')
        .map((member: any): DemoRuntimeMember => ({
          id: String(member.id || ''),
          email: normalizeEmail(member.email || ''),
          full_name: String(member.full_name || member.name || ''),
          created_at: String(member.created_at || workspace.created_at || new Date().toISOString()),
          updated_at: String(member.updated_at || workspace.updated_at || new Date().toISOString()),
          source: member.source === 'checkout' ? 'checkout' : 'seed',
        }))
        .filter((member) => Boolean(member.id) && Boolean(member.email))
    : [];

  const byId = new Map<string, DemoRuntimeMember>();
  byId.set(seedMember.id, seedMember);
  for (const member of normalized) {
    byId.set(member.id, member);
  }

  return Array.from(byId.values());
};

const normalizeTickets = (tickets: unknown): DemoRuntimeMemberTicket[] =>
  Array.isArray(tickets)
    ? tickets
        .filter((ticket) => ticket && typeof ticket === 'object')
        .map((ticket: any) => ({
          id: String(ticket.id || ''),
          user_id: String(ticket.user_id || ''),
          email: normalizeEmail(ticket.email || ''),
          full_name: String(ticket.full_name || ''),
          member_area_slug: String(ticket.member_area_slug || ''),
          order_id: ticket.order_id ? String(ticket.order_id) : null,
          expires_at: String(ticket.expires_at || ''),
        }))
        .filter((ticket) => {
          const expiresAt = new Date(ticket.expires_at).getTime();
          return Boolean(ticket.id) && Boolean(ticket.user_id) && Number.isFinite(expiresAt) && expiresAt > Date.now();
        })
    : [];

const normalizeDemoWebhooks = (webhooks: unknown): WebhookConfig[] =>
  Array.isArray(webhooks)
    ? webhooks
        .filter((hook) => hook && typeof hook === 'object')
        .map((hook: any) => ({
          id: String(hook.id || '').trim(),
          name: String(hook.name || '').trim(),
          description: hook.description ? String(hook.description) : undefined,
          url: String(hook.url || '').trim(),
          method: hook.method === 'GET' || hook.method === 'PUT' || hook.method === 'PATCH' ? hook.method : 'POST',
          headers: Array.isArray(hook.headers)
            ? hook.headers
                .filter((header: any) => header && typeof header === 'object')
                .map((header: any) => ({
                  key: String(header.key || '').trim(),
                  value: String(header.value || '').trim(),
                }))
                .filter((header) => Boolean(header.key) && Boolean(header.value))
            : [],
          events: Array.isArray(hook.events)
            ? hook.events.map((event: unknown) => String(event || '').trim()).filter(Boolean)
            : [],
          active: hook.active !== false,
          secret: hook.secret ? String(hook.secret) : undefined,
          created_at: String(hook.created_at || new Date().toISOString()),
          last_fired_at: hook.last_fired_at ? String(hook.last_fired_at) : undefined,
          last_status: typeof hook.last_status === 'number' ? hook.last_status : undefined,
        }))
        .filter((hook) => Boolean(hook.id) && Boolean(hook.name) && Boolean(hook.url) && hook.events.length > 0)
    : [];

const normalizeDemoWebhookLogs = (logs: unknown): WebhookLog[] =>
  Array.isArray(logs)
    ? logs
        .filter((log) => log && typeof log === 'object')
        .map((log: any): WebhookLog => ({
          id: String(log.id || '').trim(),
          webhook_id: log.webhook_id ? String(log.webhook_id) : undefined,
          gateway_id: log.gateway_id ? String(log.gateway_id) : undefined,
          direction: log.direction === 'incoming' ? 'incoming' : 'outgoing',
          event: String(log.event || '').trim(),
          payload: typeof log.payload === 'string' ? log.payload : JSON.stringify(log.payload || {}),
          response_status: typeof log.response_status === 'number' ? log.response_status : undefined,
          response_body: log.response_body ? String(log.response_body) : undefined,
          duration_ms: typeof log.duration_ms === 'number' ? log.duration_ms : undefined,
          created_at: String(log.created_at || new Date().toISOString()),
          processed: typeof log.processed === 'boolean' ? log.processed : undefined,
          raw_data: log.raw_data ? String(log.raw_data) : undefined,
        }))
        .filter((log) => Boolean(log.id) && Boolean(log.event))
        .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    : [];

const buildDemoMemberUser = (member: { id: string; email: string; full_name: string; created_at?: string; updated_at?: string }): User => ({
  id: member.id,
  email: member.email,
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {
    provider: 'demo',
    providers: ['demo'],
  },
  user_metadata: {
    name: member.full_name,
    full_name: member.full_name,
    demo_member: true,
    requires_password_setup: true,
  },
  created_at: member.created_at || new Date().toISOString(),
  updated_at: member.updated_at || new Date().toISOString(),
} as unknown as User);

const buildDemoMemberIdentity = (session: DemoMemberSession): DemoMemberIdentity => ({
  user: buildDemoMemberUser({
    id: session.user_id,
    email: session.email,
    full_name: session.full_name,
  }),
  profile: {
    id: session.user_id,
    email: session.email,
    full_name: session.full_name,
    role: 'member',
    effective_role: 'member',
    status: 'active',
  },
  session,
});

const getCachedWorkspaceSync = () => demoWorkspaceService.getCachedWorkspace()?.workspace || null;

const readMemberSession = (workspaceId: string): DemoMemberSession | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(getMemberSessionStorageKey(workspaceId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as DemoMemberSession | null;
    if (!parsed?.user_id || !parsed.expires_at || new Date(parsed.expires_at).getTime() <= Date.now()) {
      window.sessionStorage.removeItem(getMemberSessionStorageKey(workspaceId));
      return null;
    }

    return parsed;
  } catch {
    window.sessionStorage.removeItem(getMemberSessionStorageKey(workspaceId));
    return null;
  }
};

const writeMemberSession = (
  workspace: DemoWorkspace,
  state: DemoRuntimeState,
  member: DemoRuntimeMember,
  source: DemoMemberSession['source'],
): DemoMemberSession => {
  const primaryArea = getPrimaryMemberArea(state, workspace);
  const session: DemoMemberSession = {
    user_id: member.id,
    email: member.email,
    full_name: member.full_name,
    member_area_slug: primaryArea?.slug || workspace.seed_payload.member_area.slug,
    expires_at: clampExpiry(workspace, DEMO_MEMBER_SESSION_TTL_MS),
    source,
  };

  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(getMemberSessionStorageKey(workspace.id), JSON.stringify(session));
  }

  return session;
};

const clearMemberSessionSync = (workspaceId?: string | null) => {
  if (typeof window === 'undefined') return;

  const targetWorkspaceId = String(workspaceId || getCachedWorkspaceSync()?.id || '').trim();
  if (!targetWorkspaceId) return;
  window.sessionStorage.removeItem(getMemberSessionStorageKey(targetWorkspaceId));
};

const resolveMemberFromOrder = (
  workspace: DemoWorkspace,
  state: DemoRuntimeState,
  params: {
    requestedUserId?: string | null;
    email?: string | null;
    fullName?: string | null;
  },
): { member: DemoRuntimeMember; state: DemoRuntimeState } => {
  const seedMember = buildSeedMember(workspace);
  const requestedUserId = String(params.requestedUserId || '').trim();
  const safeRequestedUserId = requestedUserId && requestedUserId !== workspace.owner_user_id
    ? requestedUserId
    : '';
  const email = normalizeEmail(params.email || seedMember.email);
  const fullName = String(params.fullName || '').trim();

  const existingMember = (
    (safeRequestedUserId ? state.members.find((member) => member.id === safeRequestedUserId) : null)
    || state.members.find((member) => normalizeEmail(member.email) === email)
    || (email === seedMember.email ? seedMember : null)
  );

  const member: DemoRuntimeMember = {
    id: existingMember?.id || safeRequestedUserId || createMemberId(workspace.id, email),
    email: existingMember?.email || email,
    full_name: fullName || existingMember?.full_name || seedMember.full_name,
    created_at: existingMember?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    source: existingMember?.source || (email === seedMember.email ? 'seed' : 'checkout'),
  };

  return {
    member,
    state: {
      ...state,
      members: upsertById(state.members, member),
    },
  };
};

const issueMemberTicket = (
  workspace: DemoWorkspace,
  state: DemoRuntimeState,
  member: DemoRuntimeMember,
  orderId: string,
) => {
  const ticketId = `demo-ticket:${simpleHash(`${workspace.id}:${member.id}:${orderId}`)}`;
  const existingTicket = state.member_tickets.find((ticket) => ticket.id === ticketId);
  const ticket: DemoRuntimeMemberTicket = existingTicket || {
    id: ticketId,
    user_id: member.id,
    email: member.email,
    full_name: member.full_name,
    member_area_slug: getPrimaryMemberArea(state, workspace)?.slug || workspace.seed_payload.member_area.slug,
    order_id: orderId,
    expires_at: clampExpiry(workspace, DEMO_MEMBER_TICKET_TTL_MS),
  };

  return {
    ticket,
    state: {
      ...state,
      member_tickets: upsertById(
        state.member_tickets.filter((currentTicket) => new Date(currentTicket.expires_at).getTime() > Date.now()),
        ticket,
      ),
    },
    accessUrl: `/app/${ticket.member_area_slug}?demo_member_ticket=${encodeURIComponent(ticket.id)}`,
  };
};

const loadRuntimeState = (workspace: DemoWorkspace): DemoRuntimeState => {
  if (typeof window === 'undefined') return buildEmptyRuntimeState(workspace);

  try {
    const raw = window.localStorage.getItem(getRuntimeStorageKey(workspace.id));
    if (!raw) return buildEmptyRuntimeState(workspace);

    const parsed = JSON.parse(raw) as Partial<DemoRuntimeState> | null;
    if (!parsed || parsed.workspace_id !== workspace.id) {
      return buildEmptyRuntimeState(workspace);
    }

    const expiresAt = String(parsed.expires_at || workspace.expires_at);
    if (new Date(expiresAt).getTime() <= Date.now()) {
      window.localStorage.removeItem(getRuntimeStorageKey(workspace.id));
      return buildEmptyRuntimeState(workspace);
    }

    return {
      version: DEMO_RUNTIME_VERSION,
      workspace_id: workspace.id,
      expires_at: workspace.expires_at,
      selected_scenarios: parsed.selected_scenarios || {},
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      payments: Array.isArray(parsed.payments) ? parsed.payments : [],
      access_grants: Array.isArray(parsed.access_grants) ? parsed.access_grants : [],
      members: normalizeMembers(workspace, parsed.members),
      member_tickets: normalizeTickets(parsed.member_tickets),
      business_settings: normalizeDemoBusinessSettings(workspace, parsed.business_settings),
      legal_history: normalizeDemoLegalHistory(parsed.legal_history),
      products: normalizeDemoProducts(workspace, parsed.products),
      checkouts: normalizeDemoCheckouts(workspace, parsed.checkouts),
      member_areas: normalizeDemoMemberAreas(workspace, parsed.member_areas),
      contents: normalizeDemoContents(workspace, parsed.contents),
      modules: normalizeDemoModules(workspace, parsed.modules),
      product_content_links: normalizeDemoProductContentLinks(workspace, parsed.product_content_links),
      tracks: normalizeDemoTracks(workspace, parsed.tracks),
      track_items: normalizeDemoTrackItems(workspace, parsed.track_items),
      webhooks: normalizeDemoWebhooks(parsed.webhooks),
      webhook_logs: normalizeDemoWebhookLogs(parsed.webhook_logs),
    };
  } catch {
    return buildEmptyRuntimeState(workspace);
  }
};

const persistRuntimeState = (workspace: DemoWorkspace, state: DemoRuntimeState) => {
  if (typeof window === 'undefined') return;

  const payload: DemoRuntimeState = {
    ...state,
    version: DEMO_RUNTIME_VERSION,
    workspace_id: workspace.id,
    expires_at: workspace.expires_at,
  };

  window.localStorage.setItem(getRuntimeStorageKey(workspace.id), JSON.stringify(payload));
};

const clearRuntimeStateSync = (workspaceId?: string | null) => {
  if (typeof window === 'undefined') return;

  const targetWorkspaceId = String(workspaceId || getCachedWorkspaceSync()?.id || '').trim();
  if (!targetWorkspaceId) return;
  window.localStorage.removeItem(getRuntimeStorageKey(targetWorkspaceId));
};

const dedupeRuntimeOrders = (seedOrders: Order[], runtimeOrders: Order[]) => {
  const merged = new Map<string, Order>();

  for (const order of seedOrders) {
    merged.set(order.id, order);
  }

  for (const order of runtimeOrders) {
    merged.set(order.id, order);
  }

  return Array.from(merged.values()).sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );
};

const mapCheckout = (workspace: DemoWorkspace): Checkout[] => {
  const products = workspace.seed_payload.products;
  const orderBumps = products.filter((product) => product.kind === 'order_bump').map((product) => product.id);
  const upsell = products.find((product) => product.kind === 'upsell');
  const checkoutDomain = workspace.seed_payload.domains.find((domain) => domain.usage === 'checkout');

  return workspace.seed_payload.checkouts.map((checkout) => ({
    id: checkout.id,
    user_id: workspace.owner_user_id,
    name: checkout.name,
    active: true,
    product_id: checkout.product_id,
    gateway_id: DEMO_GATEWAY_ID,
    domain_id: checkoutDomain?.id || null,
    order_bump_ids: orderBumps,
    upsell_product_id: upsell?.id,
    custom_url_slug: checkout.slug,
    thank_you_button_url: `/app/${workspace.seed_payload.member_area.slug}`,
    thank_you_button_text: 'Acessar area de membros demo',
    currency: 'BRL',
    backup_gateway_id: null,
    config: {
      fields: {
        name: true,
        email: true,
        phone: true,
        cpf: false,
      },
      payment_methods: {
        pix: true,
        credit_card: true,
        boleto: false,
        apple_pay: false,
        google_pay: false,
      },
      timer: {
        active: true,
        minutes: 15,
        bg_color: '#05050A',
        text_color: '#FFFFFF',
      },
      primary_color: '#8A2BE2',
      pixels: {
        active: false,
      },
      upsell: {
        active: Boolean(upsell),
        product_id: upsell?.id || '',
        title: 'Oferta especial demo',
        subtitle: 'Simule o pos-compra sem cobrar nada',
        description: 'Este upsell usa gateway ficticio e pedido temporario do workspace demo.',
        media_type: 'image',
        media_url: '/logo.png',
        button_text: 'Adicionar oferta demo',
        show_title: true,
        show_subtitle: true,
        show_description: true,
        show_media: true,
      },
    },
  }));
};

const mapDomain = (workspace: DemoWorkspace, state?: DemoRuntimeState): Domain[] => {
  const primaryCheckout = state?.checkouts[0] || buildDefaultDemoCheckouts(workspace)[0];
  const primaryArea = getPrimaryMemberArea(
    state || buildEmptyRuntimeState(workspace),
    workspace,
  );

  return workspace.seed_payload.domains.map((domain) => ({
    id: domain.id,
    user_id: workspace.owner_user_id,
    domain: domain.host,
    checkout_id: domain.usage === 'checkout' ? primaryCheckout?.id : undefined,
    slug: domain.usage === 'checkout'
      ? primaryCheckout?.custom_url_slug
      : primaryArea?.slug,
    type: DomainType.CNAME,
    status: domain.status === 'simulated_connected' ? DomainStatus.ACTIVE : DomainStatus.PENDING,
    usage: domain.usage === 'checkout' ? DomainUsage.CHECKOUT : DomainUsage.MEMBER_AREA,
    created_at: workspace.created_at,
  }));
};

const mapGateway = (): Gateway[] => [
  {
    id: DEMO_GATEWAY_ID,
    name: GatewayProvider.MERCADO_PAGO,
    public_key: 'DEMO_PUBLIC_KEY_NO_REAL_CHARGE',
    private_key: '',
    webhook_secret: '',
    active: true,
    config: {
      demo: true,
      environment: 'demo',
      provider_label: 'Gateway ficticio',
      max_installments: 12,
      min_installment_value: 5,
      interest_rate: 0,
    },
  },
];

const mapOrderStatus = (status: DemoWorkspace['seed_payload']['orders'][number]['status']) => {
  if (status === 'paid') return OrderStatus.PAID;
  if (status === 'rejected') return OrderStatus.FAILED;
  return OrderStatus.PENDING;
};

const mapOrders = (workspace: DemoWorkspace): Order[] => {
  const checkout = workspace.seed_payload.checkouts[0];
  const seedMember = buildSeedMember(workspace);

  return workspace.seed_payload.orders.map((order, index) => ({
    id: order.id,
    offer_id: order.product_name,
    checkout_id: checkout?.id || '',
    customer_name: order.customer_name,
    customer_email: order.customer_email,
    amount: order.total_brl,
    total: order.total_brl,
    status: mapOrderStatus(order.status),
    payment_method: order.payment_method,
    items: [
      {
        name: order.product_name,
        price: order.total_brl,
        quantity: 1,
        product_id: checkout?.product_id,
        type: 'main',
      },
    ],
    metadata: {
      demo: true,
      scenario: order.scenario,
      order_deliverables: order.status === 'paid'
        ? [{
            id: `${order.id}:${checkout?.product_id || 'seed'}`,
            title: order.product_name,
            delivery_type: 'member_area',
            status: 'available',
            url: `/app/${workspace.seed_payload.member_area.slug}`,
            visual_url: `/app/${workspace.seed_payload.member_area.slug}`,
            label: 'Acessar area de membros demo',
            instructions: 'Acesso demo liberado para testar a experiencia do aluno.',
          }]
        : [],
    },
    created_at: new Date(Date.now() - index * 60 * 60 * 1000).toISOString(),
    customer_user_id: order.status === 'paid' ? seedMember.id : undefined,
  }));
};

const mapMemberArea = (workspace: DemoWorkspace): MemberArea => ({
  id: workspace.seed_payload.member_area.id,
  owner_id: workspace.owner_user_id,
  name: workspace.seed_payload.member_area.name,
  slug: workspace.seed_payload.member_area.slug,
  domain_id: workspace.seed_payload.domains.find((domain) => domain.usage === 'member_area')?.id || null,
  logo_url: '/logo.png',
  login_image_url: '/logo.png',
  primary_color: '#8A2BE2',
  created_at: workspace.created_at,
  layout_mode: 'module',
  card_style: 'standard',
  allow_free_signup: false,
  banner_title: 'Bem-vindo ao ambiente demo',
  banner_description: 'Este acesso de aluno e temporario e sera apagado automaticamente em 24h.',
  banner_button_text: 'Continuar assistindo',
  banner_button_link: '#conteudos',
  custom_branding: true,
});

const mapContents = (workspace: DemoWorkspace): Content[] => {
  const associatedProduct = buildAssociatedMainProduct(workspace);

  return [{
    id: getContentId(workspace),
    title: workspace.seed_payload.member_area.name,
    description: 'Conteudo demo criado para testar a experiencia de criador e aluno.',
    thumbnail_url: '/logo.png',
    type: 'course',
    member_area_id: workspace.seed_payload.member_area.id,
    author_id: workspace.owner_user_id,
    created_at: workspace.created_at,
    updated_at: workspace.updated_at,
    modules_count: workspace.seed_payload.member_area.modules.length,
    image_vertical_url: '/logo.png',
    image_horizontal_url: '/logo.png',
    modules_layout: 'horizontal',
    is_free: false,
    associated_product: associatedProduct,
  }];
};

const mapModules = (workspace: DemoWorkspace): Module[] => {
  const associatedProduct = buildAssociatedMainProduct(workspace);

  return workspace.seed_payload.member_area.modules.map((module, index) => ({
    id: module.id,
    content_id: getContentId(workspace),
    title: module.title,
    description: `${module.lesson_count} aulas demo`,
    order_index: index,
    created_at: workspace.created_at,
    image_vertical_url: '/logo.png',
    image_horizontal_url: '/logo.png',
    is_free: index === 0,
    associated_product: associatedProduct,
    lessons: Array.from({ length: module.lesson_count }, (_, lessonIndex) => ({
      id: `${module.id}-lesson-${lessonIndex + 1}`,
      module_id: module.id,
      title: `Aula demo ${lessonIndex + 1}`,
      content_type: 'text' as const,
      content_text: 'Conteudo temporario do workspace demo.',
      order_index: lessonIndex,
      is_free: index === 0 && lessonIndex === 0,
      created_at: workspace.created_at,
      associated_product: associatedProduct,
    })),
  }));
};

function createRuntimeId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}:${crypto.randomUUID()}`;
  }

  return `${prefix}:${Date.now()}:${simpleHash(prefix)}`;
}

function cloneCheckoutConfig(config: Checkout['config']): Checkout['config'] {
  return {
    ...config,
    fields: { ...config.fields },
    payment_methods: { ...config.payment_methods },
    timer: { ...config.timer },
    pixels: config.pixels ? { ...config.pixels } : undefined,
    upsell: config.upsell ? { ...config.upsell } : undefined,
  };
}

function sanitizeProductForRuntime(product: Product): Product {
  return {
    ...product,
  };
}

function sanitizeCheckoutForRuntime(checkout: Checkout): Checkout {
  const normalizedConfig = cloneCheckoutConfig(checkout.config);
  const normalizedUpsellProductId = String(
    normalizedConfig.upsell?.product_id || checkout.upsell_product_id || '',
  ).trim();

  return {
    ...checkout,
    domain_id: checkout.domain_id ?? null,
    order_bump_ids: Array.isArray(checkout.order_bump_ids)
      ? Array.from(new Set(
          checkout.order_bump_ids
            .map((entry) => String(entry || '').trim())
            .filter(Boolean),
        ))
      : [],
    upsell_product_id: normalizedConfig.upsell?.active && normalizedUpsellProductId
      ? normalizedUpsellProductId
      : undefined,
    thank_you_button_url: checkout.thank_you_button_url ?? null,
    thank_you_button_text: checkout.thank_you_button_text ?? null,
    backup_gateway_id: checkout.backup_gateway_id ?? null,
    config: {
      ...normalizedConfig,
      upsell: normalizedConfig.upsell
        ? {
            ...normalizedConfig.upsell,
            product_id: normalizedUpsellProductId,
          }
        : undefined,
    },
  };
}

function sanitizeContentForRuntime(content: Content): Content {
  const { associated_product, modules_count, ...rest } = content;

  return {
    ...rest,
  };
}

function sanitizeLessonForRuntime(lesson: Lesson): Lesson {
  const { associated_product, module, ...rest } = lesson;

  return {
    ...rest,
    gallery: Array.isArray(lesson.gallery) ? lesson.gallery.map((resource) => ({ ...resource })) : undefined,
    content_order: Array.isArray(lesson.content_order) ? [...lesson.content_order] : lesson.content_order,
  };
}

function sanitizeModuleForRuntime(module: Module): Module {
  const { associated_product, content, ...rest } = module;

  return {
    ...rest,
    lessons: Array.isArray(module.lessons) ? module.lessons.map((lesson) => sanitizeLessonForRuntime(lesson)) : [],
  };
}

function sanitizeMemberAreaForRuntime(area: MemberArea): MemberArea {
  return {
    ...area,
    domain_id: area.domain_id ?? null,
    sidebar_config: Array.isArray(area.sidebar_config)
      ? area.sidebar_config.map((item) => ({
          ...item,
          children: Array.isArray(item.children) ? item.children.map((child) => ({ ...child })) : undefined,
        }))
      : undefined,
    custom_links: Array.isArray(area.custom_links) ? area.custom_links.map((link) => ({ ...link })) : undefined,
    faqs: Array.isArray(area.faqs) ? area.faqs.map((faq) => ({ ...faq })) : undefined,
  };
}

function sanitizeTrackForRuntime(track: Track): Track {
  const { items, ...rest } = track;

  return {
    ...rest,
  };
}

function sanitizeTrackItemForRuntime(item: TrackItem): TrackItem {
  return {
    id: item.id,
    track_id: item.track_id,
    item_id: item.item_id,
    position: item.position,
    created_at: item.created_at,
  };
}

function buildDefaultDemoProducts(workspace: DemoWorkspace): Product[] {
  return getDemoProductsFromWorkspace(workspace).map((product) => sanitizeProductForRuntime(product));
}

function buildDefaultDemoCheckouts(workspace: DemoWorkspace): Checkout[] {
  return mapCheckout(workspace).map((checkout) => sanitizeCheckoutForRuntime(checkout));
}

function buildDefaultDemoMemberAreas(workspace: DemoWorkspace): MemberArea[] {
  return [sanitizeMemberAreaForRuntime(mapMemberArea(workspace))];
}

function buildDefaultDemoContents(workspace: DemoWorkspace): Content[] {
  return mapContents(workspace).map((content) => sanitizeContentForRuntime(content));
}

function buildDefaultDemoModules(workspace: DemoWorkspace): Module[] {
  return mapModules(workspace).map((module) => sanitizeModuleForRuntime(module));
}

function buildDefaultDemoProductContentLinks(workspace: DemoWorkspace): DemoProductContentLink[] {
  const contentId = getContentId(workspace);
  return buildDefaultDemoProducts(workspace).map((product) => ({
    product_id: product.id,
    content_id: contentId,
  }));
}

function buildDefaultDemoTracks(workspace: DemoWorkspace): Track[] {
  const memberAreaId = workspace.seed_payload.member_area.id;

  return [{
    id: `${memberAreaId}-track-contents`,
    member_area_id: memberAreaId,
    title: 'Continue do ponto em que parou',
    type: 'contents',
    position: 0,
    is_visible: true,
    created_at: workspace.created_at,
    card_style: 'horizontal',
  }];
}

function buildDefaultDemoTrackItems(workspace: DemoWorkspace): TrackItem[] {
  const memberAreaId = workspace.seed_payload.member_area.id;
  const contentId = getContentId(workspace);

  return [{
    id: `${memberAreaId}-track-contents:${contentId}`,
    track_id: `${memberAreaId}-track-contents`,
    item_id: contentId,
    position: 0,
    created_at: workspace.created_at,
  }];
}

function normalizeDemoProducts(workspace: DemoWorkspace, input: unknown): Product[] {
  if (!Array.isArray(input)) return buildDefaultDemoProducts(workspace);

  return input
    .filter((item) => item && typeof item === 'object' && 'id' in item)
    .map((item) => sanitizeProductForRuntime(item as Product));
}

function normalizeDemoCheckouts(workspace: DemoWorkspace, input: unknown): Checkout[] {
  if (!Array.isArray(input)) return buildDefaultDemoCheckouts(workspace);

  return input
    .filter((item) => item && typeof item === 'object' && 'id' in item)
    .map((item) => sanitizeCheckoutForRuntime(item as Checkout));
}

function normalizeDemoMemberAreas(workspace: DemoWorkspace, input: unknown): MemberArea[] {
  if (!Array.isArray(input)) return buildDefaultDemoMemberAreas(workspace);

  return input
    .filter((item) => item && typeof item === 'object' && 'id' in item)
    .map((item) => sanitizeMemberAreaForRuntime(item as MemberArea));
}

function normalizeDemoContents(workspace: DemoWorkspace, input: unknown): Content[] {
  if (!Array.isArray(input)) return buildDefaultDemoContents(workspace);

  return input
    .filter((item) => item && typeof item === 'object' && 'id' in item)
    .map((item) => sanitizeContentForRuntime(item as Content));
}

function normalizeDemoModules(workspace: DemoWorkspace, input: unknown): Module[] {
  if (!Array.isArray(input)) return buildDefaultDemoModules(workspace);

  return input
    .filter((item) => item && typeof item === 'object' && 'id' in item)
    .map((item) => sanitizeModuleForRuntime(item as Module));
}

function normalizeDemoProductContentLinks(workspace: DemoWorkspace, input: unknown): DemoProductContentLink[] {
  if (!Array.isArray(input)) return buildDefaultDemoProductContentLinks(workspace);

  return input
    .filter((item) => item && typeof item === 'object')
    .map((item: any) => ({
      product_id: String(item.product_id || '').trim(),
      content_id: String(item.content_id || '').trim(),
    }))
    .filter((item) => Boolean(item.product_id) && Boolean(item.content_id));
}

function normalizeDemoTracks(workspace: DemoWorkspace, input: unknown): Track[] {
  if (!Array.isArray(input)) return buildDefaultDemoTracks(workspace);

  return input
    .filter((item) => item && typeof item === 'object' && 'id' in item)
    .map((item) => sanitizeTrackForRuntime(item as Track));
}

function normalizeDemoTrackItems(workspace: DemoWorkspace, input: unknown): TrackItem[] {
  if (!Array.isArray(input)) return buildDefaultDemoTrackItems(workspace);

  return input
    .filter((item) => item && typeof item === 'object' && 'id' in item)
    .map((item) => sanitizeTrackItemForRuntime(item as TrackItem));
}

function getPrimaryMemberArea(state: DemoRuntimeState, workspace: DemoWorkspace): MemberArea | null {
  return state.member_areas[0] || buildDefaultDemoMemberAreas(workspace)[0] || null;
}

function decorateProduct(product: Product, state: DemoRuntimeState): Product {
  const next = sanitizeProductForRuntime(product);

  if (next.member_area_action === 'checkout' && next.member_area_checkout_id) {
    const checkout = state.checkouts.find((entry) => entry.id === next.member_area_checkout_id);
    if (checkout?.custom_url_slug) {
      next.checkout_slug = checkout.custom_url_slug;
      next.checkout_url = `/c/${checkout.custom_url_slug}`;
      next.redirect_link = `/c/${checkout.custom_url_slug}`;
    }
  }

  return next;
}

function getAssociatedProductForContent(contentId: string, state: DemoRuntimeState): Product | undefined {
  const link = state.product_content_links.find((entry) => entry.content_id === contentId);
  const product = link ? state.products.find((entry) => entry.id === link.product_id) : null;

  return product ? decorateProduct(product, state) : undefined;
}

function decorateContent(content: Content, state: DemoRuntimeState): Content {
  return {
    ...sanitizeContentForRuntime(content),
    modules_count: state.modules.filter((module) => module.content_id === content.id).length,
    associated_product: getAssociatedProductForContent(content.id, state),
  };
}

function decorateModule(module: Module, state: DemoRuntimeState): Module {
  const next = sanitizeModuleForRuntime(module);
  const content = state.contents.find((entry) => entry.id === next.content_id);
  const decoratedContent = content ? decorateContent(content, state) : undefined;
  const associatedProduct = decoratedContent?.associated_product;

  return {
    ...next,
    content: decoratedContent,
    associated_product: associatedProduct,
    lessons: (next.lessons || [])
      .slice()
      .sort((left, right) => left.order_index - right.order_index)
      .map((lesson) => ({
        ...sanitizeLessonForRuntime(lesson),
        associated_product: associatedProduct,
      })),
  };
}

function getFlattenedLessons(state: DemoRuntimeState): Lesson[] {
  return state.modules.flatMap((module) =>
    (module.lessons || []).map((lesson) => sanitizeLessonForRuntime(lesson)),
  );
}

function buildTrackWithItemsFromState(
  workspace: DemoWorkspace,
  state: DemoRuntimeState,
  trackId: string,
): Track | null {
  const track = state.tracks.find((entry) => entry.id === trackId);
  if (!track) return null;

  const contentsById = new Map(state.contents.map((content) => [content.id, decorateContent(content, state)]));
  const modulesById = new Map(state.modules.map((module) => [module.id, decorateModule(module, state)]));
  const productsById = new Map(state.products.map((product) => [product.id, decorateProduct(product, state)]));
  const lessonsById = new Map(getFlattenedLessons(state).map((lesson) => [lesson.id, lesson]));

  const items = state.track_items
    .filter((entry) => entry.track_id === trackId)
    .slice()
    .sort((left, right) => left.position - right.position)
    .map((item) => {
      const nextItem = sanitizeTrackItemForRuntime(item);

      if (track.type === 'products') {
        const product = productsById.get(item.item_id);
        return product ? { ...nextItem, product } : null;
      }

      if (track.type === 'contents') {
        const content = contentsById.get(item.item_id);
        return content ? { ...nextItem, content } : null;
      }

      if (track.type === 'modules') {
        const module = modulesById.get(item.item_id);
        return module ? { ...nextItem, module } : null;
      }

      if (track.type === 'lessons') {
        const lesson = lessonsById.get(item.item_id);
        return lesson ? { ...nextItem, lesson } : null;
      }

      return null;
    })
    .filter(Boolean) as TrackItem[];

  return {
    ...sanitizeTrackForRuntime(track),
    items,
  };
}

function buildMemberAccessUrl(workspace: DemoWorkspace, state: DemoRuntimeState) {
  const primaryArea = getPrimaryMemberArea(state, workspace);
  return `/app/${primaryArea?.slug || workspace.seed_payload.member_area.slug}`;
}

function upsertProductContentLinks(
  current: DemoProductContentLink[],
  nextLinks: DemoProductContentLink[],
): DemoProductContentLink[] {
  const serialized = new Map<string, DemoProductContentLink>();

  for (const link of current) {
    serialized.set(`${link.product_id}:${link.content_id}`, link);
  }

  for (const link of nextLinks) {
    serialized.set(`${link.product_id}:${link.content_id}`, link);
  }

  return Array.from(serialized.values());
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read demo asset.'));
    reader.readAsDataURL(file);
  });
}

const buildDemoDeliverables = (
  workspace: DemoWorkspace,
  state: DemoRuntimeState,
  order: Order,
  member: DemoRuntimeMember | null,
): { deliverables: DemoOrderDeliverable[]; state: DemoRuntimeState } => {
  const defaultAccessUrl = buildMemberAccessUrl(workspace, state);
  const memberAccess = member
    ? issueMemberTicket(workspace, state, member, order.id)
    : {
        state,
        accessUrl: defaultAccessUrl,
      };
  const productsById = new Map(state.products.map((product) => [product.id, decorateProduct(product, state)]));
  const areasById = new Map(state.member_areas.map((area) => [area.id, sanitizeMemberAreaForRuntime(area)]));
  const uniqueItems = Array.from(
    new Map(
      (Array.isArray(order.items) ? order.items : [])
        .filter((item) => item?.product_id)
        .map((item) => [String(item.product_id), item]),
    ).values(),
  ) as OrderItem[];

  return {
    state: memberAccess.state,
    deliverables: uniqueItems.map((item, index) => {
      const product = item.product_id ? productsById.get(String(item.product_id)) : undefined;
      const area = product?.member_area_id ? areasById.get(product.member_area_id) : getPrimaryMemberArea(state, workspace);
      const areaAccessUrl = `/app/${area?.slug || workspace.seed_payload.member_area.slug}`;

      if (product?.member_area_action === 'sales_page' && product.redirect_link) {
        return {
          id: `${order.id}:${String(item.product_id || index)}`,
          title: item.name || product.name || 'Produto demo',
          delivery_type: 'external_link',
          status: 'available',
          url: product.redirect_link,
          visual_url: product.redirect_link,
          label: 'Acessar material',
          instructions: 'Entrega demo liberada por link externo.',
        } satisfies DemoOrderDeliverable;
      }

      if (product?.member_area_action === 'file' && product.delivery_file_path) {
        return {
          id: `${order.id}:${String(item.product_id || index)}`,
          title: item.name || product.name || 'Produto demo',
          delivery_type: 'file_download',
          status: 'available',
          url: product.delivery_file_path,
          visual_url: product.delivery_file_path,
          label: String(product.delivery_file_mime_type || '').includes('pdf') ? 'Abrir PDF' : 'Baixar arquivo',
          instructions: `Arquivo demo ${product.delivery_file_name || 'disponivel'} pronto para download.`,
        } satisfies DemoOrderDeliverable;
      }

      return {
        id: `${order.id}:${String(item.product_id || index)}`,
        title: item.name || product?.name || 'Produto demo',
        delivery_type: 'member_area',
        status: 'available',
        url: member ? memberAccess.accessUrl : areaAccessUrl,
        visual_url: areaAccessUrl,
        label: 'Acessar area de membros demo',
        instructions: 'Acesso demo liberado para testar a experiencia do aluno.',
      } satisfies DemoOrderDeliverable;
    }),
  };
};

const applyPaidRuntimeEffects = (workspace: DemoWorkspace, state: DemoRuntimeState, order: Order): DemoRuntimeState => {
  const normalizedItems = Array.isArray(order.items) ? order.items : [];
  const memberResolution = resolveMemberFromOrder(workspace, state, {
    requestedUserId: order.customer_user_id,
    email: order.customer_email,
    fullName: order.customer_name,
  });
  const effectiveMember = memberResolution.member;
  const deliverableResult = buildDemoDeliverables(workspace, memberResolution.state, {
    ...order,
    customer_user_id: effectiveMember.id,
  }, effectiveMember);
  const updatedOrder: Order = {
    ...order,
    customer_user_id: effectiveMember.id,
    status: OrderStatus.PAID,
    total: order.total || order.amount,
    metadata: {
      ...(order.metadata && typeof order.metadata === 'object' ? order.metadata : {}),
      demo: true,
      order_deliverables: deliverableResult.deliverables,
      demo_paid_at: new Date().toISOString(),
      demo_auto_approve_at: null,
    },
  };

  const updatedPayments = deliverableResult.state.payments.map((payment) =>
    payment.order_id === order.id
      ? {
          ...payment,
          status: OrderStatus.PAID,
        }
      : payment,
  );

  const productsById = new Map(state.products.map((product) => [product.id, decorateProduct(product, state)]));
  const nextGrants = [...deliverableResult.state.access_grants];
  const uniqueProductIds = Array.from(
    new Set(normalizedItems.map((item) => String(item.product_id || '').trim()).filter(Boolean)),
  );

  for (const productId of uniqueProductIds) {
    nextGrants.push({
      id: createProductGrantId(effectiveMember.id, productId),
      user_id: effectiveMember.id,
      content_id: null,
      product_id: productId,
      granted_at: new Date().toISOString(),
      status: 'active',
      product: productsById.get(productId),
    });
  }

  const linkedContentIds = Array.from(
    new Set(
      deliverableResult.state.product_content_links
        .filter((link) => uniqueProductIds.includes(link.product_id))
        .map((link) => link.content_id),
    ),
  );

  for (const contentId of linkedContentIds) {
    const content = deliverableResult.state.contents.find((entry) => entry.id === contentId);
    if (!content) continue;

    nextGrants.push({
      id: createContentGrantId(effectiveMember.id, content.id),
      user_id: effectiveMember.id,
      content_id: content.id,
      product_id: undefined,
      granted_at: new Date().toISOString(),
      status: 'active',
      content: decorateContent(content, deliverableResult.state),
    });
  }

  const grantsById = new Map<string, AccessGrant>();
  for (const grant of nextGrants) {
    grantsById.set(grant.id, grant);
  }

  return {
    ...deliverableResult.state,
    orders: upsertById(deliverableResult.state.orders, updatedOrder),
    payments: updatedPayments,
    access_grants: Array.from(grantsById.values()),
  };
};

const reconcileRuntimeState = (workspace: DemoWorkspace, state: DemoRuntimeState): DemoRuntimeState => {
  let nextState = state;
  const now = Date.now();

  for (const order of state.orders) {
    const metadata = order.metadata && typeof order.metadata === 'object' ? order.metadata : {};
    const autoApproveAt = typeof metadata.demo_auto_approve_at === 'string' ? metadata.demo_auto_approve_at : '';
    if (!autoApproveAt) continue;
    if ((order.status || '').toLowerCase() !== OrderStatus.PENDING) continue;
    if (new Date(autoApproveAt).getTime() > now) continue;

    nextState = applyPaidRuntimeEffects(workspace, nextState, order);
    const paidOrder = nextState.orders.find((entry) => entry.id === order.id) || null;

    if (paidOrder && typeof window !== 'undefined') {
      void dispatchPaidDemoWebhooks(paidOrder)
        .then((logs) => {
          if (!logs.length) return;

          const latestState = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
          persistRuntimeState(workspace, applyWebhookLogsToState(latestState, logs));
        })
        .catch((error) => {
          console.warn('[DemoData] Failed to dispatch auto-approved webhooks:', error);
        });
    }
  }

  return nextState;
};

const createDemoLegalHistoryEntry = (
  workspace: DemoWorkspace,
  snapshot: LegalDocumentHistorySnapshot,
  savedAt: string,
  savedByUserId?: string | null,
): DemoLegalHistoryEntry => ({
  id: `demo-legal:${workspace.id}:${snapshot.key}:${simpleHash(`${snapshot.version}:${snapshot.renderedContent}`)}`,
  document_key: snapshot.key,
  source: snapshot.source,
  version: snapshot.version,
  published_at: snapshot.publishedAt,
  legal_name: snapshot.legalName || null,
  legal_contact: snapshot.legalContact || null,
  support_email: snapshot.supportEmail || null,
  created_at: savedAt,
  metadata: {
    ...snapshot.metadata,
    saved_at: savedAt,
    saved_by_user_id: savedByUserId || null,
    saved_via: 'BusinessSettings',
  },
});

const buildDemoWebhookPayload = (
  order: Order,
  overrides: Record<string, unknown> = {},
) => {
  const metadata = order.metadata && typeof order.metadata === 'object' ? order.metadata : {};
  const paymentContext = metadata.payment_context && typeof metadata.payment_context === 'object'
    ? metadata.payment_context as Record<string, unknown>
    : {};

  return {
    demo: true,
    source: 'demo',
    workspace_mode: 'demo',
    scenario: metadata.demo_scenario || metadata.scenario || null,
    order_id: order.id,
    checkout_id: order.checkout_id,
    amount: order.total || order.amount || 0,
    currency: paymentContext.currency || 'BRL',
    status: order.status,
    payment_method: order.payment_method,
    customer: {
      name: order.customer_name,
      email: order.customer_email,
      phone: order.customer_phone || null,
      cpf: order.customer_cpf || null,
    },
    items: Array.isArray(order.items) ? order.items : [],
    created_at: order.created_at,
    ...overrides,
  };
};

const dispatchPaidDemoWebhooks = async (order: Order) => {
  const purchasedAt = new Date().toISOString();
  const logs: WebhookLog[] = [];

  const approvedResult = await dispatchDemoWebhookEvent({
    event: 'pagamento.aprovado',
    eventAliases: ['pedido.pago'],
    payload: {
      event: 'pagamento.aprovado',
      ...buildDemoWebhookPayload(order, {
        status: OrderStatus.PAID,
        purchased_at: purchasedAt,
      }),
    },
  });
  logs.push(...approvedResult.logs);

  if (order.payment_method === 'pix') {
    const pixResult = await dispatchDemoWebhookEvent({
      event: 'pix.pago',
      payload: {
        event: 'pix.pago',
        ...buildDemoWebhookPayload(order, {
          status: OrderStatus.PAID,
          purchased_at: purchasedAt,
          pix_data: demoDataService.buildPixData(order.id, order.total || order.amount || 0),
        }),
      },
    });
    logs.push(...pixResult.logs);
  }

  return logs;
};

const applyWebhookLogsToState = (
  state: DemoRuntimeState,
  items: WebhookLog[],
): DemoRuntimeState => {
  if (!items.length) return state;

  const nextLogs = normalizeDemoWebhookLogs(
    upsertBatchById(state.webhook_logs, items).slice(0, 120),
  );

  const lastLogByWebhook = new Map<string, WebhookLog>();
  for (const log of nextLogs) {
    if (log.webhook_id && !lastLogByWebhook.has(log.webhook_id)) {
      lastLogByWebhook.set(log.webhook_id, log);
    }
  }

  const nextWebhooks = state.webhooks.map((hook) => {
    const latestLog = lastLogByWebhook.get(hook.id);
    if (!latestLog) return hook;

    return {
      ...hook,
      last_fired_at: latestLog.created_at,
      last_status: latestLog.response_status,
    };
  });

  return {
    ...state,
    webhooks: nextWebhooks,
    webhook_logs: nextLogs,
  };
};

export const demoDataService = {
  async getProducts(): Promise<Product[]> {
    const workspace = await getWorkspace();
    if (!workspace) return [];

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    persistRuntimeState(workspace, state);
    return state.products.map((product) => decorateProduct(product, state));
  },

  async getProductsByIds(ids: string[]): Promise<Product[]> {
    const products = await this.getProducts();
    return products.filter((product) => ids.includes(product.id));
  },

  async getCheckouts(): Promise<Checkout[]> {
    const workspace = await getWorkspace();
    if (!workspace) return [];

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    persistRuntimeState(workspace, state);
    return state.checkouts.map((checkout) => sanitizeCheckoutForRuntime(checkout));
  },

  async getPublicCheckout(idOrSlug: string): Promise<Checkout | null> {
    const checkouts = await this.getCheckouts();
    return checkouts.find((checkout) => checkout.id === idOrSlug || checkout.custom_url_slug === idOrSlug) || null;
  },

  async getPublicProduct(id: string): Promise<Product | null> {
    const products = await this.getProducts();
    return products.find((product) => product.id === id) || null;
  },

  async getDomains(): Promise<Domain[]> {
    const workspace = await getWorkspace();
    if (!workspace) return [];

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    persistRuntimeState(workspace, state);
    return mapDomain(workspace, state);
  },

  async getDomainByHostname(hostname: string): Promise<Domain | null> {
    const domains = await this.getDomains();
    const normalized = hostname.replace(/^https?:\/\//, '').replace(/^www\./, '').toLowerCase();
    return domains.find((domain) => domain.domain.replace(/^www\./, '').toLowerCase() === normalized) || null;
  },

  async getGateways(): Promise<Gateway[]> {
    return mapGateway();
  },

  async getPublicGateway(id: string): Promise<Gateway | null> {
    const gateways = await this.getGateways();
    return gateways.find((gateway) => gateway.id === id) || null;
  },

  async getOrders(): Promise<Order[]> {
    const workspace = await getWorkspace();
    if (!workspace) return [];

    const runtime = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    persistRuntimeState(workspace, runtime);
    return dedupeRuntimeOrders(mapOrders(workspace), runtime.orders);
  },

  async getOrderById(orderId: string): Promise<Order | null> {
    const orders = await this.getOrders();
    return orders.find((order) => order.id === orderId) || null;
  },

  async getOrderStatus(orderId: string): Promise<string | null> {
    const order = await this.getOrderById(orderId);
    return order?.status || null;
  },

  async getOrderSnapshot(orderId: string) {
    const order = await this.getOrderById(orderId);
    if (!order) return null;

    const metadata = order.metadata && typeof order.metadata === 'object' ? order.metadata : {};
    const deliverables = Array.isArray(metadata.order_deliverables)
      ? metadata.order_deliverables as DemoOrderDeliverable[]
      : [];

    return {
      status: String(order.status || 'pending'),
      authorized: true,
      order,
      deliverables,
    };
  },

  async markOrderPaid(orderId: string): Promise<Order | null> {
    const workspace = await getWorkspace();
    if (!workspace) return null;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    const target = state.orders.find((order) => order.id === orderId);
    if (!target) return null;
    if ((target.status || '').toLowerCase() === OrderStatus.PAID) return target;

    const nextState = applyPaidRuntimeEffects(workspace, state, target);
    persistRuntimeState(workspace, nextState);
    const paidOrder = nextState.orders.find((order) => order.id === orderId) || null;

    if (paidOrder) {
      try {
        const logs = await dispatchPaidDemoWebhooks(paidOrder);
        if (logs.length > 0) {
          await this.saveWebhookLogs(logs);
        }
      } catch (error) {
        console.warn('[DemoData] Failed to dispatch paid webhooks:', error);
      }
    }

    return paidOrder;
  },

  async createOrder(order: Order) {
    const workspace = await getWorkspace();
    if (!workspace) return;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    const runtimeOrder: Order = {
      ...order,
      total: order.total || order.amount,
      metadata: {
        ...(order.metadata && typeof order.metadata === 'object' ? order.metadata : {}),
        demo: true,
      },
    };

    persistRuntimeState(workspace, {
      ...state,
      orders: upsertById(state.orders, runtimeOrder),
    });
  },

  async saveOrders(orders: Order[]) {
    const workspace = await getWorkspace();
    if (!workspace) return;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    persistRuntimeState(workspace, {
      ...state,
      orders: upsertBatchById(state.orders, orders),
    });
  },

  async getPayments(): Promise<Payment[]> {
    const workspace = await getWorkspace();
    if (!workspace) return [];

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    persistRuntimeState(workspace, state);
    return state.payments;
  },

  async getPaymentByOrderId(orderId: string): Promise<Payment | null> {
    const payments = await this.getPayments();
    return payments.find((payment) => payment.order_id === orderId) || null;
  },

  async savePayments(payments: Payment[]) {
    const workspace = await getWorkspace();
    if (!workspace) return;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    persistRuntimeState(workspace, {
      ...state,
      payments: upsertBatchById(state.payments, payments),
    });
  },

  async upsertPayment(payment: Payment) {
    await this.savePayments([payment]);
  },

  async getAccessGrants(userId?: string | null): Promise<AccessGrant[]> {
    const workspace = await getWorkspace();
    if (!workspace) return [];

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    persistRuntimeState(workspace, state);

    const productsById = new Map(state.products.map((product) => [product.id, decorateProduct(product, state)]));
    const contentsById = new Map(state.contents.map((content) => [content.id, decorateContent(content, state)]));

    return state.access_grants
      .filter((grant) => !userId || grant.user_id === userId)
      .map((grant) => ({
        ...grant,
        product: grant.product || (grant.product_id ? productsById.get(grant.product_id) : undefined),
        content: grant.content || (grant.content_id ? contentsById.get(grant.content_id) : undefined),
      }));
  },

  async createAccessGrant(grant: Omit<AccessGrant, 'id' | 'granted_at'>) {
    const workspace = await getWorkspace();
    if (!workspace) return;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    const id = grant.product_id
      ? createProductGrantId(grant.user_id, grant.product_id)
      : createContentGrantId(grant.user_id, String(grant.content_id || 'content'));

    const nextGrant: AccessGrant = {
      ...grant,
      id,
      granted_at: new Date().toISOString(),
    };

    persistRuntimeState(workspace, {
      ...state,
      access_grants: upsertById(state.access_grants, nextGrant),
    });
  },

  getCurrentMemberSession() {
    const workspace = getCachedWorkspaceSync();
    return workspace ? readMemberSession(workspace.id) : null;
  },

  getCurrentMemberUser(): User | null {
    const session = this.getCurrentMemberSession();
    return session ? buildDemoMemberIdentity(session).user : null;
  },

  getCurrentMemberProfile() {
    const session = this.getCurrentMemberSession();
    return session ? buildDemoMemberIdentity(session).profile : null;
  },

  clearMemberSession() {
    clearMemberSessionSync();
  },

  clearWorkspaceRuntime(workspaceId?: string | null) {
    clearRuntimeStateSync(workspaceId);
    clearMemberSessionSync(workspaceId);
    void clearDemoWebhookSession().catch(() => undefined);
  },

  async resolveOrCreateMember(params: {
    requestedUserId?: string | null;
    email?: string | null;
    fullName?: string | null;
  }) {
    const workspace = await getWorkspace();
    if (!workspace) {
      throw new Error('Workspace demo indisponivel.');
    }

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    const resolution = resolveMemberFromOrder(workspace, state, params);
    persistRuntimeState(workspace, resolution.state);

    return resolution.member;
  },

  async consumeMemberAccessTicket(ticketId: string) {
    const workspace = await getWorkspace();
    if (!workspace) return null;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    const ticket = state.member_tickets.find((currentTicket) => currentTicket.id === ticketId);
    if (!ticket || new Date(ticket.expires_at).getTime() <= Date.now()) {
      return null;
    }

    const resolution = resolveMemberFromOrder(workspace, state, {
      requestedUserId: ticket.user_id,
      email: ticket.email,
      fullName: ticket.full_name,
    });
    persistRuntimeState(workspace, resolution.state);

    const session = writeMemberSession(workspace, resolution.state, resolution.member, 'ticket');
    return buildDemoMemberIdentity(session);
  },

  async loginMember(email: string, password: string, memberAreaSlug?: string) {
    const workspace = await getWorkspace();
    if (!workspace) {
      throw new Error('Workspace demo indisponivel.');
    }

    if (!String(password || '').trim()) {
      throw new Error('Informe uma senha demo para continuar.');
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      throw new Error('Informe um email valido.');
    }

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    if (memberAreaSlug) {
      const slugExists = state.member_areas.some((area) => area.slug === memberAreaSlug);
      if (!slugExists) {
        throw new Error('Area de membros demo nao encontrada.');
      }
    }

    const resolution = resolveMemberFromOrder(workspace, state, { email: normalizedEmail });
    const hasAccess = resolution.state.access_grants.some(
      (grant) => grant.user_id === resolution.member.id && grant.status === 'active',
    );
    const isSeedMember = normalizeEmail(workspace.seed_payload.member_area.student_email) === normalizedEmail;

    if (!hasAccess && !isSeedMember) {
      throw new Error('Nenhum acesso demo encontrado para este email.');
    }

    persistRuntimeState(workspace, resolution.state);
    const session = writeMemberSession(workspace, resolution.state, resolution.member, 'login');
    return buildDemoMemberIdentity(session);
  },

  async getMemberAreas(): Promise<MemberArea[]> {
    const workspace = await getWorkspace();
    if (!workspace) return [];

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    persistRuntimeState(workspace, state);
    return state.member_areas.map((area) => sanitizeMemberAreaForRuntime(area));
  },

  async getMemberAreaById(id: string): Promise<MemberArea | null> {
    const areas = await this.getMemberAreas();
    return areas.find((area) => area.id === id) || null;
  },

  async getMemberAreaBySlug(slug: string): Promise<MemberArea | null> {
    const areas = await this.getMemberAreas();
    return areas.find((area) => area.slug === slug) || null;
  },

  async getContents(memberAreaId?: string): Promise<Content[]> {
    const workspace = await getWorkspace();
    if (!workspace) return [];

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    persistRuntimeState(workspace, state);
    const contents = state.contents.map((content) => decorateContent(content, state));
    return memberAreaId ? contents.filter((content) => content.member_area_id === memberAreaId) : contents;
  },

  async getModules(contentId: string): Promise<Module[]> {
    const workspace = await getWorkspace();
    if (!workspace) return [];

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    persistRuntimeState(workspace, state);
    return state.modules
      .filter((module) => module.content_id === contentId)
      .map((module) => decorateModule(module, state));
  },

  async getModulesByAreaId(areaId: string): Promise<Module[]> {
    const workspace = await getWorkspace();
    if (!workspace) return [];

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    persistRuntimeState(workspace, state);
    const contentIds = new Set(
      state.contents
        .filter((content) => content.member_area_id === areaId)
        .map((content) => content.id),
    );

    return state.modules
      .filter((module) => contentIds.has(module.content_id))
      .map((module) => decorateModule(module, state));
  },

  async getContentsByProduct(productId: string): Promise<Content[]> {
    const workspace = await getWorkspace();
    if (!workspace) return [];

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    persistRuntimeState(workspace, state);
    const linkedContentIds = new Set(
      state.product_content_links
        .filter((link) => link.product_id === productId)
        .map((link) => link.content_id),
    );

    return state.contents
      .filter((content) => linkedContentIds.has(content.id))
      .map((content) => decorateContent(content, state));
  },

  async getProductContents(productId: string): Promise<string[]> {
    const contents = await this.getContentsByProduct(productId);
    return contents.map((content) => content.id);
  },

  async getTracks(memberAreaId: string): Promise<Track[]> {
    const workspace = await getWorkspace();
    if (!workspace) return [];

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    persistRuntimeState(workspace, state);
    return state.tracks
      .filter((track) => track.member_area_id === memberAreaId)
      .slice()
      .sort((left, right) => left.position - right.position)
      .map((track) => sanitizeTrackForRuntime(track));
  },

  async getTrackWithItems(trackId: string): Promise<Track | null> {
    const workspace = await getWorkspace();
    if (!workspace) return null;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    persistRuntimeState(workspace, state);
    return buildTrackWithItemsFromState(workspace, state, trackId);
  },

  async createProduct(product: Omit<Product, 'id'> & { id?: string }) {
    const workspace = await getWorkspace();
    if (!workspace) return null;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    const nextProduct = sanitizeProductForRuntime({
      ...product,
      id: product.id || createRuntimeId('demo-product'),
    } as Product);

    persistRuntimeState(workspace, {
      ...state,
      products: upsertById(state.products, nextProduct),
    });

    return nextProduct;
  },

  async updateProduct(product: Product) {
    const workspace = await getWorkspace();
    if (!workspace) return null;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    const nextProduct = sanitizeProductForRuntime(product);

    persistRuntimeState(workspace, {
      ...state,
      products: upsertById(state.products, nextProduct),
    });

    return nextProduct;
  },

  async deleteProduct(productId: string) {
    const workspace = await getWorkspace();
    if (!workspace) return;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    persistRuntimeState(workspace, {
      ...state,
      products: state.products.filter((product) => product.id !== productId),
      product_content_links: state.product_content_links.filter((link) => link.product_id !== productId),
      checkouts: state.checkouts
        .filter((checkout) => checkout.product_id !== productId)
        .map((checkout) => sanitizeCheckoutForRuntime({
          ...checkout,
          order_bump_ids: checkout.order_bump_ids.filter((entry) => entry !== productId),
          upsell_product_id: checkout.upsell_product_id === productId ? undefined : checkout.upsell_product_id,
        })),
      track_items: state.track_items.filter((item) => item.item_id !== productId),
    });
  },

  async uploadProductImage(file: File): Promise<string> {
    return readFileAsDataUrl(file);
  },

  async uploadProductDeliverable(file: File) {
    const dataUrl = await readFileAsDataUrl(file);
    return {
      path: dataUrl,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
    };
  },

  async removeProductDeliverable(_filePath: string) {
    return;
  },

  async createCheckout(checkout: Omit<Checkout, 'id'> & { id?: string }) {
    const workspace = await getWorkspace();
    if (!workspace) return null;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    const nextCheckout = sanitizeCheckoutForRuntime({
      ...checkout,
      id: checkout.id || createRuntimeId('demo-checkout'),
      user_id: checkout.user_id || workspace.owner_user_id,
    } as Checkout);

    persistRuntimeState(workspace, {
      ...state,
      checkouts: upsertById(state.checkouts, nextCheckout),
    });

    return nextCheckout;
  },

  async updateCheckout(checkout: Checkout) {
    const workspace = await getWorkspace();
    if (!workspace) return null;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    const nextCheckout = sanitizeCheckoutForRuntime(checkout);

    persistRuntimeState(workspace, {
      ...state,
      checkouts: upsertById(state.checkouts, nextCheckout),
    });

    return nextCheckout;
  },

  async deleteCheckout(checkoutId: string) {
    const workspace = await getWorkspace();
    if (!workspace) return;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    persistRuntimeState(workspace, {
      ...state,
      checkouts: state.checkouts.filter((checkout) => checkout.id !== checkoutId),
      products: state.products.map((product) =>
        product.member_area_checkout_id === checkoutId
          ? {
              ...product,
              member_area_checkout_id: '',
              checkout_slug: '',
              checkout_url: '',
            }
          : product,
      ),
    });
  },

  async uploadCheckoutBanner(file: File): Promise<string> {
    return readFileAsDataUrl(file);
  },

  async createContent(content: Omit<Content, 'id' | 'created_at' | 'updated_at'> & { id?: string }, productId?: string) {
    const workspace = await getWorkspace();
    if (!workspace) return null;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    const now = new Date().toISOString();
    const nextContent = sanitizeContentForRuntime({
      ...content,
      id: content.id || createRuntimeId('demo-content'),
      created_at: now,
      updated_at: now,
    } as Content);
    let productContentLinks = state.product_content_links;

    if (productId) {
      productContentLinks = upsertProductContentLinks(
        productContentLinks.filter((link) => link.content_id !== nextContent.id),
        [{ product_id: productId, content_id: nextContent.id }],
      );
    }

    persistRuntimeState(workspace, {
      ...state,
      contents: upsertById(state.contents, nextContent),
      product_content_links: productContentLinks,
    });

    return nextContent;
  },

  async updateContent(content: Content, productId?: string) {
    const workspace = await getWorkspace();
    if (!workspace) return null;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    const nextContent = sanitizeContentForRuntime({
      ...content,
      updated_at: new Date().toISOString(),
    });
    let productContentLinks = state.product_content_links;

    if (productId !== undefined) {
      productContentLinks = productContentLinks.filter((link) => link.content_id !== nextContent.id);
      if (productId) {
        productContentLinks = upsertProductContentLinks(productContentLinks, [{ product_id: productId, content_id: nextContent.id }]);
      }
    }

    persistRuntimeState(workspace, {
      ...state,
      contents: upsertById(state.contents, nextContent),
      product_content_links: productContentLinks,
    });

    return nextContent;
  },

  async deleteContent(contentId: string) {
    const workspace = await getWorkspace();
    if (!workspace) return;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    const removedModuleIds = state.modules.filter((module) => module.content_id === contentId).map((module) => module.id);
    const removedLessonIds = state.modules
      .filter((module) => removedModuleIds.includes(module.id))
      .flatMap((module) => (module.lessons || []).map((lesson) => lesson.id));

    persistRuntimeState(workspace, {
      ...state,
      contents: state.contents.filter((content) => content.id !== contentId),
      modules: state.modules.filter((module) => module.content_id !== contentId),
      product_content_links: state.product_content_links.filter((link) => link.content_id !== contentId),
      track_items: state.track_items.filter((item) =>
        item.item_id !== contentId
        && !removedModuleIds.includes(item.item_id)
        && !removedLessonIds.includes(item.item_id),
      ),
    });
  },

  async uploadContentThumbnail(file: File): Promise<string> {
    return readFileAsDataUrl(file);
  },

  async uploadContentImage(file: File): Promise<string> {
    return readFileAsDataUrl(file);
  },

  async createModule(module: Partial<Module>) {
    const workspace = await getWorkspace();
    if (!workspace) return null;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    const nextModule = sanitizeModuleForRuntime({
      id: String(module.id || createRuntimeId('demo-module')),
      content_id: String(module.content_id || ''),
      title: String(module.title || 'Novo modulo'),
      description: String(module.description || ''),
      order_index: Number(module.order_index || 0),
      created_at: String(module.created_at || new Date().toISOString()),
      image_vertical_url: module.image_vertical_url,
      image_horizontal_url: module.image_horizontal_url,
      is_free: Boolean(module.is_free),
      lessons: Array.isArray(module.lessons) ? module.lessons : [],
    });

    persistRuntimeState(workspace, {
      ...state,
      modules: upsertById(state.modules, nextModule),
    });

    return nextModule;
  },

  async updateModule(module: Module) {
    const workspace = await getWorkspace();
    if (!workspace) return null;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    const existing = state.modules.find((entry) => entry.id === module.id);
    const nextModule = sanitizeModuleForRuntime({
      ...module,
      lessons: module.lessons !== undefined ? module.lessons : existing?.lessons,
    });

    persistRuntimeState(workspace, {
      ...state,
      modules: upsertById(state.modules, nextModule),
    });

    return nextModule;
  },

  async deleteModule(moduleId: string) {
    const workspace = await getWorkspace();
    if (!workspace) return;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    const lessonIds = state.modules.find((module) => module.id === moduleId)?.lessons?.map((lesson) => lesson.id) || [];

    persistRuntimeState(workspace, {
      ...state,
      modules: state.modules.filter((module) => module.id !== moduleId),
      track_items: state.track_items.filter((item) => item.item_id !== moduleId && !lessonIds.includes(item.item_id)),
    });
  },

  async uploadModuleImage(file: File): Promise<string> {
    return readFileAsDataUrl(file);
  },

  async createLesson(lesson: Omit<Lesson, 'id' | 'created_at'> & { id?: string; created_at?: string }) {
    const workspace = await getWorkspace();
    if (!workspace) return null;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    const nextLesson = sanitizeLessonForRuntime({
      ...lesson,
      id: lesson.id || createRuntimeId('demo-lesson'),
      created_at: lesson.created_at || new Date().toISOString(),
    } as Lesson);

    persistRuntimeState(workspace, {
      ...state,
      modules: state.modules.map((module) =>
        module.id === nextLesson.module_id
          ? {
              ...module,
              lessons: [...(module.lessons || []).filter((entry) => entry.id !== nextLesson.id), nextLesson],
            }
          : module,
      ),
    });

    return nextLesson;
  },

  async updateLesson(lesson: Lesson) {
    const workspace = await getWorkspace();
    if (!workspace) return null;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    const nextLesson = sanitizeLessonForRuntime(lesson);

    persistRuntimeState(workspace, {
      ...state,
      modules: state.modules.map((module) =>
        module.id === nextLesson.module_id
          ? {
              ...module,
              lessons: (module.lessons || []).map((entry) => entry.id === nextLesson.id ? nextLesson : entry),
            }
          : module,
      ),
    });

    return nextLesson;
  },

  async deleteLesson(lessonId: string) {
    const workspace = await getWorkspace();
    if (!workspace) return;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    persistRuntimeState(workspace, {
      ...state,
      modules: state.modules.map((module) => ({
        ...module,
        lessons: (module.lessons || []).filter((lesson) => lesson.id !== lessonId),
      })),
      track_items: state.track_items.filter((item) => item.item_id !== lessonId),
    });
  },

  async uploadLessonImage(file: File): Promise<string> {
    return readFileAsDataUrl(file);
  },

  async setProductContents(productId: string, contentIds: string[]) {
    const workspace = await getWorkspace();
    if (!workspace) return;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    const nextLinks = contentIds.map((contentId) => ({ product_id: productId, content_id: contentId }));

    persistRuntimeState(workspace, {
      ...state,
      product_content_links: upsertProductContentLinks(
        state.product_content_links.filter((link) => link.product_id !== productId),
        nextLinks,
      ),
    });
  },

  async setContentProduct(contentId: string, productId: string | null) {
    const workspace = await getWorkspace();
    if (!workspace) return;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    const nextLinks = productId ? [{ product_id: productId, content_id: contentId }] : [];

    persistRuntimeState(workspace, {
      ...state,
      product_content_links: upsertProductContentLinks(
        state.product_content_links.filter((link) => link.content_id !== contentId),
        nextLinks,
      ),
    });
  },

  async createMemberArea(area: Omit<MemberArea, 'id' | 'created_at'> & { id?: string; created_at?: string }) {
    const workspace = await getWorkspace();
    if (!workspace) return null;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    const nextArea = sanitizeMemberAreaForRuntime({
      ...area,
      id: area.id || createRuntimeId('demo-member-area'),
      owner_id: area.owner_id || workspace.owner_user_id,
      created_at: area.created_at || new Date().toISOString(),
    } as MemberArea);

    persistRuntimeState(workspace, {
      ...state,
      member_areas: upsertById(state.member_areas, nextArea),
    });

    return nextArea;
  },

  async updateMemberArea(area: MemberArea) {
    const workspace = await getWorkspace();
    if (!workspace) return null;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    const nextArea = sanitizeMemberAreaForRuntime(area);

    persistRuntimeState(workspace, {
      ...state,
      member_areas: upsertById(state.member_areas, nextArea),
    });

    return nextArea;
  },

  async deleteMemberArea(areaId: string) {
    const workspace = await getWorkspace();
    if (!workspace) return;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    const removedContentIds = state.contents
      .filter((content) => content.member_area_id === areaId)
      .map((content) => content.id);
    const removedModuleIds = state.modules
      .filter((module) => removedContentIds.includes(module.content_id))
      .map((module) => module.id);
    const removedLessonIds = state.modules
      .filter((module) => removedModuleIds.includes(module.id))
      .flatMap((module) => (module.lessons || []).map((lesson) => lesson.id));

    persistRuntimeState(workspace, {
      ...state,
      member_areas: state.member_areas.filter((area) => area.id !== areaId),
      contents: state.contents.filter((content) => content.member_area_id !== areaId),
      modules: state.modules.filter((module) => !removedContentIds.includes(module.content_id)),
      tracks: state.tracks.filter((track) => track.member_area_id !== areaId),
      track_items: state.track_items.filter((item) =>
        !removedContentIds.includes(item.item_id)
        && !removedModuleIds.includes(item.item_id)
        && !removedLessonIds.includes(item.item_id),
      ),
      product_content_links: state.product_content_links.filter((link) => !removedContentIds.includes(link.content_id)),
      products: state.products.map((product) =>
        product.member_area_id === areaId
          ? {
              ...product,
              member_area_id: undefined,
            }
          : product,
      ),
    });
  },

  async uploadMemberAreaLogo(file: File): Promise<string> {
    return readFileAsDataUrl(file);
  },

  async uploadMemberAreaFavicon(file: File): Promise<string> {
    return readFileAsDataUrl(file);
  },

  async uploadMemberAreaLoginImage(file: File): Promise<string> {
    return readFileAsDataUrl(file);
  },

  async uploadMemberAreaBanner(file: File): Promise<string> {
    return readFileAsDataUrl(file);
  },

  async createTrack(track: Omit<Track, 'id' | 'created_at'>) {
    const workspace = await getWorkspace();
    if (!workspace) return null;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    const nextTrack = sanitizeTrackForRuntime({
      ...track,
      id: createRuntimeId('demo-track'),
      created_at: new Date().toISOString(),
    } as Track);

    persistRuntimeState(workspace, {
      ...state,
      tracks: upsertById(state.tracks, nextTrack),
    });

    return nextTrack;
  },

  async updateTrack(track: Partial<Track> & { id: string }) {
    const workspace = await getWorkspace();
    if (!workspace) return null;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    const existing = state.tracks.find((entry) => entry.id === track.id);
    if (!existing) return null;

    const nextTrack = sanitizeTrackForRuntime({
      ...existing,
      ...track,
    } as Track);

    persistRuntimeState(workspace, {
      ...state,
      tracks: upsertById(state.tracks, nextTrack),
    });

    return nextTrack;
  },

  async deleteTrack(trackId: string) {
    const workspace = await getWorkspace();
    if (!workspace) return;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    persistRuntimeState(workspace, {
      ...state,
      tracks: state.tracks.filter((track) => track.id !== trackId),
      track_items: state.track_items.filter((item) => item.track_id !== trackId),
    });
  },

  async addTrackItem(trackId: string, itemId: string, position: number) {
    const workspace = await getWorkspace();
    if (!workspace) return null;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    const existing = state.track_items.find((item) => item.track_id === trackId && item.item_id === itemId);
    const nextItem = sanitizeTrackItemForRuntime(existing || {
      id: createRuntimeId('demo-track-item'),
      track_id: trackId,
      item_id: itemId,
      position,
      created_at: new Date().toISOString(),
    });

    persistRuntimeState(workspace, {
      ...state,
      track_items: upsertById(
        state.track_items.filter((item) => item.id !== nextItem.id),
        nextItem,
      ),
    });

    return nextItem;
  },

  async removeTrackItem(itemId: string) {
    const workspace = await getWorkspace();
    if (!workspace) return;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    persistRuntimeState(workspace, {
      ...state,
      track_items: state.track_items.filter((item) => item.id !== itemId),
    });
  },

  async updateTrackPositions(updates: { id: string; position: number }[]) {
    const workspace = await getWorkspace();
    if (!workspace) return;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    const positions = new Map(updates.map((update) => [update.id, update.position]));

    persistRuntimeState(workspace, {
      ...state,
      tracks: state.tracks.map((track) =>
        positions.has(track.id)
          ? {
              ...track,
              position: positions.get(track.id) ?? track.position,
            }
          : track,
      ),
    });
  },

  async getScenarios() {
    const workspace = await getWorkspace();
    return workspace?.seed_payload.scenarios || [];
  },

  async getSelectedScenario(checkoutId: string, paymentMethod: string): Promise<DemoScenarioStatus> {
    const workspace = await getWorkspace();
    if (!workspace) return getDefaultScenario(paymentMethod);

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    persistRuntimeState(workspace, state);

    return state.selected_scenarios[getScenarioStateKey(checkoutId, paymentMethod)]
      || getDefaultScenario(paymentMethod);
  },

  async setSelectedScenario(checkoutId: string, paymentMethod: string, scenario: DemoScenarioStatus) {
    const workspace = await getWorkspace();
    if (!workspace) return;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    persistRuntimeState(workspace, {
      ...state,
      selected_scenarios: {
        ...state.selected_scenarios,
        [getScenarioStateKey(checkoutId, paymentMethod)]: scenario,
      },
    });
  },

  buildPixData(orderId: string, amount: number) {
    const cents = Math.round((amount || 0) * 100).toString().padStart(4, '0');
    const qrCode = `00020126360014BR.GOV.BCB.PIX0114+5511999999999520400005303986540${cents}5802BR5920Super Checkout Demo6009SaoPaulo62070503***6304${orderId.slice(0, 4).toUpperCase()}`;

    return {
      qr_code: qrCode,
      qr_code_base64:
        'iVBORw0KGgoAAAANSUhEUgAAAOQAAADkCAIAAACVT/22AAAACXBIWXMAAAsSAAALEgHS3X78AAABiElEQVR4nO3RMQ0AAAjDMO5fNCA8hD0SkwG2s7M7A0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPgY2m3vAABY6y4fAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH4G9v0AAQJ4gRQAAAAASUVORK5CYII=',
    };
  },

  buildOrderDeliverables(workspace: DemoWorkspace, order: Order) {
    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    const resolution = resolveMemberFromOrder(workspace, state, {
      requestedUserId: order.customer_user_id,
      email: order.customer_email,
      fullName: order.customer_name,
    });
    return buildDemoDeliverables(workspace, resolution.state, order, resolution.member).deliverables;
  },

  async getBusinessSettings() {
    const workspace = await getWorkspace();
    if (!workspace) return null;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    persistRuntimeState(workspace, state);
    return state.business_settings;
  },

  async getBusinessSettingsHistory(): Promise<DemoLegalHistoryEntry[]> {
    const workspace = await getWorkspace();
    if (!workspace) return [];

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    persistRuntimeState(workspace, state);
    return state.legal_history;
  },

  async saveBusinessSettings(params: {
    settings: Partial<DemoBusinessSettingsRecord> & BusinessLegalSettingsLike;
    historySnapshots?: LegalDocumentHistorySnapshot[];
    savedByUserId?: string | null;
  }) {
    const workspace = await getWorkspace();
    if (!workspace) {
      return {
        settings: null,
        history: [],
      };
    }

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    const savedAt = String(params.settings.updated_at || new Date().toISOString());
    const nextSettings = normalizeDemoBusinessSettings(workspace, {
      ...state.business_settings,
      ...params.settings,
      business_email: params.settings.business_email || params.settings.support_email || state.business_settings?.business_email,
      updated_at: savedAt,
      demo_mode: true,
    });
    const nextEntries = (params.historySnapshots || []).map((snapshot) =>
      createDemoLegalHistoryEntry(workspace, snapshot, savedAt, params.savedByUserId),
    );
    const nextHistory = normalizeDemoLegalHistory(
      upsertBatchById(state.legal_history, nextEntries).slice(0, 24),
    );

    persistRuntimeState(workspace, {
      ...state,
      business_settings: nextSettings,
      legal_history: nextHistory,
    });

    return {
      settings: nextSettings,
      history: nextHistory,
    };
  },

  async getIntegration(name: string) {
    if (name === 'resend') {
      return {
        id: 'demo-integration-resend',
        name: 'resend',
        active: true,
        config: { api_key: 're_demo123456789' },
        created_at: new Date().toISOString(),
      };
    }
    return null;
  },

  async getWebhooks() {
    const workspace = await getWorkspace();
    if (!workspace) return [];

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    persistRuntimeState(workspace, state);
    return state.webhooks;
  },

  async saveWebhooks(items: WebhookConfig[]) {
    const workspace = await getWorkspace();
    if (!workspace) return [];

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    const nextWebhooks = normalizeDemoWebhooks(
      upsertBatchById(state.webhooks, items).slice(0, 24),
    );

    persistRuntimeState(workspace, {
      ...state,
      webhooks: nextWebhooks,
    });

    await syncDemoWebhookSession(nextWebhooks);
    return nextWebhooks;
  },

  async deleteWebhook(id: string) {
    const workspace = await getWorkspace();
    if (!workspace) return;

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    const nextWebhooks = state.webhooks.filter((hook) => hook.id !== id);
    const nextLogs = state.webhook_logs.filter((log) => log.webhook_id !== id);

    persistRuntimeState(workspace, {
      ...state,
      webhooks: nextWebhooks,
      webhook_logs: nextLogs,
    });

    if (nextWebhooks.length === 0) {
      await clearDemoWebhookSession();
      return;
    }

    await syncDemoWebhookSession(nextWebhooks);
  },

  async getWebhookLogs() {
    const workspace = await getWorkspace();
    if (!workspace) return [];

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    persistRuntimeState(workspace, state);
    return state.webhook_logs;
  },

  async saveWebhookLogs(items: WebhookLog[]) {
    const workspace = await getWorkspace();
    if (!workspace || !items.length) return [];

    const state = reconcileRuntimeState(workspace, loadRuntimeState(workspace));
    const nextState = applyWebhookLogsToState(state, items);
    persistRuntimeState(workspace, nextState);

    return nextState.webhook_logs;
  },
};
