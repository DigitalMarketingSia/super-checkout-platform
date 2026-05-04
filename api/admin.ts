import type { VercelRequest, VercelResponse } from '@vercel/node';
import createLicenseHandler from '../src/core/api/admin/create-license.js';
import membersHandler from '../src/core/api/admin/members.js';
import saveGatewayHandler from '../src/core/api/admin/save-gateway.js';
import securityEventsHandler from '../src/core/api/admin/security-events.js';
import schemaAuditHandler from '../src/core/api/admin/schema-audit.js';
import runMigrationHandler from '../src/core/api/admin/run-migration.js';
import systemInfoHandler from '../src/core/api/admin/system-info.js';
import updateLogHandler from '../src/core/api/admin/update-log.js';

const ALLOWED_ORIGINS = [
    process.env.APP_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.NEXT_PUBLIC_APP_URL,
    'http://localhost:3000',
    'http://localhost:5173'
].filter(Boolean);

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // 1. CORS Whitelist (Fase 11F)
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        // Fallback for non-browser or matched origins
        res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0] || '*');
    }
    
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    const { action } = req.query;

    try {
        switch (action) {
            case 'create-license':
                return await createLicenseHandler(req, res);
            case 'members':
                return await membersHandler(req, res);
            case 'save-gateway':
                return await saveGatewayHandler(req, res);
            case 'security-events':
                return await securityEventsHandler(req, res);
            case 'schema-audit':
                return await schemaAuditHandler(req, res);
            case 'run-migration':
                return await runMigrationHandler(req, res);
            case 'system-info':
                return await systemInfoHandler(req, res);
            case 'update-log':
                return await updateLogHandler(req, res);
            default:
                return res.status(404).json({ error: `Action ${action} not found in Admin Controller` });
        }
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}
