/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string
    readonly VITE_SUPABASE_ANON_KEY: string
    readonly VITE_VERCEL_URL: string
    readonly VITE_API_URL: string
    readonly VITE_SUPER_CHECKOUT_MARKETING_URL?: string
    readonly VITE_SUPER_CHECKOUT_APP_URL?: string
    readonly VITE_SUPER_CHECKOUT_PORTAL_URL?: string
    readonly VITE_SUPER_CHECKOUT_INSTALL_URL?: string
    // more env variables...
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
