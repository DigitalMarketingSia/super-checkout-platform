
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
  ShieldCheck
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { user, profile, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showEmail, setShowEmail] = useState(() => {
    return localStorage.getItem('show_admin_email') !== 'false';
  });

  const navItems = [
    { path: '/admin', icon: LayoutDashboard, label: 'Vis%úo Geral' },
    { path: '/admin/products', icon: ShoppingBag, label: 'Produtos' },
    { path: '/admin/gateways', icon: CreditCard, label: 'Gateways' },
    { path: '/admin/domains', icon: Globe, label: 'Dom%¡nios' },
    { path: '/admin/checkouts', icon: ShoppingCart, label: 'Checkouts' },
    { path: '/admin/orders', icon: Tag, label: 'Pedidos' },
    { path: '/admin/integrations', icon: Plug, label: 'Integra%º%Áes' },
  ];

  // PERMISSION CHECK: Only show Licenses menu for Commercial plans
  const isCommercial = localStorage.getItem('license_usage_type') === 'commercial';

  const isAdmin = profile?.role === 'master_admin';

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-dark-bg text-gray-900 dark:text-dark-textMain overflow-hidden font-sans">

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
        bg-white dark:bg-[#05050A]
        border-r border-gray-200 dark:border-white/10
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
          className="hidden lg:flex absolute -right-4 top-1/2 -translate-y-1/2 w-6 h-12 bg-white dark:bg-[#1A1A2E] border border-gray-200 dark:border-white/10 rounded-full items-center justify-center z-50 shadow-sm hover:shadow-md dark:hover:shadow-[0_0_15px_rgba(138,43,226,0.6)] hover:border-primary/50 transition-all duration-300 group"
        >
          {sidebarOpen ? (
            <ChevronLeft className="w-4 h-4 text-gray-400 group-hover:text-white" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-white" />
          )}
        </button>

        {/* Logo Section */}
        <div className="h-20 flex items-center px-6 shrink-0">
          {/* Show full logo if sidebar is open OR if we are on mobile (menu open) */}
          {(sidebarOpen || mobileMenuOpen) ? (
            <div className="flex items-center gap-2 text-primary font-bold text-xl tracking-tight animate-in fade-in duration-200 whitespace-nowrap">
              <img src="/logo.png" alt="Super Checkout" className="w-8 h-8 object-contain rounded-md shrink-0" />
              <span className="dark:text-white flex items-center gap-1">Super Checkout <span className="text-xs text-primary/80">.app</span></span>
            </div>
          ) : (
            <div className="w-full flex justify-center">
              <img src="/logo.png" alt="Super Checkout" className="w-8 h-8 object-contain rounded-md" />
            </div>
          )}

          {/* Mobile Close Button */}
          <button onClick={() => setMobileMenuOpen(false)} className="lg:hidden text-gray-500 ml-auto p-2">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-6 px-3 custom-scrollbar">

          {/* SECTION: MEU NEG%ôCIO (Business Console) */}
          <div className="mb-6">
            {(sidebarOpen || mobileMenuOpen) && (
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-3 mb-2 animate-in fade-in">
                Meu Neg%%cio
              </h3>
            )}
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
                    className={`flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-all group relative overflow-hidden ${isActive
                      ? 'text-white bg-primary/20 shadow-[0_0_20px_rgba(138,43,226,0.15)] border border-primary/20'
                      : 'text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5'
                      }`}
                  >
                    {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r-full" />}
                    <item.icon className={`w-5 h-5 flex-shrink-0 transition-colors ${isActive ? 'text-primary-light' : 'text-gray-400 group-hover:text-gray-300'}`} />

                    <div className={`ml-3 truncate transition-all duration-300 ${(!sidebarOpen && !mobileMenuOpen) ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                      {item.label}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* SECTION: SUPER CHECKOUT (SaaS Management) */}
          {/* Visible to Owner OR Client (Commercial License) */}
          <div className="mt-2 pt-4 border-t border-gray-200 dark:border-white/5">
            {(sidebarOpen || mobileMenuOpen) && (
              <h3 className="text-xs font-bold text-primary uppercase tracking-widest px-3 mb-2 animate-in fade-in flex items-center gap-2">
                Super Checkout <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded">SaaS</span>
              </h3>
            )}

            <div className="space-y-1">

              {/* CLIENT VIEW: Minha Licen%ºa */}
              {(isCommercial || isAdmin) && (
                <Link
                  to="/admin/saas/my-license"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-all group relative ${location.pathname === '/admin/saas/my-license'
                    ? 'text-white bg-white/10'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  title="Minha Licen%ºa"
                >
                  <Key className="w-5 h-5 flex-shrink-0" />
                  <div className={`ml-3 truncate transition-all duration-300 ${(!sidebarOpen && !mobileMenuOpen) ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                    Minha Licen%ºa
                  </div>
                </Link>
              )}

              {/* CLIENT VIEW: Minhas Instala%º%Áes */}
              {(isCommercial || isAdmin) && (
                <Link
                  to="/admin/saas/installations"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-all group relative ${location.pathname === '/admin/saas/installations'
                    ? 'text-white bg-white/10'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  title="Instala%º%Áes"
                >
                  <Globe className="w-5 h-5 flex-shrink-0" />
                  <div className={`ml-3 truncate transition-all duration-300 ${(!sidebarOpen && !mobileMenuOpen) ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                    Instala%º%Áes
                  </div>
                </Link>
              )}

              {/* OWNER ONLY: Gest%úo Global & Webhooks */}
              {isAdmin && (
                <>
                  <Link
                    to="/admin/system-licenses"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-all group relative ${location.pathname === '/admin/system-licenses'
                      ? 'text-yellow-400 bg-yellow-400/10'
                      : 'text-gray-400 hover:text-yellow-400 hover:bg-white/5'
                      }`}
                    title="Gest%úo de Licen%ºas (Admin)"
                  >
                    <ShieldCheck className="w-5 h-5 flex-shrink-0" />
                    <div className={`ml-3 truncate transition-all duration-300 ${(!sidebarOpen && !mobileMenuOpen) ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                      Gest%úo Global
                    </div>
                  </Link>

                  <Link
                    to="/admin/saas/webhooks"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-all group relative ${location.pathname === '/admin/saas/webhooks'
                      ? 'text-red-400 bg-red-400/10'
                      : 'text-gray-400 hover:text-red-400 hover:bg-white/5'
                      }`}
                    title="Webhooks de Sistema"
                  >
                    <Plug className="w-5 h-5 flex-shrink-0" />
                    <div className={`ml-3 truncate transition-all duration-300 ${(!sidebarOpen && !mobileMenuOpen) ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                      Webhooks (System)
                    </div>
                  </Link>
                </>
              )}
            </div>
          </div>
        </nav>

        {/* Member Area CTA (Moved to bottom) */}
        <div className="p-4 shrink-0 border-t border-gray-200 dark:border-white/5">
          <Link to="/admin/members" className={`block rounded-2xl p-4 bg-gradient-to-br from-purple-600 to-indigo-700 text-white shadow-lg shadow-purple-500/20 group relative overflow-hidden transition-all hover:shadow-purple-500/30 ${!sidebarOpen && !mobileMenuOpen ? 'p-2 flex justify-center' : ''}`}>

            {/* Background Pattern */}
            <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -mr-10 -mt-10 blur-xl"></div>
            <div className="absolute bottom-0 left-0 w-16 h-16 bg-black/10 rounded-full -ml-8 -mb-8 blur-xl"></div>

            <div className={`flex items-center gap-3 ${!sidebarOpen && !mobileMenuOpen ? 'justify-center' : ''}`}>
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0 backdrop-blur-sm border border-white/10">
                <Users className="w-5 h-5 text-white" />
              </div>

              {(sidebarOpen || mobileMenuOpen) && (
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">%ürea de Membros</p>
                  <p className="text-[10px] text-white/70 truncate">Gerenciar alunos</p>
                </div>
              )}
            </div>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative bg-gray-50 dark:bg-[#05050A]">

        {/* Header */}
        <header className="h-16 flex items-center justify-between px-4 lg:px-8 z-10 shrink-0 border-b border-gray-200 dark:border-white/5 lg:border-none">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>

          <div className="flex items-center gap-3">


            <button className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-white/5 transition-colors relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-primary rounded-full shadow-[0_0_8px_rgba(138,43,226,0.8)]"></span>
            </button>

            {/* User Profile in Header */}
            <div className="h-8 w-px bg-gray-200 dark:bg-white/10 mx-1 hidden md:block"></div>

            <div className="flex items-center gap-3 pl-1">
              <Link to="/admin/settings" className="flex items-center gap-3 group">
                <div className="hidden md:flex flex-col items-end">
                  <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-primary transition-colors">
                    {user?.user_metadata?.name || 'Admin'}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] text-gray-500">
                      {showEmail ? (user?.email || 'admin@super.com') : '******@******.com'}
                    </p>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        const newValue = !showEmail;
                        setShowEmail(newValue);
                        localStorage.setItem('show_admin_email', String(newValue));
                      }}
                      className="p-0.5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-md transition-colors"
                      title={showEmail ? "Ocultar email" : "Mostrar email"}
                    >
                      {showEmail ? (
                        <Eye className="w-3 h-3 text-gray-400" />
                      ) : (
                        <EyeOff className="w-3 h-3 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-lg ring-2 ring-white/10 group-hover:ring-primary/50 transition-all">
                  {user?.user_metadata?.name ? user.user_metadata.name.substring(0, 2).toUpperCase() : 'AD'}
                </div>
              </Link>

              <button
                onClick={signOut}
                className="p-2 text-gray-400 hover:text-red-400 hover:bg-white/5 rounded-full transition-colors"
                title="Sair"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        {/* Content Scrollable Area */}
        <div className="flex-1 overflow-auto p-4 lg:p-8 lg:pt-2 scroll-smooth custom-scrollbar">
          <div className="max-w-[1600px] mx-auto pb-20 lg:pb-0">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};
