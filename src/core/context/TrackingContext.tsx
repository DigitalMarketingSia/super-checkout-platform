import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { CheckoutConfig } from '../types';

interface TrackingContextType {
    trackPageView: () => void;
    trackInitiateCheckout: () => void;
    trackPurchase: (order: { id: string; amount: number; currency?: string; coupon?: string }) => void;
    isInitialized: boolean;
}

const TrackingContext = createContext<TrackingContextType | undefined>(undefined);

export const TrackingProvider: React.FC<{
    config?: CheckoutConfig;
    children: React.ReactNode
}> = ({ config, children }) => {
    const [scriptsLoaded, setScriptsLoaded] = useState(false);
    const initializedRef = useRef(false);

    // Pixels Config
    const pixels = config?.pixels;
    const isActive = pixels?.active;

    // Helper: Safe access to globals
    const getWindow = () => window as any;

    useEffect(() => {
        if (!isActive || initializedRef.current) return;

        // GTM Priority Logic
        if (pixels?.gtm_id) {
            console.log('🏁 [Tracking] Initializing GTM:', pixels.gtm_id);
            injectGTM(pixels.gtm_id);
        } else {
            // Direct Pixel Injection
            if (pixels?.facebook_pixel_id) {
                console.log('🏁 [Tracking] Initializing Facebook Pixel:', pixels.facebook_pixel_id);
                injectFacebook(pixels.facebook_pixel_id);
            }
            if (pixels?.tiktok_pixel_id) {
                console.log('🏁 [Tracking] Initializing TikTok Pixel:', pixels.tiktok_pixel_id);
                injectTikTok(pixels.tiktok_pixel_id);
            }
            if (pixels?.google_analytics_id) {
                console.log('🏁 [Tracking] Initializing GA4:', pixels.google_analytics_id);
                injectGA4(pixels.google_analytics_id);
            }
            if (pixels?.google_ads_id) {
                console.log('🏁 [Tracking] Initializing Google Ads:', pixels.google_ads_id);
                injectGoogleAds(pixels.google_ads_id);
            }
        }

        initializedRef.current = true;
        setScriptsLoaded(true);

        // Note: We DO NOT cleanup scripts on unmount to avoid breaking global state
        // during navigation (SPA behavior).
    }, [config]);

    // --- Events ---

    const trackPageView = () => {
        if (!isActive) return;
        console.log('📊 [Tracking] PageView');

        // GTM
        if (pixels?.gtm_id) {
            getWindow().dataLayer?.push({ event: 'page_view' });
            return;
        }

        // Direct
        if (pixels?.facebook_pixel_id) getWindow().fbq?.('track', 'PageView');
        if (pixels?.tiktok_pixel_id) getWindow().ttq?.page();
        if (pixels?.google_analytics_id) getWindow().gtag?.('event', 'page_view');
    };

    const trackInitiateCheckout = () => {
        if (!isActive) return;
        console.log('🛒 [Tracking] InitiateCheckout');

        // GTM
        if (pixels?.gtm_id) {
            getWindow().dataLayer?.push({ event: 'begin_checkout' });
            return;
        }

        // Direct
        if (pixels?.facebook_pixel_id) getWindow().fbq?.('track', 'InitiateCheckout');
        if (pixels?.tiktok_pixel_id) getWindow().ttq?.track('InitiateCheckout');
        if (pixels?.google_analytics_id) getWindow().gtag?.('event', 'begin_checkout');
    };

    const trackPurchase = (order: { id: string; amount: number; currency?: string; coupon?: string }) => {
        if (!isActive) return;

        const currency = order.currency || 'BRL';

        // 🛡️ Deduplication Check
        const storageKey = `tracked_order_${order.id}`;
        if (localStorage.getItem(storageKey)) {
            console.warn('⚠️ [Tracking] Purchase event blocked (Duplicate):', order.id);
            return;
        }

        console.log('💰 [Tracking] Purchase:', order);

        // Mark as tracked IMMEDIATELY
        localStorage.setItem(storageKey, 'true');

        // GTM
        if (pixels?.gtm_id) {
            getWindow().dataLayer?.push({
                event: 'purchase',
                ecommerce: {
                    transaction_id: order.id,
                    value: order.amount,
                    currency: currency,
                    coupon: order.coupon
                }
            });
            return;
        }

        // Direct
        if (pixels?.facebook_pixel_id) {
            getWindow().fbq?.('track', 'Purchase', {
                value: order.amount,
                currency: currency,
                order_id: order.id // Advanced matching
            });
        }

        if (pixels?.tiktok_pixel_id) {
            getWindow().ttq?.track('CompletePayment', {
                content_type: 'product',
                quantity: 1,
                price: order.amount,
                value: order.amount,
                currency: currency
            });
        }

        if (pixels?.google_analytics_id) {
            getWindow().gtag?.('event', 'purchase', {
                transaction_id: order.id,
                value: order.amount,
                currency: currency
            });
        }

        if (pixels?.google_ads_id) {
            // Google Ads Conversion usually requires a specific label + ID
            // Standard generic event:
            getWindow().gtag?.('event', 'conversion', {
                send_to: pixels.google_ads_id,
                value: order.amount,
                currency: currency,
                transaction_id: order.id
            });
        }
    };

    return (
        <TrackingContext.Provider value={{
            trackPageView,
            trackInitiateCheckout,
            trackPurchase,
            isInitialized: scriptsLoaded
        }}>
            {children}
        </TrackingContext.Provider>
    );
};

export const useTracking = () => {
    const context = useContext(TrackingContext);
    if (!context) {
        // Return dummy functions if used outside provider to prevent crashes
        return {
            trackPageView: () => { },
            trackInitiateCheckout: () => { },
            trackPurchase: () => { }
        };
    }
    return context;
};

// --- Injection Helpers ---

function injectGTM(id: string) {
    // Head
    const script = document.createElement('script');
    script.innerHTML = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
    new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
    j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
    'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
    })(window,document,'script','dataLayer','${id}');`;
    document.head.appendChild(script);

    // Body (NoScript)
    const noscript = document.createElement('noscript');
    noscript.innerHTML = `<iframe src="https://www.googletagmanager.com/ns.html?id=${id}"
    height="0" width="0" style="display:none;visibility:hidden"></iframe>`;
    document.body.appendChild(noscript);
}

function injectFacebook(id: string) {
    const script = document.createElement('script');
    script.innerHTML = `!function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '${id}');`;
    document.head.appendChild(script);
}

function injectTikTok(id: string) {
    const script = document.createElement('script');
    script.innerHTML = `!function (w, d, t) {
      w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
      ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],
      ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
      for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
      ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
      ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";
      ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};
      var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;
      var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
      ttq.load('${id}');
    }(window, document, 'ttq');`;
    document.head.appendChild(script);
}

function injectGA4(id: string) {
    // 1. Script Tag
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    document.head.appendChild(script);

    // 2. Init
    const initScript = document.createElement('script');
    initScript.innerHTML = `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${id}');
    `;
    document.head.appendChild(initScript);
}

function injectGoogleAds(id: string) {
    // Usually shares gtag logic with GA4, but needs config.
    // We assume GA4 might OR might not be present.
    // If GA4 is NOT present, we need to load the gtag lib.
    if (!document.querySelector('script[src*="googletagmanager.com/gtag/js"]')) {
        const script = document.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
        document.head.appendChild(script);

        const initScript = document.createElement('script');
        initScript.innerHTML = `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${id}');
        `;
        document.head.appendChild(initScript);
    } else {
        // Just config if lib exists
        const configScript = document.createElement('script');
        configScript.innerHTML = `gtag('config', '${id}');`;
        document.head.appendChild(configScript);
    }
}
