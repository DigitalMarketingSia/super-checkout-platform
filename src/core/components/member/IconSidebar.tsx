import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, ShoppingBag, Package, User, ChevronLeft, BookOpen } from 'lucide-react';

interface IconSidebarProps {
    onToggleMenu: () => void;
    isMenuOpen: boolean;
    memberAreaSlug?: string;
    primaryColor?: string;
}

interface IconButtonProps {
    icon: React.ElementType;
    label: string;
    to?: string;
    onClick?: () => void;
    isActive?: boolean;
    disabled?: boolean;
    color?: string;
    noActiveBg?: boolean;
}

const IconButton: React.FC<IconButtonProps> = ({ icon: Icon, label, to, onClick, isActive, disabled, color, noActiveBg }) => {
    const [isHovered, setIsHovered] = React.useState(false);

    const content = (
        <div className="relative group">
            <button
                onClick={onClick}
                disabled={disabled}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                className={`
                    w-12 h-12 rounded-xl flex items-center justify-center
                    transition-all duration-200
                    ${isActive && !noActiveBg
                        ? 'text-white shadow-lg'
                        : disabled
                            ? 'text-gray-600 cursor-not-allowed'
                            : 'text-gray-400 hover:text-white'
                    }
                `}
                style={(() => {
                    if (disabled) return {};
                    const styles: React.CSSProperties = {};
                    
                    if (isActive || isHovered) {
                        styles.color = color || '#fff';
                    } else {
                        styles.color = 'rgba(156, 163, 175, 1)';
                    }

                    if (isActive && !noActiveBg) {
                        styles.backgroundColor = color ? `${color}20` : 'rgba(255, 255, 255, 0.1)';
                        styles.borderColor = color ? `${color}40` : 'rgba(255, 255, 255, 0.2)';
                        styles.border = '1px solid';
                    } else if (isHovered) {
                        styles.backgroundColor = color ? `${color}15` : 'rgba(255, 255, 255, 0.08)';
                    }
                    
                    return styles;
                })()}
            >
                <Icon className="w-5 h-5" />
            </button>

            {/* Tooltip */}
            <div className="absolute left-full ml-4 px-3 py-2 bg-gray-800 text-white text-sm rounded-lg
                          opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap
                          shadow-xl border border-white/10 z-50">
                {label}
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-8 border-transparent border-r-gray-800"></div>
            </div>
        </div>
    );

    if (to && !disabled) {
        return <Link to={to}>{content}</Link>;
    }

    return content;
};

export const IconSidebar: React.FC<IconSidebarProps> = ({ onToggleMenu, isMenuOpen, memberAreaSlug, primaryColor }) => {
    const location = useLocation();

    // Detect if we're on a custom domain
    const isCustomDomain = typeof window !== 'undefined' &&
        !window.location.hostname.includes('vercel.app') &&
        !window.location.hostname.includes('localhost') &&
        !window.location.pathname.startsWith('/app/');

    const appLink = isCustomDomain ? '' : (memberAreaSlug ? `/app/${memberAreaSlug}` : '/app');

    const isActive = (path: string) => {
        if (isCustomDomain) {
            return location.pathname === path;
        }
        return location.pathname.startsWith(`${appLink}${path}`);
    };

    return (
        <div className="fixed left-0 top-0 z-[100] bg-[#1A1E26] border-white/10 
            /* Mobile: Horizontal Top Bar */
            w-full h-16 flex flex-row items-center justify-between px-4 border-b
            /* Desktop: Vertical Left Sidebar */
            md:w-16 md:h-screen md:flex-col md:justify-start md:py-6 md:gap-3 md:border-r md:border-b-0
        ">
            {/* Menu Toggle */}
            <div className="flex-shrink-0">
                <IconButton
                    icon={isMenuOpen ? ChevronLeft : BookOpen}
                    label={isMenuOpen ? 'Fechar Menu' : 'Abrir Menu'}
                    onClick={onToggleMenu}
                    isActive={isMenuOpen}
                    color={primaryColor}
                />
            </div>

            <div className="hidden md:block w-8 h-px bg-white/10 my-2"></div>

            {/* Mobile: Scrollable icons if needed or simplified list */}
            <div className="flex flex-row md:flex-col gap-2 md:gap-3 overflow-x-auto md:overflow-visible no-scrollbar">
                {/* Home */}
                <IconButton
                    icon={Home}
                    label="Início"
                    to={`${appLink}/`}
                    isActive={isActive('/')}
                    color={primaryColor}
                    noActiveBg={true}
                />

                {/* Vitrine (Products for Sale) */}
                <IconButton
                    icon={ShoppingBag}
                    label="Vitrine"
                    to={`${appLink}/products`}
                    isActive={isActive('/products')}
                    color={primaryColor}
                />

                {/* My Products */}
                <IconButton
                    icon={Package}
                    label="Meus Produtos"
                    to={`${appLink}/my-products`}
                    isActive={isActive('/my-products')}
                    color={primaryColor}
                />

                <div className="hidden md:block flex-1"></div>

                {/* Profile */}
                <IconButton
                    icon={User}
                    label="Perfil"
                    to={`${appLink}/profile`}
                    isActive={isActive('/profile')}
                    color={primaryColor}
                />
            </div>
        </div>
    );
};
