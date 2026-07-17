import React from 'react';
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
    <div className="bg-white/5 border border-white/10 rounded-3xl p-5 space-y-3 text-left">
        <p className="text-xs text-gray-300 font-bold uppercase tracking-[0.18em]">
            {title}
        </p>
        <p className="text-sm text-gray-400 leading-relaxed">
            {description}
        </p>
        <RiskCaptcha
            key={widgetKey}
            siteKey={siteKey}
            onTokenChange={onTokenChange}
        />
    </div>
);
