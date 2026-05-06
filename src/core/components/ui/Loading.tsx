import React from 'react';
import { APP_VERSION } from '../../config/version';

interface LoadingProps {
    label?: string;
    sublabel?: string;
    className?: string;
}

export const Loading: React.FC<LoadingProps> = ({
    label = 'Carregando sistema',
    sublabel,
    className = ''
}) => {
    return (
        <div className={`min-h-screen w-full flex flex-col items-center justify-center bg-[#05050A] text-white px-6 ${className}`}>
            <div className="relative flex flex-col items-center text-center">
                <div className="relative w-28 h-28 flex items-center justify-center mb-7">
                    <div className="absolute inset-0 rounded-full border border-white/10" />
                    <div className="absolute inset-2 rounded-full border border-primary/25 animate-ping" />
                    <div className="absolute inset-3 rounded-full border-2 border-transparent border-t-primary border-r-primary/70 animate-spin" />
                    <div className="absolute inset-6 rounded-full bg-primary/10 blur-xl" />
                    <div className="relative w-16 h-16 rounded-full shadow-[0_24px_70px_rgba(138,43,226,0.22)] flex items-center justify-center overflow-hidden">
                        <img
                            src={`/logo.png?v=${APP_VERSION}`}
                            alt="Super Checkout"
                            className="w-full h-full object-cover"
                            draggable={false}
                        />
                    </div>
                </div>
                <p className="text-[11px] font-black uppercase tracking-[0.28em] text-white/70">
                    {label}
                </p>
                {sublabel && (
                    <p className="mt-3 max-w-xs text-xs text-white/35 leading-relaxed">
                        {sublabel}
                    </p>
                )}
            </div>
        </div>
    );
};
