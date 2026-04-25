
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingBag,
  Tag,
  CreditCard,
  Settings,
  ShoppingCart,
  Activity,
  Menu,
  X,
  Sun,
  Moon,
  Bell,
  ChevronRight,
  ChevronLeft,
  Globe,
  LogOut,
  Mail,
  Plug,
  Users,
  BookOpen,
  Key,
  Eye,
  EyeOff,
  ShieldCheck,
  Crown,
  RefreshCw,
  Download,
  Terminal,
  Cpu
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useFeatures } from '../hooks/useFeatures';
import { ComplianceBanner } from './admin/ComplianceBanner';
import { LanguageSelector } from './ui/LanguageSelector';
import { useTranslation } from 'react-i18next';
import { APP_VERSION } from '../config/version';

export const Layout: React.FC<{ children: React.ReactNode; maxWidth?: string }> = ({ children, maxWidth = 'max-w-[1600px]' }) => {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { user, signOut, compliance, isWhiteLabel, profile } = useAuth(); // Destructure compliance, isWhiteLabel, and profile
  const { hasFeature, plan, isOwner } = useFeatures(); // replaces useEntitlements and useFeatureFlags
  const { t } = useTranslation('admin');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showEmail, setShowEmail] = useState(() => {
    return localStorage.getItem('show_admin_email') !== 'false';
  });

  const navItems = [
    { path: '/admin', icon: LayoutDashboard, label: t('nav.overview', 'Visão Geral') },
    { path: '/admin/business-settings', icon: Settings, label: t('nav.business_config', 'Seu Negócio') },
    { path: '/admin/products', icon: ShoppingBag, label: t('nav.products', 'Produtos') },
    { path: '/admin/gateways', icon: CreditCard, label: t('nav.gateways', 'Gateways') },
    { path: '/admin/domains', icon: Globe, label: t('nav.domains', 'Domínios') },
    { path: '/admin/checkouts', icon: ShoppingCart, label: t('nav.checkouts', 'Checkouts') },
    { path: '/admin/orders', icon: Tag, label: t('nav.orders', 'Pedidos') },
    { path: '/admin/integrations', icon: Plug, label: t('nav.integrations', 'Integrações') },
    { path: '/admin/notifications', icon: Bell, label: t('nav.notifications', 'Notificações') },
  ];

  // PERMISSION CHECK: Only show Licenses menu for Commercial plans
  const isCommercial = localStorage.getItem('license_usage_type') === 'commercial';

  // Dev/Admin Override for you (optional, keep if you want to always see it on your machine)
  const isAdmin = user?.email === 'contato.jeandamin@gmail.com';

  return (
    <div className="flex h-screen bg-[#05050A] text-gray-900 dark:text-dark-textMain overflow-hidden font-sans flex-col">

      {/* Top Compliance Banner (Fixed at top, pushes everything down) */}
      <ComplianceBanner complianceStatus={compliance?.status} />

      <div className="flex flex-1 overflow-hidden relative">

        {/* Global Aurora Background Effect */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

        {/* Mobile Overlay */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/80 z-40 lg:hidden backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 h-full
        bg-[#05050A]
        border-r border-white/5
        transition-all duration-300 ease-in-out flex flex-col
        
        // Mobile Logic (Default)
        w-64
        ${mobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
        
        // Desktop Logic (lg breakpoint)
        lg:translate-x-0
        ${sidebarOpen ? 'lg:w-64' : 'lg:w-20'}
      `}>

          {/* Toggle Button (Desktop Only - Centered vertically on the border) */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden lg:flex absolute -right-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-[#1A1A2E] border border-white/10 rounded-full items-center justify-center z-50 shadow-[0_0_15px_rgba(138,43,226,0.3)] hover:shadow-[0_0_20px_rgba(138,43,226,0.6)] hover:border-primary/50 transition-all duration-300 group"
          >
            {sidebarOpen ? (
              <ChevronLeft className="w-4 h-4 text-white" />
            ) : (
              <ChevronRight className="w-4 h-4 text-white" />
            )}
          </button>

          {/* Logo Section */}
          <div className="h-20 flex items-center px-6 shrink-0 border-b border-white/5 bg-black/20">
            {/* Show full logo if sidebar is open OR if we are on mobile (menu open) */}
            {(sidebarOpen || mobileMenuOpen) ? (
              <div className="flex items-center gap-3 animate-in fade-in duration-500 whitespace-nowrap">
                <div className="relative group">
                  <div className="absolute inset-0 bg-primary/20 blur-lg rounded-full group-hover:bg-primary/40 transition-all duration-500"></div>
                  <img src="/logo.png" alt="Super Checkout" className="relative w-9 h-9 object-contain rounded-xl shrink-0" />
                </div>
                <div className="flex flex-col -space-y-2.5 py-1">
                  <span className="font-portal-display text-lg text-white italic tracking-tighter">SUPER</span>
                  <span className="font-portal-display text-lg text-primary italic tracking-tighter flex items-baseline">
                    CHECKOUT
                    <span className="text-[10px] text-gray-600 font-sans not-italic ml-1 lowercase">.app</span>
                  </span>
                </div>
              </div>
            ) : (
              <div className="w-full flex justify-center">
                <div className="relative group">
                  <div className="absolute inset-0 bg-primary/20 blur-lg rounded-full"></div>
                  <img src="/logo.png" alt="Super Checkout" className="relative w-9 h-9 object-contain rounded-xl" />
                </div>
              </div>
            )}

            {/* Mobile Close Button */}
            <button onClick={() => setMobileMenuOpen(false)} className="lg:hidden text-gray-500 ml-auto p-2">
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Navigation */}
          <nav className={`flex-1 overflow-y-auto py-6 custom-scrollbar transition-all duration-300 ${(sidebarOpen || mobileMenuOpen) ? 'px-4 pr-10' : 'px-3'}`}>

            {/* SECTION: MEU NEGÓCIO (Business Console) */}
            <div className="mb-6">
              <div className="space-y-1">
                {navItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  const showTooltip = !sidebarOpen && !mobileMenuOpen;

                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      title={!sidebarOpen ? item.label : ''}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center rounded-xl transition-all duration-300 group relative overflow-hidden ${(!sidebarOpen && !mobileMenuOpen) ? 'justify-center px-0 py-3' : 'px-3 py-2'} text-[10px] font-black uppercase tracking-[0.2em] ${isActive
                        ? 'text-white bg-primary/20 shadow-[0_0_20px_rgba(138,43,226,0.2)] border border-white/10'
                        : 'text-gray-500 hover:text-white hover:bg-white/[0.03]'
                        }`}
                    >
                      {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 bg-primary rounded-r-full" />}
                      <item.icon className={`w-5 h-5 flex-shrink-0 transition-colors ${isActive ? 'text-primary' : 'text-gray-600 group-hover:text-gray-300'}`} />

                      <div className={`ml-3 truncate transition-all duration-300 ${(!sidebarOpen && !mobileMenuOpen) ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                        {item.label}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* SECTION: CONFIGURAÇÕES */}
            <div className="mt-2 pt-4 border-t border-white/5">
              {(sidebarOpen || mobileMenuOpen) && (
                <h3 className="text-[10px] font-black text-gray-700 uppercase tracking-[0.3em] px-3 mb-4 animate-in fade-in flex items-center gap-2 not-italic">
                  {t('nav.settings', 'Outros')}
                </h3>
              )}

              <div className="space-y-1">

                {/* OWNER/MASTER/ADMIN: Lead CRM */}
                {!isWhiteLabel && (isOwner || hasFeature('FEATURE_CRM_LEADS')) && (
                    <Link
                      to="/admin/free-users"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center rounded-xl transition-all duration-300 group relative overflow-hidden ${(!sidebarOpen && !mobileMenuOpen) ? 'justify-center px-0 py-3' : 'px-3 py-2'} text-[10px] font-black uppercase tracking-[0.2em] ${location.pathname.startsWith('/admin/free-users')
                        ? 'text-white bg-white/10 border border-white/5'
                        : 'text-gray-600 hover:text-white hover:bg-white/5'
                        }`}
                      title="Gestão de Leads (CRM)"
                    >
                      <Users className="w-5 h-5 flex-shrink-0" />
                    <div className={`ml-3 truncate transition-all duration-300 ${(!sidebarOpen && !mobileMenuOpen) ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                      {t('nav.leads_crm', 'Leads CRM')}
                    </div>
                  </Link>
                )}

                {/* CLIENT VIEW: Minha Licença */}
                {(isCommercial || isAdmin) && (
                    <Link
                      to="/admin/licenses"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center rounded-xl transition-all duration-300 group relative overflow-hidden ${(!sidebarOpen && !mobileMenuOpen) ? 'justify-center px-0 py-3' : 'px-3 py-2'} text-[10px] font-black uppercase tracking-[0.2em] ${location.pathname === '/admin/licenses'
                        ? 'text-white bg-white/10 border border-white/5'
                        : 'text-gray-600 hover:text-white hover:bg-white/5'
                        }`}
                      title="Minha Licença"
                    >
                      <Key className="w-5 h-5 flex-shrink-0" />
                    <div className={`ml-3 truncate transition-all duration-300 ${(!sidebarOpen && !mobileMenuOpen) ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                      {t('nav.my_license', 'Minha Licença')}
                    </div>
                  </Link>
                )}

                {/* CLIENT VIEW: Minhas Instalações */}
                {(isCommercial || isAdmin) && (
                    <Link
                      to="/admin/installations"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center rounded-xl transition-all duration-300 group relative overflow-hidden ${(!sidebarOpen && !mobileMenuOpen) ? 'justify-center px-0 py-3' : 'px-3 py-2'} text-[10px] font-black uppercase tracking-[0.2em] ${location.pathname === '/admin/installations'
                        ? 'text-white bg-white/10 border border-white/5'
                        : 'text-gray-600 hover:text-white hover:bg-white/5'
                        }`}
                      title="Instalações"
                    >
                      <Terminal className="w-5 h-5 flex-shrink-0" />
                    <div className={`ml-3 truncate transition-all duration-300 ${(!sidebarOpen && !mobileMenuOpen) ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                      {t('nav.installations', 'Instalações')}
                    </div>
                  </Link>
                )}

                {/* OWNER ONLY: Gestão Global & Webhooks */}
                {isOwner && (
                  <>
                    <Link
                      to="/admin/system-licenses"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center rounded-xl transition-all duration-300 group relative overflow-hidden ${(!sidebarOpen && !mobileMenuOpen) ? 'justify-center px-0 py-3' : 'px-3 py-2'} text-[10px] font-black uppercase tracking-[0.2em] ${location.pathname === '/admin/system-licenses'
                        ? 'text-yellow-400 bg-yellow-400/10 border border-yellow-400/20'
                        : 'text-gray-600 hover:text-yellow-400 hover:bg-white/5'
                        }`}
                      title="Gestão de Licenças (Admin)"
                    >
                      <ShieldCheck className="w-5 h-5 flex-shrink-0" />
                      <div className={`ml-3 truncate transition-all duration-300 ${(!sidebarOpen && !mobileMenuOpen) ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                        {t('nav.global_management', 'Gestão Global')}
                      </div>
                    </Link>

                    <Link
                      to="/admin/security-events"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center rounded-xl transition-all duration-300 group relative overflow-hidden ${(!sidebarOpen && !mobileMenuOpen) ? 'justify-center px-0 py-3' : 'px-3 py-2'} text-[10px] font-black uppercase tracking-[0.2em] ${location.pathname === '/admin/security-events'
                        ? 'text-red-400 bg-red-400/10 border border-red-400/20'
                        : 'text-gray-600 hover:text-red-400 hover:bg-white/5'
                        }`}
                      title="Auditoria de Segurança"
                    >
                      <Activity className="w-5 h-5 flex-shrink-0" />
                      <div className={`ml-3 truncate transition-all duration-300 ${(!sidebarOpen && !mobileMenuOpen) ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                        Auditoria Segurança
                      </div>
                    </Link>

                    {/* ACTIVATION PORTAL CONTENT (Owner Only) */}
                    <Link
                      to="/admin/activation-content"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center rounded-xl transition-all duration-300 group relative overflow-hidden ${(!sidebarOpen && !mobileMenuOpen) ? 'justify-center px-0 py-3' : 'px-3 py-2'} text-[10px] font-black uppercase tracking-[0.2em] ${location.pathname === '/admin/activation-content'
                        ? 'text-green-400 bg-green-400/10 border border-green-400/20'
                        : 'text-gray-600 hover:text-green-400 hover:bg-white/5'
                        }`}
                      title="Editor de Conteúdo do Portal"
                    >
                      <BookOpen className="w-5 h-5 flex-shrink-0" />
                      <div className={`ml-3 truncate transition-all duration-300 ${(!sidebarOpen && !mobileMenuOpen) ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                        {t('nav.activation_portal', 'Conteúdo do Portal')}
                      </div>
                    </Link>

                    {/* OWNER ONLY: System Updates */}
                    <Link
                      to="/admin/updates"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center rounded-xl transition-all duration-300 group relative overflow-hidden ${(!sidebarOpen && !mobileMenuOpen) ? 'justify-center px-0 py-3' : 'px-3 py-2'} text-[10px] font-black uppercase tracking-[0.2em] ${location.pathname === '/admin/updates'
                        ? 'text-primary bg-primary/10 border border-primary/20'
                        : 'text-gray-600 hover:text-white hover:bg-white/5'
                        }`}
                      title="Atualizações do Sistema"
                    >
                      <RefreshCw className={`w-5 h-5 flex-shrink-0 ${location.pathname === '/admin/updates' ? 'animate-spin-slow text-primary' : ''}`} />
                      <div className={`ml-3 truncate transition-all duration-300 ${(!sidebarOpen && !mobileMenuOpen) ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                        {t('nav.updates', 'Atualizações')}
                      </div>
                    </Link>
                  </>
                )}

                {/* PARTNER MODULE: Prestador de Serviços */}
                {((isOwner || hasFeature('FEATURE_PARTNER_PANEL')) || (profile?.partner_status === 'active')) && (
                  <Link
                    to="/admin/partner-dashboard"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center rounded-xl transition-all duration-300 group relative overflow-hidden ${(!sidebarOpen && !mobileMenuOpen) ? 'justify-center px-0 py-3' : 'px-3 py-2'} text-[10px] font-black uppercase tracking-[0.2em] ${location.pathname === '/admin/partner-dashboard'
                      ? 'text-orange-400 bg-orange-400/10 border border-orange-400/20'
                      : 'text-gray-600 hover:text-orange-400 hover:bg-white/5'
                      }`}
                    title="Prestador de Serviços"
                  >
                    <Crown className="w-5 h-5 flex-shrink-0" />
                    <div className={`ml-3 truncate transition-all duration-300 ${(!sidebarOpen && !mobileMenuOpen) ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                      {t('nav.service_provider', 'Prestador de Serviços')}
                    </div>
                  </Link>
                )}
              </div>
            </div>

            {/* Language Selector in Sidebar */}
            <div className="mt-4 pt-4 border-t border-white/5">
              <LanguageSelector variant="sidebar" sidebarOpen={sidebarOpen || mobileMenuOpen} />
            </div>
          </nav>

          {/* Member Area CTA (Moved to bottom) */}
          <div className="p-4 shrink-0 border-t border-white/5 bg-black/40">
            <Link to="/admin/members" className={`block rounded-[1.5rem] p-3 bg-gradient-to-br from-purple-600 to-indigo-800 text-white shadow-lg shadow-purple-500/20 group relative overflow-hidden transition-all hover:shadow-purple-500/40 hover:-translate-y-0.5 ${!sidebarOpen && !mobileMenuOpen ? 'p-1.5 flex justify-center' : ''}`}>

              {/* Background Pattern */}
              <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -mr-10 -mt-10 blur-xl"></div>
              <div className="absolute bottom-0 left-0 w-16 h-16 bg-black/10 rounded-full -ml-8 -mb-8 blur-xl"></div>

              <div className={`flex items-center gap-3 ${!sidebarOpen && !mobileMenuOpen ? 'justify-center' : ''}`}>
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0 backdrop-blur-sm border border-white/10 group-hover:bg-white/20 transition-all">
                  <Users className="w-5 h-5 text-white" />
                </div>

                {(sidebarOpen || mobileMenuOpen) && (
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-[11px] truncate uppercase tracking-tighter italic">{t('nav.member_area', 'Área de Membros')}</p>
                    <p className="text-[9px] text-white/50 truncate uppercase font-black tracking-widest mt-0.5">{t('nav.manage_members', 'Gerenciar alunos')}</p>
                  </div>
                )}
              </div>
            </Link>
          </div>

          {/* Version Display */}
          {(sidebarOpen || mobileMenuOpen) && (
            <div className="px-6 py-4 text-[9px] text-gray-800 font-black uppercase tracking-[0.3em] border-t border-white/5 bg-black/40">
              <span className="text-[7px] lowercase opacity-40 mr-1">versão</span> v{APP_VERSION}
            </div>
          )}
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col h-screen overflow-hidden relative bg-[#05050A]">

          {/* Header */}
          <header className="h-20 flex items-center justify-between px-4 lg:px-8 z-10 shrink-0 border-b border-white/5 backdrop-blur-xl bg-black/40">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <Menu className="w-6 h-6" />
              </button>
              
              <div className="hidden lg:flex flex-col">
                <h2 className="text-white font-black uppercase tracking-[0.2em] text-xs opacity-50">
                  {navItems.find(i => location.pathname === i.path)?.label || 'System'}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-3">


              <button className="p-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 transition-all relative">
                <Bell className="w-5 h-5" />
                <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-primary rounded-full shadow-[0_0_10px_rgba(138,43,226,0.8)] border-2 border-[#05050A]"></span>
              </button>

              <div className="h-8 w-px bg-white/10 mx-2 hidden md:block"></div>

              <div className="flex items-center gap-3 pl-1">
                <Link to="/admin/settings" className="flex items-center gap-4 group">
                  <div className="hidden md:flex flex-col items-end">
                    <p className="text-sm font-black uppercase tracking-wider text-white group-hover:text-primary transition-colors">
                      {user?.user_metadata?.name || 'Admin'}
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] font-mono text-gray-600">
                        {showEmail ? (user?.email || 'admin@super.com') : '******@******.com'}
                      </p>
                    </div>
                  </div>

                  <div className="w-10 h-10 rounded-[1rem] bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center text-white font-black text-xs shadow-[0_0_15px_rgba(138,43,226,0.2)] ring-1 ring-white/10 group-hover:ring-primary/50 group-hover:scale-105 transition-all duration-300">
                    {user?.user_metadata?.name ? user.user_metadata.name.substring(0, 2).toUpperCase() : 'AD'}
                  </div>
                </Link>

                <button
                  onClick={signOut}
                  className="p-2.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl border border-transparent hover:border-red-500/20 transition-all ml-2"
                  title={t('common.logout', 'Sair')}
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          </header>

          {/* Content Scrollable Area */}
          <div className="flex-1 overflow-auto p-4 lg:p-10 lg:pt-6 scroll-smooth custom-scrollbar">
            <div className={`${maxWidth} mx-auto pb-20 lg:pb-0`}>
              {children}
            </div>
          </div>
        </main>
      </div>
    </div >
  );
};
