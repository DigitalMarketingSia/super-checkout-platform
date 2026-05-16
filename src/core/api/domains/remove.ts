import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from '../_cors.js';
import { logAuthzEvent, requireApiAuth } from '../_authz.js';
import { enforceApiRateLimit } from '../_rate-limit.js';

function normalizeDomain(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(req, res, 'DELETE,OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireApiAuth(req, res, {
    source: 'domains_remove',
    allowedRoles: ['admin', 'owner', 'master_admin'],
  });
  if (!auth) return;

  const { supabaseAdmin, user } = auth;
  const domain = normalizeDomain(req.query.domain);
  const rateLimit = enforceApiRateLimit(req, res, {
    scope: 'domains_remove',
    identifiers: [user.id, domain],
    limit: 20,
    windowMs: 15 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    await logAuthzEvent({
      supabaseAdmin,
      req,
      source: 'domains_remove',
      eventType: 'domain_operation_rate_limited',
      severity: 'WARNING',
      userId: user.id,
      metadata: {
        action: 'remove',
        domain,
      },
    });
    return res.status(429).json({ error: 'Too many requests' });
  }

  if (!domain) {
    return res.status(400).json({ error: 'Domain is required' });
  }

  const { data: existingDomain, error: existingDomainError } = await supabaseAdmin
    .from('domains')
    .select('id,user_id,domain')
    .eq('domain', domain)
    .maybeSingle();

  if (existingDomainError) {
    console.error('[domains_remove] Failed to load domain ownership:', existingDomainError.message);
    await logAuthzEvent({
      supabaseAdmin,
      req,
      source: 'domains_remove',
      eventType: 'domain_operation_rejected',
      severity: 'CRITICAL',
      userId: user.id,
      metadata: {
        reason: 'domain_lookup_failed',
        domain,
      },
    });
    return res.status(500).json({ error: 'Internal Server Error' });
  }

  if (!existingDomain) {
    return res.status(404).json({ error: 'Domain not found' });
  }

  if (existingDomain.user_id !== user.id) {
    await logAuthzEvent({
      supabaseAdmin,
      req,
      source: 'domains_remove',
      eventType: 'domain_operation_rejected',
      severity: 'CRITICAL',
      userId: user.id,
      metadata: {
        reason: 'domain_owner_mismatch',
        domain,
        domain_id: existingDomain.id,
      },
    });
    return res.status(403).json({ error: 'Access denied' });
  }

  const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
  const PROJECT_ID = process.env.VERCEL_PROJECT_ID;
  const TEAM_ID = process.env.VERCEL_TEAM_ID;

  if (!VERCEL_TOKEN || !PROJECT_ID) {
    console.error('Missing Vercel configuration');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const response = await fetch(
      `https://api.vercel.com/v9/projects/${PROJECT_ID}/domains/${domain}${TEAM_ID ? `?teamId=${TEAM_ID}` : ''}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${VERCEL_TOKEN}`,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Vercel API Error:', data);
      return res.status(response.status).json({ error: 'Failed to remove domain' });
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Error removing domain:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
