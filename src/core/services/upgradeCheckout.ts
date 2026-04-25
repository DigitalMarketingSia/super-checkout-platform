import { toast } from 'sonner';
import { licenseService } from './licenseService';

export type UpgradePlanSlug = 'saas' | 'upgrade_domains' | 'whitelabel';
export type UpgradeSourceSurface = 'portal' | 'installation' | 'crm' | 'direct_link' | 'manual';

interface OpenUpgradeCheckoutParams {
    checkoutUrl: string;
    planSlug: UpgradePlanSlug;
    checkoutId?: string | null;
    productId?: string | null;
    sourceSurface?: UpgradeSourceSurface;
    sourceContext?: Record<string, unknown>;
}

const extractCheckoutIdFromUrl = (checkoutUrl: string): string | null => {
    try {
        const url = new URL(checkoutUrl, window.location.origin);
        const match = url.pathname.match(/\/c\/([^/?#]+)/i);
        return match?.[1] || null;
    } catch {
        return null;
    }
};

const appendUpgradeIntent = (checkoutUrl: string, token: string): string => {
    const url = new URL(checkoutUrl, window.location.origin);
    url.searchParams.set('upgrade_intent', token);
    return url.toString();
};

const openPendingCheckoutWindow = () => {
    const popup = window.open('', '_blank');

    if (popup) {
        popup.document.write(`<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Preparando checkout...</title>
    <style>
      :root {
        --primary: #8b5cf6;
        --bg: #05050a;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--bg);
        color: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        overflow: hidden;
      }
      .container {
        text-align: center;
        padding: 40px;
        position: relative;
      }
      .loader-container {
        position: relative;
        width: 80px;
        height: 80px;
        margin: 0 auto 32px;
      }
      .ring {
        position: absolute;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        border: 2px solid transparent;
        border-top-color: var(--primary);
        animation: rotate 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite;
        filter: drop-shadow(0 0 10px rgba(139, 92, 246, 0.3));
      }
      .dot {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 12px;
        height: 12px;
        background: var(--primary);
        border-radius: 50%;
        box-shadow: 0 0 20px var(--primary);
        animation: pulse 1.5s ease-in-out infinite;
      }
      .status {
        margin: 0;
        letter-spacing: 0.3em;
        text-transform: uppercase;
        font-size: 11px;
        font-weight: 900;
        color: #ffffff;
        opacity: 0;
        animation: fadeIn 0.6s ease-out forwards 0.2s;
      }
      .sub {
        margin-top: 12px;
        font-size: 10px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: #4b5563;
        font-weight: 700;
        opacity: 0;
        animation: fadeIn 0.8s ease-out forwards 0.4s;
      }
      .bg-glow {
        position: absolute;
        width: 300px;
        height: 300px;
        background: radial-gradient(circle, rgba(139, 92, 246, 0.08) 0%, transparent 70%);
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        pointer-events: none;
      }
      @keyframes rotate {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      @keyframes pulse {
        0%, 100% { transform: translate(-50%, -50%) scale(0.85); opacity: 0.6; }
        50% { transform: translate(-50%, -50%) scale(1.1); opacity: 1; }
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
    </style>
  </head>
  <body>
    <div class="bg-glow"></div>
    <div class="container">
      <div class="loader-container">
        <div class="ring"></div>
        <div class="dot"></div>
      </div>
      <p class="status">Preparando Checkout Seguro</p>
      <p class="sub">Autenticando sessão de upgrade...</p>
    </div>
  </body>
</html>`);
        popup.document.close();
    }

    return popup;
};

export const openUpgradeCheckout = async ({
    checkoutUrl,
    planSlug,
    checkoutId,
    productId,
    sourceSurface = 'portal',
    sourceContext = {},
}: OpenUpgradeCheckoutParams) => {
    if (!checkoutUrl) {
        throw new Error('Checkout de upgrade nao configurado.');
    }

    const pendingWindow = openPendingCheckoutWindow();
    const loadingToastId = toast.loading('Preparando checkout seguro...');

    const resolvedCheckoutId = checkoutId || extractCheckoutIdFromUrl(checkoutUrl);
    try {
        const intent = await licenseService.createUpgradeIntent({
            plan_slug: planSlug,
            checkout_id: resolvedCheckoutId,
            product_id: productId || null,
            source_surface: sourceSurface,
            source_context: sourceContext,
        });

        const targetUrl = appendUpgradeIntent(checkoutUrl, intent.token);
        if (pendingWindow && !pendingWindow.closed) {
            pendingWindow.opener = null;
            pendingWindow.location.replace(targetUrl);
        } else {
            window.location.assign(targetUrl);
        }

        toast.success('Checkout de upgrade preparado para esta conta.', { id: loadingToastId });

        return {
            ...intent,
            checkoutUrl: targetUrl,
        };
    } catch (error) {
        pendingWindow?.close();
        toast.error(error instanceof Error ? error.message : 'Falha ao preparar checkout seguro.', {
            id: loadingToastId,
        });
        throw error;
    }
};
