import React from 'react';
import { useTranslation } from 'react-i18next';
import { APP_VERSION } from '../../config/version';
import { isLightPublicRoute } from '../../utils/isLightPublicRoute';

interface LoadingProps {
    label?: string;
    sublabel?: string;
    className?: string;
    light?: boolean;
}

export const Loading: React.FC<LoadingProps> = ({
    label,
    sublabel,
    className = '',
    light = false
}) => {
    const { t } = useTranslation('common');
    const resolvedLabel = label ?? t('loading_system');

    // Keep checkout/public boot screens aligned with the light visual surface.
    const isPublicRoute = typeof window !== 'undefined' && isLightPublicRoute(window.location.pathname);

    const isLightTheme = light || isPublicRoute;
    const logoSrc = isLightTheme ? '/logo-dark.png' : '/logo-light.png';

    return (
        <div className={`min-h-screen w-full flex flex-col items-center justify-center px-6 transition-all ${isLightTheme ? 'bg-[#F9F9FB] text-gray-900' : 'bg-[#05050A] text-white'} ${className}`}>
            <div className="relative flex flex-col items-center text-center">
                <div className="relative w-24 h-24 flex items-center justify-center mb-8">
                    {/* Background Ambient Glow */}
                    <div className={`absolute inset-2 rounded-full blur-lg transition-all ${isLightTheme ? 'bg-primary/5' : 'bg-primary/10'}`} />
                    
                    {/* Pulsing Light Glow (VSL Player style) */}
                    <div className={`absolute inset-4 rounded-full blur-md animate-ping transition-all ${isLightTheme ? 'bg-primary/15' : 'bg-primary/25'}`} />
                    
                    {/* Professional Spinner with fade tail (half transparent) */}
                    <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary border-r-primary/20 animate-spin" />
                    
                    {/* Central logo stays clean so it works without a framed badge. */}
                    <div className="relative w-14 h-14 flex items-center justify-center">
                        <img
                            src={`${logoSrc}?v=${APP_VERSION}`}
                            alt={t('app_name')}
                            className="w-full h-full object-contain"
                            draggable={false}
                        />
                    </div>
                </div>
                <p className={`text-[6px] font-black uppercase tracking-[0.45em] animate-pulse transition-all ${isLightTheme ? 'text-gray-500' : 'text-white/40'}`}>
                    {resolvedLabel}
                </p>
                {sublabel && (
                    <p className={`mt-2.5 max-w-xs text-[6px] leading-relaxed animate-pulse transition-all ${isLightTheme ? 'text-gray-400' : 'text-white/25'}`}>
                        {sublabel}
                    </p>
                )}
            </div>
        </div>
    );
};
