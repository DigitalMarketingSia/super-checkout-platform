const PAGSEGURO_SDK_URL = 'https://assets.pagseguro.com.br/checkout-sdk-js/rc/dist/browser/pagseguro.min.js';

declare global {
  interface Window {
    PagSeguro?: {
      encryptCard: (params: {
        publicKey: string;
        holder: string;
        number: string;
        expMonth: string;
        expYear: string;
        securityCode: string;
      }) => {
        encryptedCard?: string;
        hasErrors?: boolean;
        errors?: Array<{ code?: string; message?: string }>;
      };
    };
  }
}

let pagSeguroSdkPromise: Promise<NonNullable<Window['PagSeguro']>> | null = null;

export async function loadPagSeguroSdk(): Promise<NonNullable<Window['PagSeguro']>> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('PagBank SDK is only available in the browser.');
  }

  if (window.PagSeguro?.encryptCard) {
    return window.PagSeguro;
  }

  if (!pagSeguroSdkPromise) {
    pagSeguroSdkPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${PAGSEGURO_SDK_URL}"]`);
      if (existingScript) {
        existingScript.addEventListener('load', () => {
          if (window.PagSeguro?.encryptCard) resolve(window.PagSeguro);
          else reject(new Error('PagBank SDK loaded without encryptCard.'));
        }, { once: true });
        existingScript.addEventListener('error', () => reject(new Error('Failed to load PagBank SDK.')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = PAGSEGURO_SDK_URL;
      script.async = true;
      script.onload = () => {
        if (window.PagSeguro?.encryptCard) resolve(window.PagSeguro);
        else reject(new Error('PagBank SDK loaded without encryptCard.'));
      };
      script.onerror = () => reject(new Error('Failed to load PagBank SDK.'));
      document.body.appendChild(script);
    }).catch((error) => {
      pagSeguroSdkPromise = null;
      throw error;
    });
  }

  return pagSeguroSdkPromise;
}

export async function encryptPagSeguroCard(params: {
  publicKey: string;
  holder: string;
  number: string;
  expMonth: string;
  expYear: string;
  securityCode: string;
}): Promise<string> {
  const sdk = await loadPagSeguroSdk();
  const normalizedYear = String(params.expYear || '').trim();
  const encryptedCard = sdk.encryptCard({
    publicKey: String(params.publicKey || '').trim(),
    holder: String(params.holder || '').trim(),
    number: String(params.number || '').replace(/\D/g, ''),
    expMonth: String(params.expMonth || '').replace(/\D/g, '').padStart(2, '0'),
    expYear: normalizedYear.length === 2 ? `20${normalizedYear}` : normalizedYear,
    securityCode: String(params.securityCode || '').replace(/\D/g, ''),
  });

  if (!encryptedCard || encryptedCard.hasErrors || !encryptedCard.encryptedCard) {
    const firstError = encryptedCard?.errors?.[0];
    throw new Error(firstError?.message || 'Nao foi possivel criptografar o cartao com o SDK do PagBank.');
  }

  return encryptedCard.encryptedCard;
}
