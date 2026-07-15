import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthProvider, useAuth } from './context/AuthContext';
import { InstallationProvider } from './context/InstallationContext';

import { AdminRoute } from './components/admin/AdminRoute';
import Setup from './pages/public/Setup';
import { LicenseGuard } from './components/LicenseGuard';
import { Loading } from './components/ui/Loading';
import { ThemeProvider } from './context/ThemeContext';
import { ConfigLoader } from './components/ConfigLoader';
import { Toaster } from 'sonner';
import { getEnv } from './utils/env';
import { GlobalErrorBoundary } from './components/GlobalErrorBoundary';
import {
  getCurrentHostname,
  getHostnameFromUrl,
  getRuntimeMode,
  isLocalHostname,
} from './config/runtimeMode';

import { domainLookupService } from './services/domainLookupService';
import { DomainUsage } from './types';

const debugLog = (...args: unknown[]) => {
  if (import.meta.env.DEV) {
    console.log(...args);
  }
};

const Dashboard = React.lazy(() => import('./pages/admin/Dashboard').then((mod) => ({ default: mod.Dashboard })));
const Products = React.lazy(() => import('./pages/admin/Products').then((mod) => ({ default: mod.Products })));
const Offers = React.lazy(() => import('./pages/admin/Offers').then((mod) => ({ default: mod.Offers })));
const Checkouts = React.lazy(() => import('./pages/admin/Checkouts').then((mod) => ({ default: mod.Checkouts })));
const CheckoutEditor = React.lazy(() => import('./pages/admin/CheckoutEditor').then((mod) => ({ default: mod.CheckoutEditor })));
const Gateways = React.lazy(() => import('./pages/admin/Gateways').then((mod) => ({ default: mod.Gateways })));
const SystemUpdates = React.lazy(() => import('./pages/admin/SystemUpdates').then((mod) => ({ default: mod.SystemUpdates })));
const Domains = React.lazy(() => import('./pages/admin/Domains').then((mod) => ({ default: mod.Domains })));
const Settings = React.lazy(() => import('./pages/admin/Settings').then((mod) => ({ default: mod.Settings })));
const Orders = React.lazy(() => import('./pages/admin/Orders').then((mod) => ({ default: mod.Orders })));
const Webhooks = React.lazy(() => import('./pages/admin/Webhooks').then((mod) => ({ default: mod.Webhooks })));
const Licenses = React.lazy(() => import('./pages/admin/Licenses').then((mod) => ({ default: mod.Licenses })));
const SystemLicenses = React.lazy(() => import('./pages/admin/SystemLicenses').then((mod) => ({ default: mod.SystemLicenses })));
const SecurityEvents = React.lazy(() => import('./pages/admin/SecurityEvents').then((mod) => ({ default: mod.SecurityEvents })));
const UpgradeIntents = React.lazy(() => import('./pages/admin/UpgradeIntents').then((mod) => ({ default: mod.UpgradeIntents })));
const BusinessSettings = React.lazy(() => import('./pages/admin/BusinessSettings').then((mod) => ({ default: mod.BusinessSettings })));
const PrivacyCenter = React.lazy(() => import('./pages/admin/PrivacyCenter').then((mod) => ({ default: mod.PrivacyCenter })));
const MyInstallations = React.lazy(() => import('./pages/admin/Installations').then((mod) => ({ default: mod.MyInstallations })));
const LeadCRM = React.lazy(() => import('./pages/admin/LeadCRM').then((mod) => ({ default: mod.LeadCRM })));
const FreeUserDetails = React.lazy(() => import('./pages/admin/FreeUserDetails').then((mod) => ({ default: mod.FreeUserDetails })));
const PartnerDashboard = React.lazy(() => import('./pages/admin/PartnerDashboard').then((mod) => ({ default: mod.PartnerDashboard })));
const Marketing = React.lazy(() => import('./pages/Marketing').then((mod) => ({ default: mod.Marketing })));
const IntegrationsHub = React.lazy(() => import('./pages/IntegrationsHub').then((mod) => ({ default: mod.IntegrationsHub })));
const Notifications = React.lazy(() => import('./pages/admin/Notifications').then((mod) => ({ default: mod.Notifications })));
const MemberAreas = React.lazy(() => import('./pages/admin/MemberAreas').then((mod) => ({ default: mod.MemberAreas })));
const MemberAreaDashboard = React.lazy(() => import('./pages/admin/MemberAreaDashboard').then((mod) => ({ default: mod.MemberAreaDashboard })));
const ContentEditor = React.lazy(() => import('./pages/admin/ContentEditor').then((mod) => ({ default: mod.ContentEditor })));
const MemberDashboard = React.lazy(() => import('./pages/member/MemberDashboard').then((mod) => ({ default: mod.MemberDashboard })));
const CoursePlayer = React.lazy(() => import('./pages/member/CoursePlayer').then((mod) => ({ default: mod.CoursePlayer })));
const ContentModules = React.lazy(() => import('./pages/member/ContentModules').then((mod) => ({ default: mod.ContentModules })));
const PublicCheckout = React.lazy(() => import('./pages/public/PublicCheckout').then((mod) => ({ default: mod.PublicCheckout })));
const PixPayment = React.lazy(() => import('./pages/public/PixPayment').then((mod) => ({ default: mod.PixPayment })));
const PreviewUpsell = React.lazy(() => import('./pages/public/PreviewUpsell').then((mod) => ({ default: mod.PreviewUpsell })));
const UpsellPage = React.lazy(() => import('./pages/public/UpsellPage').then((mod) => ({ default: mod.UpsellPage })));
const ThankYou = React.lazy(() => import('./pages/public/ThankYou').then((mod) => ({ default: mod.ThankYou })));
const Login = React.lazy(() => import('./pages/Login').then((mod) => ({ default: mod.Login })));
const UpdatePassword = React.lazy(() => import('./pages/UpdatePassword').then((mod) => ({ default: mod.UpdatePassword })));
const MemberLogin = React.lazy(() => import('./pages/member/MemberLogin').then((mod) => ({ default: mod.MemberLogin })));
const MemberSignup = React.lazy(() => import('./pages/member/MemberSignup').then((mod) => ({ default: mod.MemberSignup })));
const Register = React.lazy(() => import('./pages/public/Register').then((mod) => ({ default: mod.Register })));
const PassportExchange = React.lazy(() => import('./pages/PassportExchange').then((mod) => ({ default: mod.PassportExchange })));
const MemberAreaWrapper = React.lazy(() => import('./pages/member/MemberAreaWrapper').then((mod) => ({ default: mod.MemberAreaWrapper })));
const MemberProducts = React.lazy(() => import('./pages/member/MemberProducts').then((mod) => ({ default: mod.MemberProducts })));
const MyProducts = React.lazy(() => import('./pages/member/MyProducts').then((mod) => ({ default: mod.MyProducts })));
const MemberFAQ = React.lazy(() => import('./pages/member/MemberFAQ').then((mod) => ({ default: mod.MemberFAQ })));
const MemberProfile = React.lazy(() => import('./pages/member/MemberProfile').then((mod) => ({ default: mod.MemberProfile })));
const ActivationLogin = React.lazy(() => import('./pages/activation/ActivationLogin').then((mod) => ({ default: mod.ActivationLogin })));
const ActivationPortal = React.lazy(() => import('./pages/activation/ActivationPortal').then((mod) => ({ default: mod.ActivationPortal })));
const ActivationContentEditor = React.lazy(() => import('./pages/admin/ActivationContentEditor').then((mod) => ({ default: mod.ActivationContentEditor })));
const PublicPrivacy = React.lazy(() => import('./pages/public/PublicPrivacy').then((mod) => ({ default: mod.PublicPrivacy })));
const PublicTerms = React.lazy(() => import('./pages/public/PublicTerms').then((mod) => ({ default: mod.PublicTerms })));
const PlatformPrivacy = React.lazy(() => import('./pages/public/PlatformPrivacy').then((mod) => ({ default: mod.PlatformPrivacy })));
const PlatformTerms = React.lazy(() => import('./pages/public/PlatformTerms').then((mod) => ({ default: mod.PlatformTerms })));
const InstallerWizard = React.lazy(() => import('./pages/installer/InstallerWizard'));
const WebhookDocs = React.lazy(() => import('./pages/docs/WebhookDocs').then((mod) => ({ default: mod.WebhookDocs })));
const DemoWorkspaceLauncher = React.lazy(() => import('./pages/demo/DemoWorkspaceLauncher').then((mod) => ({ default: mod.DemoWorkspaceLauncher })));
const FlowApp = React.lazy(() => import('./pages/admin/flow/App'));
const AuthDebug = import.meta.env.DEV
  ? React.lazy(() => import('./pages/debug/AuthDebug').then((mod) => ({ default: mod.AuthDebug })))
  : null;

const RouteBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <React.Suspense fallback={<Loading />}>{children}</React.Suspense>
);

const CONTROL_PLANE_HOSTNAMES = new Set(
  [
    'app.supercheckout.app',
    'super-checkout.vercel.app',
    getHostnameFromUrl(import.meta.env.VITE_SUPER_CHECKOUT_APP_URL),
    getHostnameFromUrl(import.meta.env.VITE_APP_URL),
  ].filter(Boolean) as string[]
);

const SYSTEM_HOSTNAMES = new Set(
  [
    'supercheckout.app',
    'www.supercheckout.app',
    'app.supercheckout.app',
    'portal.supercheckout.app',
    'install.supercheckout.app',
    'demo.supercheckout.app',
    'super-checkout.vercel.app',
    getHostnameFromUrl(import.meta.env.VITE_SUPER_CHECKOUT_MARKETING_URL),
    getHostnameFromUrl(import.meta.env.VITE_SUPER_CHECKOUT_APP_URL),
    getHostnameFromUrl(import.meta.env.VITE_SUPER_CHECKOUT_PORTAL_URL),
    getHostnameFromUrl(import.meta.env.VITE_SUPER_CHECKOUT_INSTALL_URL),
    getHostnameFromUrl(import.meta.env.VITE_SUPER_CHECKOUT_DEMO_URL),
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

const DEMO_HOSTNAMES = new Set(
  [
    'demo.supercheckout.app',
    getHostnameFromUrl(import.meta.env.VITE_SUPER_CHECKOUT_DEMO_URL),
  ].filter(Boolean) as string[]
);

const isControlPlaneHostname = (hostname: string) => {
  const normalizedHostname = hostname.toLowerCase();
  return isLocalHostname(normalizedHostname) || CONTROL_PLANE_HOSTNAMES.has(normalizedHostname);
};

const getHostAwareRootPath = (hostname = getCurrentHostname()) => {
  if (PORTAL_HOSTNAMES.has(hostname)) {
    return '/activate';
  }

  if (INSTALL_HOSTNAMES.has(hostname)) {
    return '/installer';
  }

  if (DEMO_HOSTNAMES.has(hostname)) {
    return '/demo';
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

  if (DEMO_HOSTNAMES.has(hostname)) {
    return <Navigate to="/demo" replace />;
  }

  return <Login />;
};

const HostAwareRootRoute: React.FC = () => (
  <Navigate to={getHostAwareRootPath()} replace />
);

const SystemOwnerRoute: React.FC<{ children: React.ReactNode; requireControlPlane?: boolean }> = ({ children, requireControlPlane = false }) => {
  const { user, profile, loading } = useAuth();

  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;

  const effectiveRole = profile?.effective_role || profile?.role;
  if (effectiveRole !== 'master_admin') {
    return <Navigate to="/admin" replace />;
  }

  if (requireControlPlane && !isControlPlaneHostname(getCurrentHostname())) {
    return <Navigate to="/admin" replace />;
  }

  return <AdminRoute>{children}</AdminRoute>;
};

const isSystemHostname = (hostname: string) => {
  const normalizedHostname = hostname.toLowerCase();

  return (
    isLocalHostname(normalizedHostname) ||
    normalizedHostname.includes('.vercel.app') ||
    normalizedHostname.includes('.webcontainer.io') ||
    SYSTEM_HOSTNAMES.has(normalizedHostname)
  );
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

      debugLog('Current hostname:', hostname);

      // Ignorar dominios do sistema
      if (isSystemHostname(hostname)) {
        debugLog('System domain detected, skipping custom domain check.');
        setLoading(false);
        return;
      }

      try {
        debugLog('Checking custom domain in DB...');
        const domain = await domainLookupService.getDomainByHostname(hostname);
        debugLog('Domain found:', domain);

        if (domain) {
          if (domain.status !== 'active') {
            debugLog('Domain pending. Attempting auto-verification...');
            try {
              const verifyRes = await fetch(`/api/domains/verify?domain=${hostname}`);
              const verifyData = await verifyRes.json();

              if (verifyData.verified && verifyData.status === 'active') {
                debugLog('Auto-verification successful! Reloading...');
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

          if (domain.usage === DomainUsage.CHECKOUT) {
            if (pathname === '/privacy-policy' || pathname === '/terms-of-purchase' || pathname.startsWith('/thank-you') || pathname.startsWith('/pagamento') || pathname.startsWith('/upsell')) {
              setLoading(false);
              setCustomCheckoutId('system');
              return;
            }

            const slug = pathname.substring(1);
            const checkout = await domainLookupService.getCheckoutByDomainAndSlug(domain.id, slug);

            if (checkout) {
              setCustomCheckoutId(checkout.id);
            } else {
              setError(t('checkout_not_found'));
            }
            setLoading(false);
            return;
          }

          if (domain.usage === DomainUsage.MEMBER_AREA) {
            const memberArea = await domainLookupService.getMemberAreaByDomain(domain.id);

            if (memberArea) {
              setCustomMemberAreaSlug(memberArea.slug);
            } else {
              setError(t('member_area_not_found'));
            }
            setLoading(false);
            return;
          }

          if (domain.usage === DomainUsage.SYSTEM) {
            debugLog('System domain detected, allowing standard routing.');
            setLoading(false);
            return;
          }

          debugLog('Unknown domain usage, allowing standard routing.');
          setLoading(false);
        } else {
          setError(t('domain_not_configured'));
          setLoading(false);
        }
      } catch (err) {
        console.error('Erro ao verificar dominio:', err);
        setError(t('domain_load_error'));
        setLoading(false);
      }
    };

    const domainCheckTimeout = setTimeout(() => {
      console.warn('DomainDispatcher: Check timed out, forcing standard load.');
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

  if (customMemberAreaSlug) {
    return (
      <Routes>
        <Route path="/login" element={<MemberLogin forcedSlug={customMemberAreaSlug} />} />
        <Route path="/signup" element={<MemberSignup forcedSlug={customMemberAreaSlug} />} />
        <Route path="/update-password" element={<UpdatePassword />} />

        <Route path="/" element={<MemberAreaWrapper forcedSlug={customMemberAreaSlug} />}>
          <Route index element={<MemberDashboard />} />
          <Route path="products" element={<MemberProducts />} />
          <Route path="my-products" element={<MyProducts />} />
          <Route path="faq" element={<MemberFAQ />} />
          <Route path="my-list" element={<MemberDashboard />} />
          <Route path="content/:id" element={<ContentModules />} />
          <Route path="profile" element={<MemberProfile />} />
        </Route>

        <Route path="/course/:id" element={<CoursePlayer forcedSlug={customMemberAreaSlug} />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
      <Routes>
        <Route path="/setup" element={<Setup />} />
      {AuthDebug && (
        <Route path="/debug-auth" element={<AuthDebug />} />
      )}
      <Route path="/login" element={<HostAwareLoginRoute />} />
      <Route path="/passport" element={<PassportExchange />} />
      <Route path="/demo" element={<DemoWorkspaceLauncher />} />
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
      <Route path="/preview/upsell" element={<PreviewUpsell />} />
      <Route path="/installer" element={<InstallerWizard />} />

      <Route path="/admin" element={<AdminRoute><Dashboard /></AdminRoute>} />
      <Route path="/admin/business-settings" element={<AdminRoute><BusinessSettings /></AdminRoute>} />
      <Route path="/admin/privacy" element={<SystemOwnerRoute requireControlPlane><PrivacyCenter /></SystemOwnerRoute>} />
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
      <Route path="/admin/system-licenses" element={<SystemOwnerRoute><SystemLicenses /></SystemOwnerRoute>} />
      <Route path="/admin/upgrade-intents" element={<SystemOwnerRoute requireControlPlane><UpgradeIntents /></SystemOwnerRoute>} />
      <Route path="/admin/security-events" element={<SystemOwnerRoute><SecurityEvents /></SystemOwnerRoute>} />
      <Route path="/admin/updates" element={<AdminRoute><SystemUpdates /></AdminRoute>} />
      <Route path="/admin/flow/*" element={<AdminRoute><FlowApp /></AdminRoute>} />

      <Route path="/admin/free-users" element={<SystemOwnerRoute requireControlPlane><LeadCRM /></SystemOwnerRoute>} />
      <Route path="/admin/free-users/:id" element={<SystemOwnerRoute requireControlPlane><FreeUserDetails /></SystemOwnerRoute>} />

      <Route path="/admin/installations" element={<AdminRoute><MyInstallations /></AdminRoute>} />
      <Route path="/admin/partner-dashboard" element={<SystemOwnerRoute requireControlPlane><PartnerDashboard /></SystemOwnerRoute>} />
      <Route path="/admin/marketing" element={<AdminRoute><Marketing /></AdminRoute>} />
      <Route path="/admin/integrations" element={<AdminRoute><IntegrationsHub /></AdminRoute>} />
      <Route path="/admin/notifications" element={<AdminRoute><Notifications /></AdminRoute>} />
      <Route path="/admin/members" element={<AdminRoute><MemberAreas /></AdminRoute>} />
      <Route path="/admin/members/:id" element={<AdminRoute><MemberAreaDashboard /></AdminRoute>} />
      <Route path="/admin/contents/:id" element={<AdminRoute><ContentEditor /></AdminRoute>} />

      <Route path="/admin/activation-content" element={<SystemOwnerRoute><ActivationContentEditor /></SystemOwnerRoute>} />

      <Route path="/activate" element={<ActivationLogin />} />
      <Route path="/activate/setup" element={<ActivationPortal />} />

      <Route path="/docs/webhooks" element={<AdminRoute><WebhookDocs /></AdminRoute>} />

      <Route path="/app/:slug/login" element={<MemberLogin />} />
      <Route path="/app/:slug/signup" element={<MemberSignup />} />
      <Route path="/app/:slug/update-password" element={<UpdatePassword />} />

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

      <Route path="/app/:slug/course/:id" element={<CoursePlayer />} />

      <Route path="/" element={<HostAwareRootRoute />} />
    </Routes>
  );
};

const App = () => {
  const { t } = useTranslation('common');
  const [isHydrating, setIsHydrating] = React.useState(true);
  const runtimeMode = getRuntimeMode();

  React.useEffect(() => {
    if (typeof document === 'undefined') return;

    document.documentElement.dataset.runtimeMode = runtimeMode;
  }, [runtimeMode]);

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
          if (config.license) localStorage.setItem('installer_license_key', config.license);
          if (config.org) localStorage.setItem('installer_org_slug', config.org);
          if (config.install_id) localStorage.setItem('installation_id', config.install_id); // Hydrate Installation ID
          if (config.setup_token) localStorage.setItem('installer_setup_token', config.setup_token);

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
    (
      runtimeMode === 'demo' ||
      (
        !!getEnv('VITE_SUPABASE_URL') &&
        !!getEnv('VITE_LICENSE_KEY')
      )
    );

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
      {runtimeMode !== 'demo' && (
        <ConfigLoader onConfigLoaded={() => window.location.reload()} />
      )}
      <InstallationProvider>
        <AuthProvider>
          <ThemeProvider>
            <BrowserRouter>
              <RouteBoundary>
                <LicenseGuard>
                  <DomainDispatcher />
                </LicenseGuard>
              </RouteBoundary>
            </BrowserRouter>
          </ThemeProvider>
        </AuthProvider>
      </InstallationProvider>
    </GlobalErrorBoundary>
  );
};

export default App;
