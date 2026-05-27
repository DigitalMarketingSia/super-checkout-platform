import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { CheckoutConfig } from '../types';
import { useConsent } from './ConsentContext';
import {
    sanitizeGtmId,
    sanitizeFacebookId,
    sanitizeTiktokId,
    sanitizeGoogleAnalyticsId,
    sanitizeGoogleAdsId,
} from '../utils/trackingSanitizer';
import {
    buildTrackingAttributionEventFields,
    type CheckoutTrackingAttribution,
} from '../utils/trackingAttribution';

type TrackingPolicy = 'consent_required' | 'market_standard' | 'disabled';

type TrackingItem = {
    id?: string;
    name?: string;
    price?: number;
    quantity?: number;
    type?: string;
};

type TrackingCheckoutPayload = {
    checkoutId?: string;
    currency?: string;
    value?: number;
    items?: TrackingItem[];
    attribution?: CheckoutTrackingAttribution | null;
};

type TrackingPurchasePayload = {
    id: string;
    amount: number;
    currency?: string;
    coupon?: string;
    items?: TrackingItem[];
    attribution?: CheckoutTrackingAttribution | null;
};

interface TrackingContextType {
    trackPageView: () => void;
    trackInitiateCheckout: (payload?: TrackingCheckoutPayload) => void;
    trackPurchase: (order: TrackingPurchasePayload) => void;
    isInitialized: boolean;
}

const TrackingContext = createContext<TrackingContextType | undefined>(undefined);

function mapItems(items?: TrackingItem[]) {
    return (items || []).map((item, index) => ({
        item_id: item.id || `item-${index + 1}`,
        item_name: item.name || 'Produto',
        price: Number(item.price || 0) || 0,
        quantity: Number(item.quantity || 1) || 1,
        item_category: item.type || undefined,
    }));
}

export const TrackingProvider: React.FC<{
    config?: CheckoutConfig;
    trackingPolicy?: TrackingPolicy;
    attribution?: CheckoutTrackingAttribution | null;
    children: React.ReactNode;
}> = ({ config, trackingPolicy = 'consent_required', attribution = null, children }) => {
    const [scriptsLoaded, setScriptsLoaded] = useState(false);
    const initializedRef = useRef(false);
    const consent = useConsent();
    const allowsAnalytics = trackingPolicy === 'market_standard'
        ? true
        : trackingPolicy === 'disabled'
            ? false
            : consent.allowsAnalytics;
    const allowsMarketing = trackingPolicy === 'market_standard'
        ? true
        : trackingPolicy === 'disabled'
            ? false
            : consent.allowsMarketing;

    const pixels = config?.pixels;
    const canLoadAnalytics = Boolean(
        pixels?.active
        && allowsAnalytics
        && pixels?.google_analytics_id,
    );
    const canLoadMarketing = Boolean(
        pixels?.active
        && allowsMarketing
        && (pixels?.facebook_pixel_id || pixels?.tiktok_pixel_id || pixels?.google_ads_id || pixels?.gtm_id),
    );
    const isActive = canLoadAnalytics || canLoadMarketing;

    const getWindow = () => window as any;
    const attributionFields = buildTrackingAttributionEventFields(attribution);

    useEffect(() => {
        if (!isActive || initializedRef.current) return;

        // GTM is treated as marketing because it can fan out to multiple optional tags.
        if (canLoadMarketing && pixels?.gtm_id) {
            console.log('[Tracking] Initializing GTM:', pixels.gtm_id);
            injectGTM(pixels.gtm_id);
        } else {
            if (canLoadMarketing && pixels?.facebook_pixel_id) {
                console.log('[Tracking] Initializing Facebook Pixel:', pixels.facebook_pixel_id);
                injectFacebook(pixels.facebook_pixel_id);
            }
            if (canLoadMarketing && pixels?.tiktok_pixel_id) {
                console.log('[Tracking] Initializing TikTok Pixel:', pixels.tiktok_pixel_id);
                injectTikTok(pixels.tiktok_pixel_id);
            }
            if (canLoadAnalytics && pixels?.google_analytics_id) {
                console.log('[Tracking] Initializing GA4:', pixels.google_analytics_id);
                injectGA4(pixels.google_analytics_id);
            }
            if (canLoadMarketing && pixels?.google_ads_id) {
                console.log('[Tracking] Initializing Google Ads:', pixels.google_ads_id);
                injectGoogleAds(pixels.google_ads_id);
            }
        }

        initializedRef.current = true;
        setScriptsLoaded(true);
    }, [canLoadAnalytics, canLoadMarketing, isActive, pixels]);

    const trackPageView = () => {
        if (!isActive) return;
        console.log('[Tracking] PageView');
        const eventFields = {
            page_location: window.location.href,
            page_path: window.location.pathname,
            ...attributionFields,
        };

        if (canLoadMarketing && pixels?.gtm_id) {
            getWindow().dataLayer?.push({ event: 'page_view', ...eventFields });
            return;
        }

        if (canLoadMarketing && pixels?.facebook_pixel_id) getWindow().fbq?.('track', 'PageView');
        if (canLoadMarketing && pixels?.tiktok_pixel_id) getWindow().ttq?.page();
        if (canLoadAnalytics && pixels?.google_analytics_id) getWindow().gtag?.('event', 'page_view', eventFields);
    };

    const trackInitiateCheckout = (payload?: TrackingCheckoutPayload) => {
        if (!isActive) return;
        console.log('[Tracking] InitiateCheckout');
        const currency = payload?.currency || 'BRL';
        const items = mapItems(payload?.items);
        const eventId = payload?.checkoutId ? `checkout:${payload.checkoutId}` : undefined;
        const eventFields = {
            currency,
            value: Number(payload?.value || 0) || undefined,
            items,
            ...attributionFields,
        };

        if (canLoadMarketing && pixels?.gtm_id) {
            getWindow().dataLayer?.push({
                event: 'begin_checkout',
                event_id: eventId,
                ecommerce: {
                    currency,
                    value: Number(payload?.value || 0) || undefined,
                    items,
                },
                ...attributionFields,
            });
            return;
        }

        if (canLoadMarketing && pixels?.facebook_pixel_id) {
            getWindow().fbq?.('track', 'InitiateCheckout', {
                currency,
                value: Number(payload?.value || 0) || undefined,
                content_type: 'product',
                contents: items.map((item) => ({
                    id: item.item_id,
                    quantity: item.quantity,
                    item_price: item.price,
                })),
            }, eventId ? { eventID: eventId } : undefined);
        }
        if (canLoadMarketing && pixels?.tiktok_pixel_id) {
            getWindow().ttq?.track('InitiateCheckout', {
                currency,
                value: Number(payload?.value || 0) || undefined,
                content_type: 'product',
                contents: items,
                event_id: eventId,
            });
        }
        if (canLoadAnalytics && pixels?.google_analytics_id) {
            getWindow().gtag?.('event', 'begin_checkout', eventFields);
        }
    };

    const trackPurchase = (order: TrackingPurchasePayload) => {
        if (!isActive) return;

        const currency = order.currency || 'BRL';
        const storageKey = `tracked_order_${order.id}`;
        const items = mapItems(order.items);

        if (localStorage.getItem(storageKey)) {
            console.warn('[Tracking] Purchase event blocked (Duplicate):', order.id);
            return;
        }

        console.log('[Tracking] Purchase:', order);
        localStorage.setItem(storageKey, 'true');

        if (canLoadMarketing && pixels?.gtm_id) {
            getWindow().dataLayer?.push({
                event: 'purchase',
                event_id: order.id,
                ecommerce: {
                    transaction_id: order.id,
                    value: order.amount,
                    currency,
                    coupon: order.coupon,
                    items,
                },
                ...buildTrackingAttributionEventFields(order.attribution || attribution),
            });
            return;
        }

        if (canLoadMarketing && pixels?.facebook_pixel_id) {
            getWindow().fbq?.('track', 'Purchase', {
                value: order.amount,
                currency,
                order_id: order.id,
                content_type: 'product',
                contents: items.map((item) => ({
                    id: item.item_id,
                    quantity: item.quantity,
                    item_price: item.price,
                })),
            }, { eventID: order.id });
        }

        if (canLoadMarketing && pixels?.tiktok_pixel_id) {
            getWindow().ttq?.track('CompletePayment', {
                content_type: 'product',
                quantity: items.reduce((sum, item) => sum + Number(item.quantity || 1), 0) || 1,
                price: order.amount,
                value: order.amount,
                currency,
                contents: items,
                event_id: order.id,
            });
        }

        if (canLoadAnalytics && pixels?.google_analytics_id) {
            getWindow().gtag?.('event', 'purchase', {
                transaction_id: order.id,
                value: order.amount,
                currency,
                coupon: order.coupon,
                items,
                ...buildTrackingAttributionEventFields(order.attribution || attribution),
            });
        }

        if (canLoadMarketing && pixels?.google_ads_id) {
            getWindow().gtag?.('event', 'conversion', {
                send_to: pixels.google_ads_id,
                value: order.amount,
                currency,
                transaction_id: order.id,
            });
        }
    };

    return (
        <TrackingContext.Provider
            value={{
                trackPageView,
                trackInitiateCheckout,
                trackPurchase,
                isInitialized: scriptsLoaded && isActive,
            }}
        >
            {children}
        </TrackingContext.Provider>
    );
};

export const useTracking = () => {
    const context = useContext(TrackingContext);
    if (!context) {
        return {
            trackPageView: () => {},
            trackInitiateCheckout: () => {},
            trackPurchase: () => {},
            isInitialized: false,
        };
    }

    return context;
};

function injectGTM(rawId: string) {
    const id = sanitizeGtmId(rawId);
    if (!id) return;

    const script = document.createElement('script');
    script.innerHTML = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
    new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
    j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
    'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
    })(window,document,'script','dataLayer',${JSON.stringify(id)});`;
    document.head.appendChild(script);

    const noscript = document.createElement('noscript');
    noscript.innerHTML = `<iframe src="https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(id)}"
    height="0" width="0" style="display:none;visibility:hidden"></iframe>`;
    document.body.appendChild(noscript);
}

function injectFacebook(rawId: string) {
    const id = sanitizeFacebookId(rawId);
    if (!id) return;

    const script = document.createElement('script');
    script.innerHTML = `!function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', ${JSON.stringify(id)});`;
    document.head.appendChild(script);
}

function injectTikTok(rawId: string) {
    const id = sanitizeTiktokId(rawId);
    if (!id) return;

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
      ttq.load(${JSON.stringify(id)});
    }(window, document, 'ttq');`;
    document.head.appendChild(script);
}

function injectGA4(rawId: string) {
    const id = sanitizeGoogleAnalyticsId(rawId);
    if (!id) return;

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(script);

    const initScript = document.createElement('script');
    initScript.innerHTML = `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', ${JSON.stringify(id)});
    `;
    document.head.appendChild(initScript);
}

function injectGoogleAds(rawId: string) {
    const id = sanitizeGoogleAdsId(rawId);
    if (!id) return;

    if (!document.querySelector('script[src*="googletagmanager.com/gtag/js"]')) {
        const script = document.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
        document.head.appendChild(script);

        const initScript = document.createElement('script');
        initScript.innerHTML = `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', ${JSON.stringify(id)});
        `;
        document.head.appendChild(initScript);
        return;
    }

    const configScript = document.createElement('script');
    configScript.innerHTML = `gtag('config', ${JSON.stringify(id)});`;
    document.head.appendChild(configScript);
}
