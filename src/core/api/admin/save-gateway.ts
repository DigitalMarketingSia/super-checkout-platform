import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { encrypt } from '../../utils/cryptoUtils.js';

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

async function validateLocalUser(supabaseUrl: string, anonKey: string, jwt: string) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${jwt}`
    }
  });

  if (!response.ok) return null;
  const user = await response.json();
  return user?.id ? user : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    console.error('[AdminSaveGateway] CRITICAL: SUPABASE_URL, ANON_KEY or SERVICE_KEY missing in environment!');
    return res.status(500).json({ error: 'Internal Server Error' });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  const logGatewayAudit = async (eventType: string, severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'FATAL', metadata: Record<string, any>) => {
    try {
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
        || req.socket?.remoteAddress
        || 'unknown';

      const insertData: any = {
        event_type: eventType,
        severity,
        ip_address: ip,
        metadata: {
          ...metadata,
          user_agent: req.headers['user-agent'] || null,
          source: 'admin_save_gateway'
        }
      };

      if (metadata.user_id) insertData.user_id = metadata.user_id;

      const { error } = await supabaseAdmin.from('security_events').insert(insertData);
      if (error) console.warn('[AdminSaveGateway] Security event insert failed:', error.message);
    } catch (auditError: any) {
      console.warn('[AdminSaveGateway] Security audit failed:', auditError?.message || auditError);
    }
  };

  try {
    const authHeader = req.headers.authorization || '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : '';
    if (!jwt) return res.status(401).json({ error: 'Unauthorized' });

    const user = await validateLocalUser(supabaseUrl, supabaseAnonKey, jwt);
    if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !['admin', 'owner', 'master_admin'].includes(profile?.role)) {
      await logGatewayAudit('gateway_credentials_change_rejected', 'WARNING', {
        user_id: user.id,
        reason: 'insufficient_role',
        role: profile?.role || null
      });
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id, name, public_key, private_key, webhook_secret, config, user_id, provider, active } = parseBody(req);

    if (user_id !== user.id) {
      await logGatewayAudit('gateway_credentials_change_rejected', 'CRITICAL', {
        user_id: user.id,
        requested_user_id: user_id || null,
        reason: 'user_id_mismatch',
        gateway_id: id || null
      });
      return res.status(403).json({ error: 'Gateway owner mismatch' });
    }

    // --- DEBUG LOGS (Fase 11 Debug) ---
    console.log('[AdminSaveGateway] Incoming Request:', { 
      id: id || 'NEW', 
      provider: provider || name, 
      has_public: !!public_key, 
      has_private: !!private_key,
      user_id: user_id ? `${user_id.substring(0, 8)}...` : 'MISSING'
    });

    const encryptionKey = process.env.PAYMENT_ENCRYPTION_KEY || process.env.VITE_PAYMENT_ENCRYPTION_KEY;
    if (!encryptionKey) {
      console.warn('[AdminSaveGateway] WARNING: PAYMENT_ENCRYPTION_KEY is missing in ENV.');
    }

    // Helper para evitar encriptar uma string que já foi encriptada (quando o frontend reenvia o fallback)
    const isAlreadyEncrypted = (val: string) => {
      if (!val || typeof val !== 'string') return false;
      if (val.startsWith('iv:')) return val.substring(3).split(':').length === 3;
      return val.split(':').length === 3;
    };

    // Encrypt sensitive data (Fase 11C)
    const encryptedPrivateKey = (private_key && !isAlreadyEncrypted(private_key)) ? encrypt(private_key) : private_key;
    const encryptedWebhookSecret = (webhook_secret && !isAlreadyEncrypted(webhook_secret)) ? encrypt(webhook_secret) : webhook_secret;

    const gatewayData = {
      name: provider || name,
      provider: provider || name,
      public_key,
      private_key: encryptedPrivateKey,
      webhook_secret: encryptedWebhookSecret,
      config: config || {},
      active: active ?? true,
      user_id: user.id
    };

    let result;

    if (id) {
      // Update existing
      console.log('[AdminSaveGateway] Updating gateway:', id);
      const { data: existingGateway, error: existingGatewayError } = await supabaseAdmin
        .from('gateways')
        .select('id,user_id')
        .eq('id', id)
        .maybeSingle();

      if (existingGatewayError) throw existingGatewayError;
      if (!existingGateway) return res.status(404).json({ error: 'Gateway not found' });

      if (existingGateway.user_id && existingGateway.user_id !== user.id) {
        await logGatewayAudit('gateway_credentials_change_rejected', 'CRITICAL', {
          user_id: user.id,
          requested_user_id: existingGateway.user_id,
          reason: 'gateway_owner_mismatch',
          gateway_id: id
        });
        return res.status(403).json({ error: 'Gateway owner mismatch' });
      }

      result = await supabaseAdmin
        .from('gateways')
        .update(gatewayData)
        .eq('id', id);
    } else {
      // Create new
      console.log('[AdminSaveGateway] Creating new gateway for user:', user.id);
      result = await supabaseAdmin
        .from('gateways')
        .insert(gatewayData);
    }

    if (result.error) {
      console.error('[AdminSaveGateway] Database Error:', result.error);
      await logGatewayAudit('gateway_credentials_change_failed', 'WARNING', {
        user_id,
        provider: provider || name,
        gateway_id: id || null,
        action: id ? 'update' : 'create',
        reason: result.error.message
      });
      throw new Error(`Database Error: ${result.error.message} (${result.error.code})`);
    }

    await logGatewayAudit('gateway_credentials_changed', 'CRITICAL', {
      user_id,
      provider: provider || name,
      gateway_id: id || null,
      action: id ? 'update' : 'create',
      active: active ?? true,
      changed_fields: {
        public_key: !!public_key,
        private_key: !!private_key,
        webhook_secret: !!webhook_secret,
        config: !!config
      }
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
