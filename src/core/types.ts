
// Core Entities

export enum PaymentType {
  ONE_TIME = 'one_time',
  RECURRING = 'recurring',
  FREE = 'free',
}

export enum RecurrenceType {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
  NONE = 'none',
}

export enum GatewayProvider {
  MERCADO_PAGO = 'mercado_pago',
  STRIPE = 'stripe', // Future
  PIX = 'pix',       // Native/Manual
}

export enum OrderStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  CANCELED = 'canceled',
  REFUNDED = 'refunded'
}

export enum DomainStatus {
  ACTIVE = 'active',
  PENDING = 'pending',
  VERIFYING = 'verifying',
  ERROR = 'error'
}

export enum DomainType {
  CNAME = 'cname',
  REDIRECT = 'redirect'
}

export interface InstallmentOption {
  installments: number;
  installmentAmount: number;
  totalAmount: number;
  label: string; // Ex: "12x de R$ 10,50 (com juros)"
}

export interface Product {
  id: string;
  name: string;
  description: string;
  active: boolean;
  imageUrl?: string;
  // New fields for UI Overhaul
  price_real?: number;    // Preço "Por"
  price_fake?: number;    // Preço "De"
  member_area_action?: 'checkout' | 'sales_page'; // Ação ao clicar na área de membros
  member_area_checkout_id?: string; // Checkout específico para redirecionamento
  sku?: string;           // Código
  category?: string;
  redirect_link?: string;
  is_order_bump?: boolean;
  is_upsell?: boolean;
  checkout_slug?: string;
  checkout_url?: string;
  visible_in_member_area?: boolean;
  for_sale?: boolean;
  currency?: string; // New: Currency support (BRL, USD, EUR)
  saas_plan_slug?: string;
  member_area_id?: string; // Links product to a specific member area
}

export interface Offer {
  id: string;
  product_id: string;
  name: string;
  price: number;
  currency?: string; // New: Currency support
  payment_type: PaymentType;
  recurrence_type: RecurrenceType;
  active: boolean;
}

export enum DomainUsage {
  SYSTEM = 'system',      // For admin panel access
  CHECKOUT = 'checkout',
  MEMBER_AREA = 'member_area'
}

export interface Domain {
  id: string;
  domain: string; // ex: checkout.meusite.com
  checkout_id?: string; // Checkout padrão vinculado (opcional)
  slug?: string; // Slug padrão
  type: DomainType;
  status: DomainStatus;
  usage: DomainUsage; // New field for domain purpose
  created_at: string;
}

export interface CheckoutConfig {
  fields: {
    name: boolean;
    email: boolean;
    phone: boolean;
    cpf: boolean;
  };
  payment_methods: {
    pix: boolean;
    credit_card: boolean;
    boleto: boolean;
    apple_pay?: boolean;
    google_pay?: boolean;
  };
  timer: {
    active: boolean;
    minutes: number;
    bg_color: string;
    text_color: string;
  };
  header_image?: string;
  primary_color?: string;
  pixels?: {
    active: boolean;
    facebook_pixel_id?: string;
    google_analytics_id?: string;
    google_ads_id?: string;
    tiktok_pixel_id?: string;
    gtm_id?: string;
  };
  upsell?: {
    active: boolean;
    product_id: string;
    // Content
    title?: string;
    subtitle?: string;
    description?: string;
    media_type: 'video' | 'image';
    media_url?: string;
    button_text?: string;
    // Visibility Toggles
    show_title: boolean;
    show_subtitle: boolean;
    show_description: boolean;
    show_media: boolean;
  };
}

export interface Checkout {
  id: string;
  user_id: string;
  name: string;
  active: boolean;

  // Relations
  product_id: string; // Main product directly linked
  offer_id?: string; // Optional: legacy or specific offer
  gateway_id: string;
  domain_id?: string | null;

  // Sales Strategy
  order_bump_ids: string[]; // List of product IDs
  upsell_product_id?: string; // One click upsell product ID

  // URL
  custom_url_slug: string;
  thank_you_button_url?: string | null;
  thank_you_button_text?: string | null;

  // Multi-currency & Failover
  currency?: 'BRL' | 'USD' | 'EUR';
  backup_gateway_id?: string | null;

  // Visual & Behavior Config
  config: CheckoutConfig;
}

export interface Gateway {
  id: string;
  name: GatewayProvider;
  public_key: string;
  private_key: string; // Stored but usually not sent to frontend in real app
  webhook_secret: string;
  active: boolean;
  config?: {
    max_installments?: number;
    min_installment_value?: number;
    interest_rate?: number;
    [key: string]: any;
  };
}

export interface OrderItem {
  name: string;
  price: number;
  quantity: number;
  product_id?: string;
  type: 'main' | 'bump' | 'upsell';
}

export interface Order {
  id: string;
  offer_id: string;
  checkout_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string; // Added for CRM
  customer_cpf?: string;   // Added for CRM
  amount: number;
  status: OrderStatus;
  payment_method: 'credit_card' | 'pix' | 'boleto' | 'apple_pay' | 'google_pay'; // Added for CRM
  items?: OrderItem[]; // Added for details
  metadata?: any;
  created_at: string;
  customer_user_id?: string; // ID of the user who purchased (for access grants)
}

export interface Payment {
  id: string;
  order_id: string;
  gateway_id: string;
  status: OrderStatus;
  transaction_id: string;
  raw_response: string;
  created_at: string;
  user_id?: string; // Merchant ID for RLS
}

export interface WebhookHeader {
  key: string;
  value: string;
}

export interface WebhookConfig {
  id: string;
  name: string;
  description?: string;
  url: string;
  method: 'POST' | 'GET' | 'PUT' | 'PATCH';
  headers: WebhookHeader[];
  events: string[]; // e.g., 'checkout.completed', 'payment.failed'
  active: boolean;
  secret?: string;
  created_at: string;
  last_fired_at?: string;
  last_status?: number; // 200, 400, 500
}

export interface WebhookLog {
  id: string;
  webhook_id?: string; // If outgoing
  gateway_id?: string; // If incoming
  direction: 'incoming' | 'outgoing';
  event: string;
  payload: string; // Request body
  response_status?: number;
  response_body?: string;
  duration_ms?: number;
  created_at: string;
  processed?: boolean; // Legacy for incoming
  raw_data?: string; // Legacy for incoming
}

// API / Service Responses
export interface PaymentResponse {
  success: boolean;
  transactionId?: string;
  redirectUrl?: string;
  qrCode?: string;
  error?: string;
}

export interface Integration {
  id: string;
  name: string;
  config: any;
  active: boolean;
  created_at: string;
}

// --- MEMBER AREA TYPES ---

export interface Content {
  id: string;
  title: string;
  description: string;
  thumbnail_url: string;
  type: 'course' | 'pack' | 'software' | 'ebook';
  member_area_id: string;
  author_id?: string;
  created_at: string;
  updated_at: string;
  modules_count?: number; // Helper for UI
  image_vertical_url?: string;
  image_horizontal_url?: string;

  modules_layout?: 'vertical' | 'horizontal';
  is_free?: boolean;
  associated_product?: Product; // Product that grants access to this content
}

export interface Module {
  id: string;
  content_id: string;
  title: string;
  description: string;
  order_index: number;
  created_at: string;
  lessons?: Lesson[]; // Nested for UI
  image_vertical_url?: string;
  image_horizontal_url?: string;
  is_free?: boolean;
  associated_product?: Product;
  content?: Content;
}

export interface LessonResource {
  id: string;
  title: string;
  image_url: string;
  link_url: string;
  button_text: string;
}

export interface Lesson {
  id: string;
  module_id: string;
  title: string;
  content_type: 'video' | 'text' | 'file' | 'link' | 'embed';
  video_url?: string;
  content_text?: string;
  file_url?: string;
  order_index: number;
  duration?: number;
  is_free: boolean;
  created_at: string;
  image_url?: string;
  gallery?: LessonResource[];
  associated_product?: Product;
  module?: Module; // Populated in some queries
  content_order?: string[]; // e.g. ['video', 'text', 'gallery', 'file']
}

export interface AccessGrant {
  id: string;
  user_id: string;
  content_id: string | null;
  product_id?: string;
  granted_at: string;
  status: 'active' | 'revoked' | 'expired';
  content?: Content; // Joined
  expires_at?: string; // New: Subscription expiration
  is_subscription?: boolean; // New
  subscription_provider_id?: string; // New
  subscription_status?: 'active' | 'past_due' | 'canceled' | 'trialing'; // New
}

export interface Profile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  status: 'active' | 'suspended' | 'disabled';
  role: 'member' | 'admin' | 'moderator' | 'owner' | 'master_admin'; // master_admin for central control
  last_seen_at?: string;
  created_at: string;
  updated_at?: string;
  installation_id?: string;
  last_login_at?: string;
  is_blocked?: boolean;
  blocked_at?: string;
  signup_source?: string;
  totp_secret_encrypted?: string | null;
  totp_enabled?: boolean;
  totp_verified_at?: string | null;
}


export interface MemberNote {
  id: string;
  user_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author?: Profile; // Joined
}

export interface MemberTag {
  id: string;
  user_id: string;
  tag: string;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  event: string;
  metadata?: any;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export interface SystemInfo {
  id: string;
  core_version: string;
  db_version: string;
  ui_version: string;
  installed_at: string;
  last_update_at?: string;
  license_key?: string;
  github_installation_id?: string; // New: GitHub App Integration
  github_repository?: string; // New: owner/repo
  metadata?: any;
}

export interface SystemFeature {
  id: string;
  feature_key: string;
  is_enabled: boolean;
  settings?: any;
  last_validated_at: string;
}

export interface SystemUpdateLog {
  id: string;
  from_version: string;
  to_version: string;
  status: 'pending' | 'success' | 'error' | 'downloading' | 'completed' | 'failed';
  commit_hash?: string;
  error_message?: string;
  executed_at: string;
  backup_branch?: string;
  files_updated?: number;
}

export interface MemberArea {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  domain_id?: string;
  logo_url?: string;
  primary_color: string;
  favicon_url?: string;
  created_at: string;
  layout_mode?: 'content' | 'module';
  card_style?: 'standard' | 'flyer';
  login_image_url?: string;
  allow_free_signup?: boolean;
  banner_url?: string;
  banner_title?: string;
  banner_description?: string;
  banner_button_text?: string;
  banner_button_link?: string;
  sidebar_config?: SidebarItem[];
  custom_links?: CustomLink[];
  faqs?: FAQ[];
  custom_branding?: boolean; // Entitlement check
}

export interface CustomLink {
  id: string;
  title: string;
  url: string;
  icon: string;
  active: boolean;
}

export interface FAQ {
  id: string;
  question: string;
  answer: string;
  active: boolean;
}

export interface SidebarItem {
  id: string;
  title: string;
  type: 'link' | 'section';
  url?: string;
  icon?: string;
  children?: SidebarItem[];
}

export interface LessonProgress {
  id: string;
  user_id: string;
  lesson_id: string;
  completed: boolean;
  last_position_seconds?: number;
  updated_at: string;
}

export interface Track {
  id: string;
  member_area_id: string;
  title: string;
  type: 'products' | 'contents' | 'modules' | 'lessons';
  position: number;
  is_visible: boolean;
  created_at: string;
  items?: TrackItem[]; // Nested for UI
  card_style?: 'vertical' | 'horizontal';
}

export interface TrackItem {
  id: string;
  track_id: string;
  item_id: string;
  position: number;
  created_at: string;
  // Polymorphic relations - populated based on track type
  product?: Product;
  content?: Content;
  module?: Module;
  lesson?: Lesson;
}

export interface Member {
  user_id: string;
  email: string;
  name: string;
  joined_at: string;
  status: 'active' | 'revoked' | 'expired';
}

export interface Plan {
  id: string;
  name: string;
  slug: string;
  type: string;
  price: number;
  active: boolean;
  max_domains?: number;
  limits?: any;
  description?: string;
  image_url?: string;
  checkout_url?: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: 'active' | 'canceled' | 'past_due';
  started_at: string;
  ends_at?: string;
  plan?: Plan; // Joined
}

export interface UserOnboarding {
  user_id: string;
  domain_configured: boolean;
  gateway_configured: boolean;
  webhook_configured: boolean;
  setup_completed: boolean;
  updated_at: string;
}
