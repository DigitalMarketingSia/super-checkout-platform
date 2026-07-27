/// <reference types="vite/client" />

// Raw file imports (Vite ?raw suffix)
declare module '*.sql?raw' {
  const content: string;
  export default content;
}

// Local Vercel Serverless contracts. These are type-only declarations matching
// the public request/response shape used by our handlers, so they never ship
// to the browser or require the Vercel build package at runtime.
declare module '@vercel/node' {
  export type VercelRequestCookies = Record<string, string>;
  export type VercelRequestQuery = Record<string, string | string[]>;
  export type VercelRequestBody = any;

  export type VercelRequest = import('node:http').IncomingMessage & {
    query: VercelRequestQuery;
    cookies: VercelRequestCookies;
    body: VercelRequestBody;
  };

  export type VercelResponse = import('node:http').ServerResponse & {
    send: (body: any) => VercelResponse;
    json: (jsonBody: any) => VercelResponse;
    status: (statusCode: number) => VercelResponse;
    redirect: (statusOrUrl: string | number, url?: string) => VercelResponse;
  };

  export type VercelApiHandler = (
    req: VercelRequest,
    res: VercelResponse,
  ) => void | Promise<void>;
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
