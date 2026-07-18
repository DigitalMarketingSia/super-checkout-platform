import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { RiskCaptcha } from './RiskCaptcha';

interface AuthCaptchaPanelProps {
    description: string;
    onTokenChange: (token: string | null) => void;
    siteKey: string;
    title: string;
    widgetKey?: string | number;
}

export const AuthCaptchaPanel: React.FC<AuthCaptchaPanelProps> = ({
    description,
    onTokenChange,
    siteKey,
    title,
    widgetKey,
}) => (
    <div className="bg-transparent border border-white/10 rounded-2xl p-4 space-y-2.5 text-left relative overflow-hidden">
        <div className="flex items-center space-x-2 text-orange-500 relative z-10">
            <ShieldCheck className="w-4.5 h-4.5 text-orange-500 flex-shrink-0" />
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-200 leading-none">
                {title}
            </p>
        </div>
        
        <p className="text-[10px] text-white/40 leading-relaxed relative z-10">
            {description}
        </p>

        <div className="pt-1 flex justify-center items-center w-full relative z-10">
            <RiskCaptcha
                key={widgetKey}
                siteKey={siteKey}
                onTokenChange={onTokenChange}
            />
        </div>
    </div>
);


