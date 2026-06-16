import type { VercelRequest, VercelResponse } from '@vercel/node';
import { encrypt } from '../../utils/cryptoUtils.js';
import { logAuthzEvent, requireApiAuth } from '../_authz.js';
import { enforceApiRateLimit } from '../_rate-limit.js';

/**
 * ADMIN API: SAVE GATEWAY (v4)
 * 
 * Este handler encripta as chaves sensíveis antes de salvar no banco.
 * Garante que dados decriptados nunca saiam do servidor e fiquem 
 * "Encrypted at Rest" no banco de dados.
 */

function parseBody(req: VercelRequest) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function normalizeGatewayProvider(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = await requireApiAuth(req, res, {
      source: 'admin_save_gateway',
      allowedRoles: ['admin', 'owner', 'master_admin'],
    });
    if (!auth) return;

    const { supabaseAdmin, user } = auth;

    const body = parseBody(req);
    const rateLimit = enforceApiRateLimit(req, res, {
      scope: 'admin_save_gateway',
      identifiers: [
        user.id,
        String(body.id || '').trim(),
        String(body.provider || body.name || '').trim(),
        String(body.user_id || '').trim(),
      ],
      limit: 30,
      windowMs: 15 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      await logAuthzEvent({
        supabaseAdmin,
        req,
        source: 'admin_save_gateway',
        eventType: 'gateway_credentials_change_rate_limited',
        severity: 'WARNING',
        userId: user.id,
        metadata: {
          gateway_id: body.id || null,
          provider: body.provider || body.name || null,
        },
      });
      return res.status(429).json({ error: 'Too many requests' });
    }

    const {
      id,
      name,
      public_key,
      private_key,
      webhook_secret,
      config,
      user_id,
      provider,
      active,
      clear_private_key,
      clear_public_key,
      clear_webhook_secret,
    } = body;
    const normalizedProvider = normalizeGatewayProvider(provider || name);

    if (user_id !== user.id) {
      await logAuthzEvent({
        supabaseAdmin,
        req,
        source: 'admin_save_gateway',
        eventType: 'gateway_credentials_change_rejected',
        severity: 'CRITICAL',
        userId: user.id,
        metadata: {
          user_id: user.id,
          requested_user_id: user_id || null,
          reason: 'user_id_mismatch',
          gateway_id: id || null,
        },
      });
      return res.status(403).json({ error: 'Gateway owner mismatch' });
    }

    const encryptionKey = process.env.PAYMENT_ENCRYPTION_KEY;
    if (!encryptionKey) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Helper para evitar encriptar uma string que já foi encriptada (quando o frontend reenvia o fallback)
    const isAlreadyEncrypted = (val: string) => {
      if (!val || typeof val !== 'string') return false;
      if (val.startsWith('iv:')) return val.substring(3).split(':').length === 3;
      return val.split(':').length === 3;
    };

    let existingGateway: {
      id: string;
      user_id: string;
      private_key?: string | null;
      webhook_secret?: string | null;
      provider?: string | null;
      name?: string | null;
    } | null = null;

    if (id) {
      const { data: gatewayById, error: existingGatewayError } = await supabaseAdmin
        .from('gateways')
        .select('id,user_id,private_key,webhook_secret,provider,name')
        .eq('id', id)
        .maybeSingle();

      if (existingGatewayError) throw existingGatewayError;
      if (!gatewayById) return res.status(404).json({ error: 'Gateway not found' });

      existingGateway = gatewayById;
    } else if (normalizedProvider) {
      const { data: ownedGateways, error: lookupError } = await supabaseAdmin
        .from('gateways')
        .select('id,user_id,private_key,webhook_secret,provider,name,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (lookupError) throw lookupError;

      existingGateway = (ownedGateways || []).find((gateway: any) => {
        const providerMatch = normalizeGatewayProvider(gateway?.provider) === normalizedProvider;
        const nameMatch = normalizeGatewayProvider(gateway?.name) === normalizedProvider;
        return providerMatch || nameMatch;
      }) || null;
    }

    const resolveSecretToPersist = (
      incomingValue: unknown,
      existingValue?: string | null,
      shouldClear: boolean = false
    ) => {
      if (shouldClear) return null;
      const rawValue = typeof incomingValue === 'string' ? incomingValue.trim() : '';
      if (!rawValue) return existingValue || null;
      return isAlreadyEncrypted(rawValue) ? rawValue : encrypt(rawValue);
    };

    // Keep existing encrypted secrets when the UI leaves the field blank.
    const encryptedPrivateKey = resolveSecretToPersist(private_key, existingGateway?.private_key, Boolean(clear_private_key));
    const encryptedWebhookSecret = resolveSecretToPersist(webhook_secret, existingGateway?.webhook_secret, Boolean(clear_webhook_secret));

    const gatewayData = {
      name: provider || name,
      provider: provider || name,
      public_key: clear_public_key ? null : public_key,
      private_key: encryptedPrivateKey,
      webhook_secret: encryptedWebhookSecret,
      config: config || {},
      active: active ?? true,
      user_id: user.id
    };

    let result;
    const targetGatewayId = id || existingGateway?.id || null;

    if (targetGatewayId) {
      // Update existing
      if (existingGateway.user_id && existingGateway.user_id !== user.id) {
        await logAuthzEvent({
          supabaseAdmin,
          req,
          source: 'admin_save_gateway',
          eventType: 'gateway_credentials_change_rejected',
          severity: 'CRITICAL',
          userId: user.id,
          metadata: {
            user_id: user.id,
            requested_user_id: existingGateway.user_id,
            reason: 'gateway_owner_mismatch',
            gateway_id: id,
          },
        });
        return res.status(403).json({ error: 'Gateway owner mismatch' });
      }

      result = await supabaseAdmin
        .from('gateways')
        .update(gatewayData)
        .eq('id', targetGatewayId);
    } else {
      // Create new
      result = await supabaseAdmin
        .from('gateways')
        .insert(gatewayData);
    }

    if (result.error) {
      console.error('[AdminSaveGateway] Database Error:', {
        code: result.error.code,
        message: result.error.message,
      });
      await logAuthzEvent({
        supabaseAdmin,
        req,
        source: 'admin_save_gateway',
        eventType: 'gateway_credentials_change_failed',
        severity: 'WARNING',
        userId: user.id,
        metadata: {
          user_id,
          provider: provider || name,
          gateway_id: targetGatewayId,
          action: targetGatewayId ? 'update' : 'create',
          reason: 'database_write_failed',
          code: result.error.code || null,
        },
      });
      throw new Error('Database write failed');
    }

    await logAuthzEvent({
      supabaseAdmin,
      req,
      source: 'admin_save_gateway',
      eventType: 'gateway_credentials_changed',
      severity: 'CRITICAL',
      userId: user.id,
      metadata: {
        user_id,
        provider: provider || name,
        gateway_id: targetGatewayId,
        action: targetGatewayId ? 'update' : 'create',
        active: active ?? true,
        changed_fields: {
          public_key: !!public_key,
          private_key: !!private_key,
          webhook_secret: !!webhook_secret,
          config: !!config,
        },
      },
    });

    return res.status(200).json({ 
      success: true, 
      message: 'Gateway salvo com sucesso (Criptografado)' 
    });

  } catch (error: any) {
    console.error('[AdminSaveGateway] Runtime Error:', error.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
