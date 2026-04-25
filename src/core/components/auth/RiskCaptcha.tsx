import React, { useEffect, useRef } from 'react';

declare global {
    interface Window {
        turnstile?: {
            render: (container: HTMLElement, options: Record<string, unknown>) => string;
            remove?: (widgetId: string) => void;
        };
    }
}

interface RiskCaptchaProps {
    siteKey: string;
    onTokenChange: (token: string | null) => void;
}

let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileScript() {
    if (typeof window === 'undefined') {
        return Promise.resolve();
    }

    if (window.turnstile) {
        return Promise.resolve();
    }

    if (turnstileScriptPromise) {
        return turnstileScriptPromise;
    }

    turnstileScriptPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile-script="true"]');
        if (existing) {
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', () => reject(new Error('turnstile_load_failed')), { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.dataset.turnstileScript = 'true';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('turnstile_load_failed'));
        document.head.appendChild(script);
    });

    return turnstileScriptPromise;
}

export const RiskCaptcha: React.FC<RiskCaptchaProps> = ({ siteKey, onTokenChange }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const widgetIdRef = useRef<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        onTokenChange(null);

        loadTurnstileScript()
            .then(() => {
                if (cancelled || !containerRef.current || !window.turnstile) return;
                if (widgetIdRef.current) return;

                widgetIdRef.current = window.turnstile.render(containerRef.current, {
                    sitekey: siteKey,
                    theme: 'dark',
                    callback: (token: string) => onTokenChange(token),
                    'expired-callback': () => onTokenChange(null),
                    'error-callback': () => onTokenChange(null)
                });
            })
            .catch(() => {
                onTokenChange(null);
            });

        return () => {
            cancelled = true;
            if (widgetIdRef.current && window.turnstile?.remove) {
                window.turnstile.remove(widgetIdRef.current);
            }
            widgetIdRef.current = null;
        };
    }, [onTokenChange, siteKey]);

    return <div ref={containerRef} className="min-h-[65px]" />;
};
