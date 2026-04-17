import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticator } from 'otplib';
import { createClient } from '@supabase/supabase-js';
import {
  applyCors,
  decryptChallenge,
  encryptChallenge,
  getIp,
  getSupabaseServiceKey,
  getSupabaseUrl,
  getUserAgent,
  isValidChallengeExpiry,
  logSecurityEvent,
  maskEmail,
  normalizeTotpCode,
  TWO_FACTOR_ISSUER,
} from './2fa/_shared.js';
import { decrypt } from '../../src/core/utils/cryptoUtils.js';

type TwoFactorChallenge = {
  session: any;
  user: any;
  userId: string;
  target: string;
  expiresAt: number;
};

function getAction(req: VercelRequest): string {
  const raw = req.query.action;
  return Array.isArray(raw) ? raw[0] : String(raw || '').trim();
}

function getAuthToken(req: VercelRequest): string {
  const authHeader = req.headers.authorization || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const action = getAction(req);
  const supabaseUrl = getSupabaseUrl();
  const serviceKey = getSupabaseServiceKey();
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server configuration missing.' });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (action === 'setup') {
    const token = getAuthToken(req);
    if (!token) return res.status(401).json({ error: 'Missing authorization token.' });

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) return res.status(401).json({ error: 'Invalid session.' });

    const user = userData.user;
    const secret = authenticator.generateSecret();
    const label = user.email || user.id;
    const otpauthUrl = authenticator.keyuri(label, TWO_FACTOR_ISSUER, secret);
    const qrCodeDataUrl = await import('qrcode').then((mod) =>
      mod.toDataURL(otpauthUrl, {
        errorCorrectionLevel: 'M',
        margin: 1,
        scale: 6,
      })
    );

    const { error: updateError } = await admin
      .from('profiles')
      .update({
        totp_secret_encrypted: encryptChallenge({ secret }),
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

  if (action === 'verify') {
    const { code, challenge_token: challengeToken } = req.body || {};
    const normalizedCode = normalizeTotpCode(code);
    if (!normalizedCode || normalizedCode.length < 6) {
      return res.status(400).json({ error: 'Código TOTP inválido.' });
    }

    if (challengeToken) {
      let challenge: TwoFactorChallenge;
      try {
        challenge = decryptChallenge<TwoFactorChallenge>(challengeToken);
      } catch {
        return res.status(400).json({ error: 'Challenge inválido.' });
      }

      if (!challenge?.session || !challenge?.user || !challenge?.userId || !isValidChallengeExpiry(challenge.expiresAt)) {
        return res.status(400).json({ error: 'Challenge expirado.' });
      }

      const { data: profile, error: profileError } = await admin
        .from('profiles')
        .select('id, email, totp_enabled, totp_secret_encrypted')
        .eq('id', challenge.userId)
        .single();

      if (profileError || !profile) {
        return res.status(404).json({ error: 'Perfil de 2FA não encontrado.' });
      }

      if (!profile.totp_enabled || !profile.totp_secret_encrypted) {
        return res.status(403).json({ error: '2FA não está habilitado para esta conta.' });
      }

      const secretPayload = decrypt(profile.totp_secret_encrypted);
      let secret = secretPayload;
      try {
        const parsed = JSON.parse(secretPayload);
        if (parsed?.secret) secret = parsed.secret;
      } catch {
        // Stored as plain encrypted string from earlier versions.
      }

      if (!authenticator.check(normalizedCode, secret)) {
        await logSecurityEvent({
          supabaseUrl,
          serviceKey,
          eventType: 'two_factor_login_failed',
          severity: 'WARNING',
          ip: getIp(req),
          userAgent: getUserAgent(req),
          userId: challenge.userId,
          metadata: {
            email: maskEmail(profile.email || challenge.user?.email || ''),
            source: 'auth_2fa_verify',
            flow: 'login',
          },
        });
        return res.status(401).json({ error: 'Código TOTP inválido.' });
      }

      await logSecurityEvent({
        supabaseUrl,
        serviceKey,
        eventType: 'two_factor_verified',
        severity: 'INFO',
        ip: getIp(req),
        userAgent: getUserAgent(req),
        userId: challenge.userId,
        metadata: {
          email: maskEmail(profile.email || challenge.user?.email || ''),
          source: 'auth_2fa_verify',
          flow: 'login',
        },
      });

      return res.status(200).json({
        session: challenge.session,
        user: challenge.user,
      });
    }

    const token = getAuthToken(req);
    if (!token) return res.status(401).json({ error: 'Missing authorization token.' });

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

    if (!profile.totp_secret_encrypted) {
      return res.status(400).json({ error: 'Configure a 2FA antes de validar o código.' });
    }

    const secretPayload = decrypt(profile.totp_secret_encrypted);
    let secret = secretPayload;
    try {
      const parsed = JSON.parse(secretPayload);
      if (parsed?.secret) secret = parsed.secret;
    } catch {
      // Stored as plain encrypted string from earlier versions.
    }

    if (!authenticator.check(normalizedCode, secret)) {
      await logSecurityEvent({
        supabaseUrl,
        serviceKey,
        eventType: 'two_factor_enable_failed',
        severity: 'WARNING',
        ip: getIp(req),
        userAgent: getUserAgent(req),
        userId: user.id,
        metadata: {
          email: maskEmail(profile.email || user.email || ''),
          source: 'auth_2fa_verify',
          flow: 'enable',
        },
      });
      return res.status(401).json({ error: 'Código TOTP inválido.' });
    }

    const { error: updateError } = await admin
      .from('profiles')
      .update({
        totp_enabled: true,
        totp_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (updateError) {
      return res.status(500).json({ error: updateError.message || 'Failed to enable 2FA.' });
    }

    await logSecurityEvent({
      supabaseUrl,
      serviceKey,
      eventType: 'two_factor_enabled',
      severity: 'WARNING',
      ip: getIp(req),
      userAgent: getUserAgent(req),
      userId: user.id,
      metadata: {
        email: maskEmail(profile.email || user.email || ''),
        source: 'auth_2fa_verify',
        flow: 'enable',
      },
    });

    return res.status(200).json({
      success: true,
      totp_enabled: true,
    });
  }

  if (action === 'disable') {
    const { code } = req.body || {};
    const normalizedCode = normalizeTotpCode(code);
    if (!normalizedCode || normalizedCode.length < 6) {
      return res.status(400).json({ error: 'Código TOTP inválido.' });
    }

    const token = getAuthToken(req);
    if (!token) return res.status(401).json({ error: 'Missing authorization token.' });

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

    const secretPayload = decrypt(profile.totp_secret_encrypted);
    let secret = secretPayload;
    try {
      const parsed = JSON.parse(secretPayload);
      if (parsed?.secret) secret = parsed.secret;
    } catch {
      // Stored as plain encrypted string from earlier versions.
    }

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

  return res.status(404).json({ error: `Action ${action || 'unknown'} not found in 2FA controller` });
}
