import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireApiAuth } from '../_authz.js';
import { syncInstallationServiceOffer } from './_installation-service-offer.js';

function parseBody(req: VercelRequest): Record<string, unknown> {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      const parsed = JSON.parse(req.body);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireApiAuth(req, res, {
    source: 'admin_sync_installation_service_offer',
    allowedRoles: ['owner', 'admin', 'master_admin', 'partner'],
  });
  if (!auth) return;

  try {
    const body = parseBody(req);
    const result = await syncInstallationServiceOffer({
      req,
      supabaseAdmin: auth.supabaseAdmin,
      userId: auth.user.id,
      selectProductId: typeof body.productId === 'string' ? body.productId : null,
    });

    if (!result.synced) {
      return res.status(503).json({ error: result.message || 'A oferta ainda não pôde ser publicada no Portal.' });
    }

    return res.status(200).json({ success: true, active: result.active });
  } catch (error: any) {
    console.error('[sync-installation-service-offer] Failed:', error?.message || error);
    return res.status(503).json({ error: error?.message || 'Não foi possível sincronizar a oferta de instalação.' });
  }
}
