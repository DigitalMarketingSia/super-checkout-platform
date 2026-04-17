import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { authenticator } from 'otplib';
import {
  applyCors,
  getIp,
  getSupabaseServiceKey,
  getSupabaseUrl,
  getUserAgent,
  logSecurityEvent,
  maskEmail,
  normalizeTotpCode,
} from './_shared';
import { decrypt } from '../../../src/core/utils/cryptoUtils';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { code } = req.body || {};
  const normalizedCode = normalizeTotpCode(code);
  if (!normalizedCode || normalizedCode.length < 6) {
    return res.status(400).json({ error: 'Código TOTP inválido.' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Missing authorization token.' });

  const supabaseUrl = getSupabaseUrl();
  const serviceKey = getSupabaseServiceKey();
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server configuration missing.' });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return res.status(401).json({ error: 'Invalid session.' });

  const user = userData.user;
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, email, totp_secret_encrypted, totp_enabled')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return res.status(404).json({ error: 'Perfil não encontrado.' });
  }

  if (!profile.totp_secret_encrypted || !profile.totp_enabled) {
    return res.status(400).json({ error: '2FA já está desativado.' });
  }

  const secret = decrypt(profile.totp_secret_encrypted);
  if (!authenticator.check(normalizedCode, secret)) {
    await logSecurityEvent({
      supabaseUrl,
      serviceKey,
      eventType: 'two_factor_disable_failed',
      severity: 'WARNING',
      ip: getIp(req),
      userAgent: getUserAgent(req),
      userId: user.id,
      metadata: {
        email: maskEmail(profile.email || user.email || ''),
        source: 'auth_2fa_disable',
      },
    });
    return res.status(401).json({ error: 'Código TOTP inválido.' });
  }

  const { error: updateError } = await admin
    .from('profiles')
    .update({
      totp_enabled: false,
      totp_secret_encrypted: null,
      totp_verified_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (updateError) {
    return res.status(500).json({ error: updateError.message || 'Failed to disable 2FA.' });
  }

  await logSecurityEvent({
    supabaseUrl,
    serviceKey,
    eventType: 'two_factor_disabled',
    severity: 'WARNING',
    ip: getIp(req),
    userAgent: getUserAgent(req),
    userId: user.id,
    metadata: {
      email: maskEmail(profile.email || user.email || ''),
      source: 'auth_2fa_disable',
    },
  });

  return res.status(200).json({
    success: true,
    totp_enabled: false,
  });
}
