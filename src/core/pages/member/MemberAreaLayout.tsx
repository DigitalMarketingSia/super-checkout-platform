import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LogOut, User, Menu, X, ChevronDown, ChevronRight, ExternalLink, Home, ShoppingBag, LinkIcon, ChevronUp, Instagram, ArrowUpRight, HelpCircle, Ban, Package } from 'lucide-react';
import { MemberArea, SidebarItem } from '../../types';
import { useTranslation } from 'react-i18next';
import { sanitizeTranslationHtml } from '../../utils/sanitize';

interface MemberAreaLayoutProps {
    children: React.ReactNode;
    memberArea?: MemberArea | null;
}

export const MemberAreaLayout: React.FC<MemberAreaLayoutProps> = ({ children, memberArea }) => {
    console.log('[Layout] Rendering with memberArea:', memberArea ? memberArea.name : 'null');
    const { user, profile, signOut } = useAuth();
    const { t } = useTranslation('member');
    const navigate = useNavigate();
    const location = useLocation();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const [expandedSections, setExpandedSections] = useState<string[]>([]);

    if (profile?.status === 'suspended') {
        return (
            <div className="min-h-screen bg-[#0E1012] flex items-center justify-center text-white p-4 font-sans">
                <div className="max-w-md w-full bg-[#1A1D21] p-8 rounded-2xl border border-red-500/20 text-center space-y-6 shadow-2xl">
                    <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto ring-4 ring-red-500/5">
                        <Ban className="w-10 h-10 text-red-500" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-2xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">{t('status.suspended', 'Acesso Suspenso')}</h2>
                        <p className="text-gray-400 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: sanitizeTranslationHtml(t('status.suspended_desc', 'Sua conta foi temporariamente suspensa por um administrador.<br />Entre em contato com o suporte para mais informações.')) }}>
                        </p>
                    </div>
                    <button
                        onClick={() => { signOut(); navigate('/login'); }}
                        className="w-full py-3 bg-white/5 hover:bg-white/10 active:bg-white/15 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2 text-sm border border-white/5 hover:border-white/10"
                    >
                        <LogOut className="w-4 h-4" />
                        {t('nav.logout', 'Sair da conta')}
                    </button>
                    <div className="pt-4 border-t border-white/5">
                        <p className="text-xs text-gray-600">ID: {user?.id}</p>
                    </div>
                </div>
            </div>
        );
    }

    // Detect if we're on a custom domain
    // If hostname is not the default Vercel domain, we're on a custom domain
    const isCustomDomain = typeof window !== 'undefined' &&
        !window.location.hostname.includes('vercel.app') &&
        !window.location.hostname.includes('localhost') &&
        window.location.pathname.startsWith('/app/') === false;

    // If on custom domain, use root paths. Otherwise use /app/slug paths
    const appLink = isCustomDomain ? '' : (memberArea ? `/app/${memberArea.slug}` : '/app');

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 50);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Favicon Effect
    useEffect(() => {
        if (memberArea?.favicon_url) {
            const link: HTMLLinkElement = document.querySelector("link[rel*='icon']") || document.createElement('link');
            const originalHref = link.href;

            link.type = 'image/x-icon';
            link.rel = 'shortcut icon';
            link.href = memberArea.favicon_url;

            // Ensure it's in the head if we created it
            if (!link.parentElement) {
                document.head.appendChild(link);
            }

            return () => {
                link.href = originalHref;
            };
        }
    }, [memberArea?.favicon_url]);

    const toggleSection = (id: string) => {
        setExpandedSections(prev =>
            prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
        );
    };

    const renderSidebarItem = (item: SidebarItem, depth = 0) => {
        const isExpanded = expandedSections.includes(item.id);
        const hasChildren = item.type === 'section' && item.children && item.children.length > 0;
        const isActive = item.url === location.pathname;

        return (
            <div key={item.id} className="mb-1">
                {item.type === 'section' ? (
                    <>
                        <button
                            onClick={() => toggleSection(item.id)}
                            className={`w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors ${isExpanded ? 'text-white' : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            <span className="flex items-center gap-3">
                                {item.title}
                            </span>
                            {hasChildren && (
                                isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                            )}
                        </button>
                        {isExpanded && hasChildren && (
                            <div className="bg-white/5 pb-2">
                                {item.children!.map(child => renderSidebarItem(child, depth + 1))}
                            </div>
                        )}
                    </>
                ) : (
                    <Link
                        to={item.url || '#'}
                        className={`block px-4 py-3 text-sm transition-colors flex items-center gap-3 ${isActive
                            ? 'text-white bg-white/10 border-l-4 border-red-600'
                            : 'text-gray-400 hover:text-white hover:bg-white/5'
                            } ${depth > 0 ? 'pl-8' : ''}`}
                        onClick={() => setIsSidebarOpen(false)}
                    >
                        {item.title}
                        {item.url?.startsWith('http') && <ExternalLink className="w-3 h-3 opacity-50" />}
                    </Link>
                )}
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-[#0E1012] text-white font-sans selection:bg-red-600 selection:text-white">
            {/* Navbar */}
            <nav
                className={`fixed top-0 w-full z-50 px-4 md:px-8 py-4 flex items-center justify-between transition-all duration-300 ${scrolled ? 'bg-[#0E1012]/80 backdrop-blur-md shadow-lg' : 'bg-gradient-to-b from-black/80 to-transparent'
                    }`}
            >
                <div className="flex items-center gap-6">
                    <button
                        onClick={() => setIsSidebarOpen(true)}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors"
                    >
                        <Menu className="w-6 h-6 text-white" />
                    </button>

                    <Link to={appLink} className="flex items-center gap-2 hover:scale-105 transition-transform">
                        {memberArea?.logo_url ? (
                            <img src={memberArea.logo_url} alt={memberArea.name} className="h-8 object-contain" />
                        ) : (
                            <div className="text-red-600 font-bold text-2xl tracking-tighter">
                                {memberArea?.name?.toUpperCase() || 'MEMBER'} <span className="text-white text-xs font-normal tracking-normal opacity-70">AREA</span>
                            </div>
                        )}
                    </Link>
                </div>

                <div className="flex items-center gap-6">
                    {user ? (
                        <div className="group relative">
                            <div className="flex items-center gap-2 cursor-pointer">
                                <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-xs font-bold" style={{ backgroundColor: memberArea?.primary_color }}>
                                    {user?.user_metadata?.name?.substring(0, 2).toUpperCase() || 'US'}
                                </div>
                            </div>

                            {/* Dropdown */}
                            <div className="absolute right-0 top-full mt-2 w-48 bg-[#1A1D21] border border-white/10 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform origin-top-right">
                                <div className="py-2">
                                    <div className="px-4 py-2 border-b border-white/10 mb-2">
                                        <p className="text-sm font-medium text-white truncate">{user?.user_metadata?.name || t('profile.user', 'Usuário')}</p>
                                        <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                                    </div>
                                    <Link to={`${appLink}/profile`} className="block px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10">
                                        <User className="w-4 h-4 inline mr-2" /> {t('nav.profile', 'Perfil')}
                                    </Link>
                                    <button
                                        onClick={() => { signOut(); navigate(`${appLink}/login`); }}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10"
                                    >
                                        <LogOut className="w-4 h-4 inline mr-2" /> {t('nav.logout', 'Sair')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3">
                            <Link
                                to={`${appLink}/signup`}
                                className="hidden md:block px-4 py-2 text-sm font-medium text-white border border-white/30 rounded hover:bg-white/10 transition-colors"
                            >
                                {t('nav.signup', 'Cadastre-se aqui')}
                            </Link>
                            <Link
                                to={`${appLink}/login`}
                                className="px-4 py-2 text-sm font-medium text-[#0E1012] bg-white rounded hover:bg-gray-100 transition-colors"
                            >
                                {t('nav.login', 'Entrar')}
                            </Link>
                        </div>
                    )}
                </div>
            </nav>

            {/* Sidebar / Drawer */}
            {/* Overlay */}
            <div
                className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
                    }`}
                onClick={() => setIsSidebarOpen(false)}
            />

            {/* Sidebar Content */}
            <div
                className={`fixed top-0 left-0 h-full w-80 bg-[#0E1012]/80 backdrop-blur-md border-r border-white/5 z-[70] transform transition-transform duration-300 shadow-2xl flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
            >
                {/* Header */}
                <div className="p-6 flex items-center justify-between border-b border-white/5">
                    <div className="flex items-center gap-2">
                        {memberArea?.logo_url ? (
                            <img src={memberArea.logo_url} alt={memberArea.name} className="h-8 object-contain" />
                        ) : (
                            <span className="font-bold text-lg tracking-tight">{memberArea?.name || 'Menu'}</span>
                        )}
                    </div>
                    <button
                        onClick={() => setIsSidebarOpen(false)}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Menu Items */}
                <div className="flex-1 overflow-y-auto py-6 px-4">
                    <ul className="space-y-2">
                        {/* 1. Início */}
                        <li>
                            <Link
                                to={appLink}
                                onClick={() => setIsSidebarOpen(false)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group ${location.pathname === appLink
                                    ? 'bg-[#D4143C] text-white shadow-lg shadow-red-900/20'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                                    }`}
                                style={location.pathname === appLink && memberArea?.primary_color ? { backgroundColor: memberArea.primary_color } : {}}
                            >
                                <Home className="w-5 h-5" />
                                <span className="font-medium">{t('nav.home', 'Início')}</span>
                            </Link>
                        </li>

                        {/* 2. Meus Produtos */}
                        <li>
                            <Link
                                to={`${appLink}/my-products`}
                                onClick={() => setIsSidebarOpen(false)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group ${location.pathname.includes('/my-products')
                                    ? 'bg-[#D4143C] text-white shadow-lg shadow-red-900/20'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                                    }`}
                                style={location.pathname.includes('/my-products') && memberArea?.primary_color ? { backgroundColor: memberArea.primary_color } : {}}
                            >
                                <Package className="w-5 h-5" />
                                <span className="font-medium">{t('nav.my_products', 'Meus Produtos')}</span>
                            </Link>
                        </li>

                        {/* 3. Produtos à Venda */}
                        <li>
                            <Link
                                to={`${appLink}/products`}
                                onClick={() => setIsSidebarOpen(false)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group ${location.pathname.includes('/products')
                                    ? 'bg-[#D4143C] text-white shadow-lg shadow-red-900/20'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                                    }`}
                                style={location.pathname.includes('/products') && memberArea?.primary_color ? { backgroundColor: memberArea.primary_color } : {}}
                            >
                                <ShoppingBag className="w-5 h-5" />
                                <span className="font-medium">{t('nav.products_for_sale', 'Produtos à venda')}</span>
                            </Link>
                        </li>

                        {/* 4. Links (Dropdown) */}
                        <li>
                            <button
                                onClick={() => toggleSection('links')}
                                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all duration-200 group ${expandedSections.includes('links')
                                    ? 'text-white bg-white/5'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <LinkIcon className="w-5 h-5" />
                                    <span className="font-medium">{t('nav.links', 'Links')}</span>
                                </div>
                                <ChevronUp
                                    className={`w-4 h-4 transition-transform duration-300 ${expandedSections.includes('links') ? 'rotate-0' : 'rotate-180'
                                        }`}
                                />
                            </button>

                            {/* Dropdown Content */}
                            <div
                                className={`overflow-hidden transition-all duration-300 ease-in-out ${expandedSections.includes('links') ? 'max-h-96 opacity-100 mt-2' : 'max-h-0 opacity-0'
                                    }`}
                            >
                                <ul className="space-y-1 pl-4">
                                    {/* Custom Links */}
                                    {(memberArea?.custom_links || []).filter(l => l.active).map(link => (
                                        <li key={link.id}>
                                            <a
                                                href={link.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center justify-between px-4 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors group"
                                                onClick={() => setIsSidebarOpen(false)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    {/* We could add icon support here later if needed, for now using generic or specific if known */}
                                                    {link.title.toLowerCase().includes('instagram') ? (
                                                        <Instagram className="w-4 h-4" />
                                                    ) : (
                                                        <ExternalLink className="w-4 h-4" />
                                                    )}
                                                    <span>{link.title}</span>
                                                </div>
                                                <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                                            </a>
                                        </li>
                                    ))}

                                    {/* FAQ Link */}
                                    <li>
                                        <Link
                                            to={`${appLink}/faq`}
                                            onClick={() => setIsSidebarOpen(false)}
                                            className={`flex items-center justify-between px-4 py-2.5 rounded-lg text-sm transition-colors group ${location.pathname.includes('/faq')
                                                ? 'text-white bg-white/10'
                                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                                                }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <HelpCircle className="w-4 h-4" />
                                                <span>{t('nav.faq', 'Dúvidas frequentes')}</span>
                                            </div>
                                        </Link>
                                    </li>
                                </ul>
                            </div>
                        </li>
                    </ul>
                </div>

                {/* Footer - Branding (Hidden if Custom Branding is Active) */}
                {!memberArea?.custom_branding && (
                    <div className="p-6 border-t border-white/5">
                        <div className="flex items-center justify-center gap-1 text-xs text-gray-600 font-medium">
                            <span className="text-[10px]">Create by</span>
                            <span className="text-gray-500 font-bold tracking-wide">Super Checkout .APP<sup className="text-[8px] ml-0.5">&reg;</sup></span>
                        </div>
                    </div>
                )}
            </div>

            {/* Main Content */}
            <main className="pt-20 pb-20 min-h-screen">
                {children}
            </main>

            {/* Footer */}
            <footer className="py-12 px-4 md:px-12 text-center text-gray-500 text-sm bg-black/50 mt-auto flex flex-col items-center justify-center gap-2">
                <p>Copyright © {new Date().getFullYear()} {memberArea?.name || 'Member Area'}</p>

                {!memberArea?.custom_branding && (
                    <div className="flex items-center gap-2 opacity-50 text-xs mt-2">
                        <span>Powered by</span>
                        <img src="/logo.png" alt="Logo" className="w-3 h-3 object-contain" />
                        <span className="font-bold">Super Checkout</span>
                    </div>
                )}
            </footer>
        </div>
    );
};
