import type { VercelRequest, VercelResponse } from '@vercel/node';
import loginHandler from '../src/server/auth/login.js';
import registerHandler from '../src/server/auth/register.js';
import twoFactorHandler from '../src/server/auth/2fa.js';
import securityEventHandler from '../src/server/auth/security-event.js';

function getRoute(req: VercelRequest) {
    const route = String(req.query.route || req.query.handler || '').trim();
    if (route) return route;

    const url = String(req.url || '');
    const match = url.match(/\/api\/auth\/([^/?#]+)/);
    return match?.[1] || '';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const route = getRoute(req);

    switch (route) {
        case 'login':
            return loginHandler(req, res);
        case 'register':
            return registerHandler(req, res);
        case '2fa':
            return twoFactorHandler(req, res);
        case 'security-event':
            return securityEventHandler(req, res);
        default:
            return res.status(404).json({ error: 'Auth route not found' });
    }
}
