
import { getEnv } from '../utils/env';

// Configuração da Central de Licenciamento
export const CENTRAL_CONFIG = {
    // URL base das Edge Functions do Central
    API_URL: getEnv('VITE_CENTRAL_API_URL') || 'https://bcmnryxjweiovrwmztpn.supabase.co/functions/v1',

    // Endpoints
    ENDPOINTS: {
        VALIDATE_TOKEN: '/manage-licenses',
        GENERATE_TOKEN: '/generate-install-token',
        GET_LICENSE: '/get-license-status'
    }
};
