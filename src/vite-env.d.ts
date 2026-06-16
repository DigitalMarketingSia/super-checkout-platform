/// <reference types="vite/client" />

// Raw file imports (Vite ?raw suffix)
declare module '*.sql?raw' {
  const content: string;
  export default content;
}

interface Window {
  MercadoPago: any;
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
