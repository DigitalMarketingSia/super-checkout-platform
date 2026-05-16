/// <reference types="vite/client" />

// Raw file imports (Vite ?raw suffix)
declare module '*.sql?raw' {
  const content: string;
  export default content;
}

interface Window {
  MercadoPago: any;
}
