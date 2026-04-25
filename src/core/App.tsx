import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthDebug } from './pages/debug/AuthDebug';
import { AuthProvider, useAuth } from './context/AuthContext';
import { InstallationProvider } from './context/InstallationContext';

import { Dashboard } from './pages/admin/Dashboard';
import { AdminRoute } from './components/admin/AdminRoute';
import { Products } from './pages/admin/Products';
import { Offers } from './pages/admin/Offers';
import { Checkouts } from './pages/admin/Checkouts';
import { CheckoutEditor } from './pages/admin/CheckoutEditor';
import { Gateways } from './pages/admin/Gateways';
import { SystemUpdates } from './pages/admin/SystemUpdates';
import { Domains } from './pages/admin/Domains';
import { Settings } from './pages/admin/Settings';
import { Orders } from './pages/admin/Orders';
import { Webhooks } from './pages/admin/Webhooks';
import { Licenses } from './pages/admin/Licenses';
import { SystemLicenses } from './pages/admin/SystemLicenses';
import { SecurityEvents } from './pages/admin/SecurityEvents';
// import { SetupWizard } from './pages/admin/SetupWizard';
import { BusinessSettings } from './pages/admin/BusinessSettings';
// import { MyLicense } from './pages/admin/saas/MyLicense';
import { MyInstallations } from './pages/admin/Installations';
import { LeadCRM } from './pages/admin/LeadCRM'; // New
import { FreeUserDetails } from './pages/admin/FreeUserDetails'; // New
import { PartnerDashboard } from './pages/admin/PartnerDashboard'; // New
// import { SystemWebhooks } from './pages/admin/saas/SystemWebhooks';
import { Marketing } from './pages/Marketing';
import { IntegrationsHub } from './pages/IntegrationsHub';
import { Notifications } from './pages/admin/Notifications';
import { MemberAreas } from './pages/admin/MemberAreas';
import { MemberAreaDashboard } from './pages/admin/MemberAreaDashboard';
import { ContentEditor } from './pages/admin/ContentEditor';
import { MemberDashboard } from './pages/member/MemberDashboard';
import { CoursePlayer } from './pages/member/CoursePlayer';
import { ContentModules } from './pages/member/ContentModules';
import { PublicCheckout } from './pages/public/PublicCheckout';
import { PixPayment } from './pages/public/PixPayment';
import { UpsellPage } from './pages/public/UpsellPage';
import { ThankYou } from './pages/public/ThankYou';
import { Login } from './pages/Login';
import { UpdatePassword } from './pages/UpdatePassword';
import { MemberLogin } from './pages/member/MemberLogin';
import { MemberSignup } from './pages/member/MemberSignup';
import Setup from './pages/public/Setup';
import { Register } from './pages/public/Register';
import { MemberAreaWrapper } from './pages/member/MemberAreaWrapper';
import { MemberProducts } from './pages/member/MemberProducts';
import { MyProducts } from './pages/member/MyProducts';
import { MemberFAQ } from './pages/member/MemberFAQ';
import { MemberProfile } from './pages/member/MemberProfile';
import { ActivationLogin } from './pages/activation/ActivationLogin';
import { ActivationPortal } from './pages/activation/ActivationPortal';
import { ActivationContentEditor } from './pages/admin/ActivationContentEditor';
import { PublicPrivacy } from './pages/public/PublicPrivacy';
import { PublicTerms } from './pages/public/PublicTerms';
import { PlatformPrivacy } from './pages/public/PlatformPrivacy';
import { PlatformTerms } from './pages/public/PlatformTerms';
import { LicenseGuard } from './components/LicenseGuard';
import { Loading } from './components/ui/Loading';
import InstallerWizard from './pages/installer/InstallerWizard';
import { WebhookDocs } from './pages/docs/WebhookDocs'; // Import Docs
import { ThemeProvider } from './context/ThemeContext';
import { ConfigLoader } from './components/ConfigLoader';
import { Toaster } from 'sonner';
import { getEnv } from './utils/env';

import { storage } from './services/storageService';
import { DomainUsage } from './types';

const getHostnameFromUrl = (url?: string) => {
  if (!url) return null;

  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
};

const SYSTEM_HOSTNAMES = new Set(
  [
    'supercheckout.app',
    'www.supercheckout.app',
    'app.supercheckout.app',
    'portal.supercheckout.app',
    'install.supercheckout.app',
    'super-checkout.vercel.app',
    getHostnameFromUrl(import.meta.env.VITE_SUPER_CHECKOUT_MARKETING_URL),
    getHostnameFromUrl(import.meta.env.VITE_SUPER_CHECKOUT_APP_URL),
    getHostnameFromUrl(import.meta.env.VITE_SUPER_CHECKOUT_PORTAL_URL),
    getHostnameFromUrl(import.meta.env.VITE_SUPER_CHECKOUT_INSTALL_URL),
    getHostnameFromUrl(import.meta.env.VITE_APP_URL),
  ].filter(Boolean) as string[]
);

const PORTAL_HOSTNAMES = new Set(
  [
    'portal.supercheckout.app',
    getHostnameFromUrl(import.meta.env.VITE_SUPER_CHECKOUT_PORTAL_URL),
  ].filter(Boolean) as string[]
);

const INSTALL_HOSTNAMES = new Set(
  [
    'install.supercheckout.app',
    getHostnameFromUrl(import.meta.env.VITE_SUPER_CHECKOUT_INSTALL_URL),
  ].filter(Boolean) as string[]
);

const getCurrentHostname = () => {
  if (typeof window === 'undefined') return '';
  return window.location.hostname.toLowerCase();
};

const isLocalHostname = (hostname: string) =>
  hostname.includes('localhost') || hostname.includes('127.0.0.1');

const getHostAwareLoginPath = (hostname = getCurrentHostname()) => {
  if (PORTAL_HOSTNAMES.has(hostname)) {
    return '/activate';
  }

  return '/login';
};

const getHostAwareRootPath = (hostname = getCurrentHostname()) => {
  if (PORTAL_HOSTNAMES.has(hostname)) {
    return '/activate';
  }

  if (INSTALL_HOSTNAMES.has(hostname)) {
    return '/installer';
  }

  return '/admin';
};

const HostAwareLoginRoute: React.FC = () => {
  const hostname = getCurrentHostname();

  if (!hostname || isLocalHostname(hostname)) {
    return <Login />;
  }

  if (PORTAL_HOSTNAMES.has(hostname)) {
    return <Navigate to="/activate" replace />;
  }

  return <Login />;
};

const HostAwareRootRoute: React.FC = () => (
  <Navigate to={getHostAwareRootPath()} replace />
);

const isSystemHostname = (hostname: string) => {
  const normalizedHostname = hostname.toLowerCase();

  return (
    isLocalHostname(normalizedHostname) ||
    normalizedHostname.includes('.vercel.app') ||
    normalizedHostname.includes('.webcontainer.io') ||
    SYSTEM_HOSTNAMES.has(normalizedHostname)
  );
};

// Protected Route Wrapper
const ProtectedRoute: React.FC<{ children: React.ReactNode; redirectPath?: string }> = ({ children, redirectPath }) => {
  const { user, loading } = useAuth();
  const { t } = useTranslation('common');
  const resolvedRedirectPath = redirectPath || getHostAwareLoginPath();

  if (loading) {
    return <div className="h-screen w-screen flex items-center justify-center bg-[#05050A] text-white italic font-bold uppercase tracking-widest text-xs animate-pulse">{t('loading')}</div>;
  }

  if (!user) {
    return <Navigate to={resolvedRedirectPath} replace />;
  }

  return <>{children}</>;
};

const DomainDispatcher = () => {
  const { t } = useTranslation('common');
  const [loading, setLoading] = useState(true);
  const [customCheckoutId, setCustomCheckoutId] = useState<string | null>(null);
  const [customMemberAreaSlug, setCustomMemberAreaSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkDomain = async () => {
      const hostname = window.location.hostname;

      console.log('Current hostname:', hostname);

      // Ignorar domínios do sistema
      if (isSystemHostname(hostname)) {
        console.log('System domain detected, skipping custom domain check.');
        setLoading(false);
        return;
      }

      try {
        console.log('Checking custom domain in DB...');
        const domain = await storage.getDomainByHostname(hostname);
        console.log('Domain found:', domain);

        if (domain) {
          // 1. Check Status and Auto-Verify
          if (domain.status !== 'active') {
            console.log('Domain pending. Attempting auto-verification...');
            // Try to auto-verify
            try {
              const verifyRes = await fetch(`/api/domains/verify?domain=${hostname}`);
              const verifyData = await verifyRes.json();

              if (verifyData.verified && verifyData.status === 'active') {
                console.log('Auto-verification successful! Reloading...');
                window.location.reload();
                return;
              }
            } catch (vErr) {
              console.error('Auto-verification failed:', vErr);
            }

            setError(t('dns_propagation_warn'));
            setLoading(false);
            return;
          }

          const pathname = window.location.pathname;

          // --- CHECKOUT DOMAIN LOGIC ---
          if (domain.usage === DomainUsage.CHECKOUT) {
            // Check for reserved paths
            if (pathname === '/privacy-policy' || pathname === '/terms-of-purchase' || pathname.startsWith('/thank-you') || pathname.startsWith('/pagamento') || pathname.startsWith('/upsell')) {
              setLoading(false);
              setCustomCheckoutId('system');
              return;
            }

            const slug = pathname.substring(1);
            const checkout = await storage.getCheckoutByDomainAndSlug(domain.id, slug);

            if (checkout) {
              setCustomCheckoutId(checkout.id);
            } else {
              setError(t('checkout_not_found'));
            }
            setLoading(false);
            return;
          }

          // --- MEMBER AREA DOMAIN LOGIC ---
          if (domain.usage === DomainUsage.MEMBER_AREA) {
            const memberArea = await storage.getMemberAreaByDomain(domain.id);

            if (memberArea) {
              setCustomMemberAreaSlug(memberArea.slug);
            } else {
              setError(t('member_area_not_found'));
            }
            setLoading(false);
            return;
          }

          // --- SYSTEM DOMAIN LOGIC ---
          // Allow standard routing (Admin panel, etc.)
          if (domain.usage === DomainUsage.SYSTEM) {
            console.log('System domain detected, allowing standard routing.');
            setLoading(false);
            return;
          }

          // --- FALLBACK FOR UNKNOWN USAGE ---
          // If domain exists but has unknown usage, allow standard routing
          console.log('Unknown domain usage, allowing standard routing.');
          setLoading(false);

        } else {
          // Domain points here but not found in DB
          setError(t('domain_not_configured'));
          setLoading(false);
        }
      } catch (err) {
        console.error('Erro ao verificar domínio:', err);
        setError(t('domain_load_error'));
        setLoading(false);
      }
    };

    const domainCheckTimeout = setTimeout(() => {
      console.warn('DomainDispatcher: Check timed out, forcing standard load.');
      // If domain check fails, we assume it's safe to load standard routes (admin/public)
      // rather than blocking the entire app forever.
      setLoading(false);
    }, 4000);

    checkDomain().finally(() => clearTimeout(domainCheckTimeout));

    return () => clearTimeout(domainCheckTimeout);
  }, []);

  if (loading) {
    return <Loading />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0F0F13] flex flex-col items-center justify-center text-white p-4 text-center">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4 text-red-500">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
        </div>
        <h1 className="text-xl font-bold mb-2 uppercase italic tracking-tighter">{t('access_unavailable')}</h1>
        <p className="text-gray-400 max-w-md">{error}</p>
      </div>
    );
  }

  // RENDER: Checkout Mode
  if (customCheckoutId) {
    return (
      <Routes>
        <Route path="/" element={<PublicCheckout checkoutId={customCheckoutId} />} />
        <Route path="/:slug" element={<PublicCheckout checkoutId={customCheckoutId} />} />
        <Route path="/privacy-policy" element={<PublicPrivacy />} />
        <Route path="/terms-of-purchase" element={<PublicTerms />} />
        <Route path="/pagamento/pix/:orderId" element={<PixPayment />} />
        <Route path="/upsell/:orderId" element={<UpsellPage />} />
        <Route path="/thank-you/:orderId" element={<ThankYou />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  // RENDER: Member Area Mode (Custom Domain)
  if (customMemberAreaSlug) {
    // Logic for Member Area on Root Domain
    // We pass the 'forcedSlug' prop to the wrapper (requires update in MemberAreaWrapper)
    return (
      <Routes>
        {/* Login and Signup at root level for custom domain */}
        <Route path="/login" element={<MemberLogin forcedSlug={customMemberAreaSlug} />} />
        <Route path="/signup" element={<MemberSignup forcedSlug={customMemberAreaSlug} />} />

        {/* Member Area Routes */}
        <Route path="/" element={<MemberAreaWrapper forcedSlug={customMemberAreaSlug} />}>
          <Route index element={<MemberDashboard />} />
          <Route path="products" element={<MemberProducts />} />
          <Route path="my-products" element={<MyProducts />} />
          <Route path="faq" element={<MemberFAQ />} />
          <Route path="my-list" element={<MemberDashboard />} />
          <Route path="content/:id" element={<ContentModules />} />
          <Route path="profile" element={<MemberProfile />} />
        </Route>

        {/* Course Player - Outside wrapper to avoid layout */}
        <Route path="/course/:id" element={<CoursePlayer forcedSlug={customMemberAreaSlug} />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/setup" element={<Setup />} />
      <Route path="/debug-auth" element={<AuthDebug />} />
      <Route path="/login" element={<HostAwareLoginRoute />} />
      <Route path="/register" element={<Register />} />
      <Route path="/update-password" element={<UpdatePassword />} />
      <Route path="/privacy-policy" element={<PublicPrivacy />} />
      <Route path="/terms-of-purchase" element={<PublicTerms />} />
      <Route path="/legal/privacy" element={<PlatformPrivacy />} />
      <Route path="/legal/terms" element={<PlatformTerms />} />
      <Route path="/pagamento/pix/:orderId" element={<PixPayment />} />
      <Route path="/upsell/:orderId" element={<UpsellPage />} />
      <Route path="/thank-you/:orderId" element={<ThankYou />} />
      <Route path="/c/:id" element={<PublicCheckout />} />
      <Route path="/installer" element={<InstallerWizard />} />

      {/* Admin Routes (Protected) */}
      <Route path="/admin" element={<AdminRoute><Dashboard /></AdminRoute>} />
      {/* <Route path="/admin/setup" element={<AdminRoute><SetupWizard /></AdminRoute>} /> REMOVED */}
      <Route path="/admin/business-settings" element={<AdminRoute><BusinessSettings /></AdminRoute>} />
      <Route path="/admin/products" element={<AdminRoute><Products /></AdminRoute>} />
      <Route path="/admin/offers" element={<AdminRoute><Offers /></AdminRoute>} />
      <Route path="/admin/checkouts" element={<AdminRoute><Checkouts /></AdminRoute>} />
      <Route path="/admin/checkouts/edit/:id" element={<AdminRoute><CheckoutEditor /></AdminRoute>} />
      <Route path="/admin/gateways" element={<AdminRoute><Gateways /></AdminRoute>} />
      <Route path="/admin/domains" element={<AdminRoute><Domains /></AdminRoute>} />
      <Route path="/admin/settings" element={<AdminRoute><Settings /></AdminRoute>} />
      <Route path="/admin/orders" element={<AdminRoute><Orders /></AdminRoute>} />
      <Route path="/admin/webhooks" element={<AdminRoute><Webhooks /></AdminRoute>} />
      <Route path="/admin/licenses" element={<AdminRoute><Licenses /></AdminRoute>} />
      <Route path="/admin/system-licenses" element={<AdminRoute><SystemLicenses /></AdminRoute>} />
      <Route path="/admin/security-events" element={<AdminRoute><SecurityEvents /></AdminRoute>} />
      <Route path="/admin/updates" element={<AdminRoute><SystemUpdates /></AdminRoute>} />

      {/* Free Users Management (Leads) */}
      <Route path="/admin/free-users" element={<AdminRoute><LeadCRM /></AdminRoute>} />
      <Route path="/admin/free-users/:id" element={<AdminRoute><FreeUserDetails /></AdminRoute>} />

      {/* SaaS Module Routes (New) */}
      <Route path="/admin/installations" element={<AdminRoute><MyInstallations /></AdminRoute>} />
      <Route path="/admin/partner-dashboard" element={<AdminRoute><PartnerDashboard /></AdminRoute>} />
      {/* <Route path="/admin/saas/webhooks" element={<AdminRoute><SystemWebhooks /></AdminRoute>} /> */}

      <Route path="/admin/marketing" element={<AdminRoute><Marketing /></AdminRoute>} />
      <Route path="/admin/integrations" element={<AdminRoute><IntegrationsHub /></AdminRoute>} />
      <Route path="/admin/notifications" element={<AdminRoute><Notifications /></AdminRoute>} />
      <Route path="/admin/members" element={<AdminRoute><MemberAreas /></AdminRoute>} />
      <Route path="/admin/members/:id" element={<AdminRoute><MemberAreaDashboard /></AdminRoute>} />
      <Route path="/admin/members/:id" element={<AdminRoute><MemberAreaDashboard /></AdminRoute>} />
      <Route path="/admin/contents/:id" element={<AdminRoute><ContentEditor /></AdminRoute>} />

      {/* Activation Portal Admin */}
      <Route path="/admin/activation-content" element={<AdminRoute><ActivationContentEditor /></AdminRoute>} />

      {/* Activation Portal (Client) */}
      <Route path="/activate" element={<ActivationLogin />} />
      <Route path="/activate/setup" element={<ActivationPortal />} />

      {/* Documentation Routes */}
      <Route path="/docs/webhooks" element={<AdminRoute><WebhookDocs /></AdminRoute>} />


      {/* Member Area Public Routes (Standard) */}
      <Route path="/app/:slug/login" element={<MemberLogin />} />
      <Route path="/app/:slug/signup" element={<MemberSignup />} />

      {/* Member Area App Routes with Slug (Standard) */}
      <Route path="/app/:slug" element={<MemberAreaWrapper />}>
        <Route index element={<MemberDashboard />} />
        <Route path="products" element={<MemberProducts />} />
        <Route path="my-products" element={<MyProducts />} />
        <Route path="faq" element={<MemberFAQ />} />
        <Route path="my-list" element={<MemberDashboard />} />
        <Route path="new" element={<MemberDashboard />} />
        <Route path="content/:id" element={<ContentModules />} />
        <Route path="profile" element={<MemberProfile />} />
      </Route>

      {/* Course Player (Fullscreen - Outside Wrapper) */}
      <Route path="/app/:slug/course/:id" element={<CoursePlayer />} />

      {/* Redirect root to Admin */}
      <Route path="/" element={<HostAwareRootRoute />} />
    </Routes>
  );
};

import { GlobalErrorBoundary } from './components/GlobalErrorBoundary';

const App = () => {
  const { t } = useTranslation('common');
  const [isHydrating, setIsHydrating] = React.useState(true);

  // --- CROSS-DOMAIN CONFIG HYDRATION ---
  // Detects keys passed from Installer on a different domain
  React.useEffect(() => {
    const hydrate = () => {
      if (window.location.hash.includes('installer_config=')) {
        try {
          const hash = window.location.hash;
          // Robust parsing
          const configStr = hash.split('installer_config=')[1].split('&')[0];
          // Decode URI component just in case
          const decodedStr = decodeURIComponent(configStr);
          // Handle raw base64 or potentially encoded base64
          // Try/Catch specifically for atob
          let config;
          try {
            config = JSON.parse(atob(decodedStr));
          } catch (e) {
            // Fallback: maybe it wasn't uri encoded? try raw configStr
            config = JSON.parse(atob(configStr));
          }

          console.log('🔧 Hydrating Cross-Domain Config...');
          if (config.url) localStorage.setItem('installer_supabase_url', config.url);
          if (config.anon) localStorage.setItem('installer_supabase_anon_key', config.anon);
          if (config.service) localStorage.setItem('installer_supabase_service_key', config.service);
          if (config.license) localStorage.setItem('installer_license_key', config.license);
          if (config.org) localStorage.setItem('installer_org_slug', config.org);
          if (config.install_id) localStorage.setItem('installation_id', config.install_id); // Hydrate Installation ID
          if (config.central_id) localStorage.setItem('installer_owner_id', config.central_id);

          // Clear hash and reload to initialize services with new keys
          window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
          window.location.reload();
          return; // Stop here, reload follows
        } catch (e) {
          console.error('Failed to inject config', e);
        }
      }
      // Done hydrating (or nothing to hydrate)
      setIsHydrating(false);
    };

    // Tiny delay to ensure window.location is stable? No, just run.
    hydrate();
  }, []);

  if (isHydrating) {
    return <div className="h-screen w-screen flex items-center justify-center bg-[#05050A] text-white italic font-bold uppercase tracking-widest text-xs animate-pulse">{t('loading_config')}</div>;
  }

  // Check if we have the critical keys to start the app
  const hasConfig = typeof window !== 'undefined' &&
    !!getEnv('VITE_SUPABASE_URL') &&
    !!getEnv('VITE_LICENSE_KEY');

  // If no config, ONLY render ConfigLoader. 
  // It will fetch config, save to localStorage, and reload the page.
  // This prevents LicenseGuard from mounting and redirecting prematurely.
  if (!hasConfig) {
    return (
      <GlobalErrorBoundary>
        <ConfigLoader onConfigLoaded={() => window.location.reload()} />
      </GlobalErrorBoundary>
    );
  }

  if (typeof window !== 'undefined' && window.location.pathname === '/setup') {
    return (
      <GlobalErrorBoundary>
        <Toaster richColors position="top-right" theme={localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'} />
        <InstallationProvider>
          <ThemeProvider>
            <BrowserRouter>
              <Setup />
            </BrowserRouter>
          </ThemeProvider>
        </InstallationProvider>
      </GlobalErrorBoundary>
    );
  }

  return (
    <GlobalErrorBoundary>
      <Toaster richColors position="top-right" theme={localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'} />
      <ConfigLoader onConfigLoaded={() => window.location.reload()} />
      <InstallationProvider>
        <AuthProvider>
          <ThemeProvider>
            <BrowserRouter>
              <LicenseGuard>
                <DomainDispatcher />
              </LicenseGuard>
            </BrowserRouter>
          </ThemeProvider>
        </AuthProvider>
      </InstallationProvider>
    </GlobalErrorBoundary>
  );
};

export default App;
