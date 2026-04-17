import type { VercelRequest, VercelResponse } from '@vercel/node';
import QRCode from 'qrcode';
import { authenticator } from 'otplib';
import { createClient } from '@supabase/supabase-js';
import {
  applyCors,
  getIp,
  getSupabaseServiceKey,
  getSupabaseUrl,
  getUserAgent,
  maskEmail,
  logSecurityEvent,
  TWO_FACTOR_ISSUER,
} from './_shared';
import { encrypt } from '../../../src/core/utils/cryptoUtils';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
  const secret = authenticator.generateSecret();
  const label = user.email || user.id;
  const otpauthUrl = authenticator.keyuri(label, TWO_FACTOR_ISSUER, secret);
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    scale: 6,
  });

  const { error: updateError } = await admin
    .from('profiles')
    .update({
      totp_secret_encrypted: encrypt(secret),
      totp_enabled: false,
      totp_verified_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (updateError) {
    return res.status(500).json({ error: updateError.message || 'Failed to prepare 2FA setup.' });
  }

  await logSecurityEvent({
    supabaseUrl,
    serviceKey,
    eventType: 'two_factor_setup_started',
    severity: 'INFO',
    ip: getIp(req),
    userAgent: getUserAgent(req),
    userId: user.id,
    metadata: {
      email: maskEmail(user.email || ''),
      issuer: TWO_FACTOR_ISSUER,
      source: 'settings_2fa_setup',
    },
  });

  return res.status(200).json({
    secret,
    otpauth_url: otpauthUrl,
    qr_code_data_url: qrCodeDataUrl,
    issuer: TWO_FACTOR_ISSUER,
    account_label: label,
  });
}
