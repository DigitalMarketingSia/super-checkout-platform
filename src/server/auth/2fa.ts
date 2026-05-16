import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticator } from 'otplib';
import { createClient } from '@supabase/supabase-js';
import {
  applyCors,
  encryptChallenge,
  getIp,
  getSupabaseServiceKey,
  getSupabaseUrl,
  getUserAgent,
  hashChallengeToken,
  isLegacyApiKeyDisabledError,
  logSecurityEvent,
  maskEmail,
  normalizeTotpCode,
  TWO_FACTOR_ISSUER,
} from './2fa/_shared.js';
import { decrypt } from '../../core/utils/cryptoUtils.js';

type TwoFactorChallengeRow = {
  id: string;
  user_id: string;
  target: string | null;
  session_payload_encrypted: string;
  status: string | null;
  attempts: number | null;
  max_attempts: number | null;
  expires_at: string;
  created_at: string | null;
  used_at: string | null;
};

type StoredLoginSessionPayload = {
  session: any;
  user_id: string;
  user_email?: string | null;
  user_updated_at?: string | null;
  target?: string | null;
  issued_at?: string | null;
};

authenticator.options = {
  ...authenticator.options,
  window: 2,
};

function looksEncrypted(value: string) {
  if (!value || typeof value !== 'string') return false;
  const normalized = value.startsWith('iv:') ? value.slice(3) : value;
  return normalized.split(':').length === 3;
}

function resolveTotpSecret(encryptedSecret: string) {
  const secretPayload = decrypt(encryptedSecret);

  if (!secretPayload || (secretPayload === encryptedSecret && looksEncrypted(encryptedSecret))) {
    throw new Error('TOTP_DECRYPTION_FAILED');
  }

  try {
    const parsed = JSON.parse(secretPayload);
    if (parsed?.secret) return String(parsed.secret);
  } catch {
    // Stored as plain encrypted string from earlier versions.
  }

  return secretPayload;
}

function parseTimestamp(value: string | null | undefined): number {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasUserChangedSinceStoredLogin(
  currentUserUpdatedAt: string | null | undefined,
  storedUserUpdatedAt: string | null | undefined,
): boolean {
  const currentUpdatedAt = parseTimestamp(currentUserUpdatedAt);
  const storedUpdatedAt = parseTimestamp(storedUserUpdatedAt);
  if (!currentUpdatedAt || !storedUpdatedAt) return false;

  return currentUpdatedAt > storedUpdatedAt + 5000;
}

async function updateChallenge(admin: any, challengeId: string, values: Record<string, any>) {
  const { error } = await admin
    .from('two_factor_challenges')
    .update({
      ...values,
      updated_at: new Date().toISOString(),
    })
    .eq('id', challengeId);

  if (error) {
    console.warn('[2FA] Failed to update challenge state:', error.message || error);
  }
}

function getAction(req: VercelRequest): string {
  const raw = req.query.action;
  const queryAction = Array.isArray(raw) ? raw[0] : String(raw || '').trim();
  if (queryAction) return queryAction;

  const bodyAction = (req.body as any)?.action;
  return Array.isArray(bodyAction) ? bodyAction[0] : String(bodyAction || '').trim();
}

function getAuthToken(req: VercelRequest): string {
  const authHeader = req.headers.authorization || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
}

async function resolveStoredLoginSession(admin: any, storedSession: any, expectedUserId: string) {
  const accessToken = String(storedSession?.access_token || '');
  if (accessToken) {
    const { data: tokenAuth, error: tokenError } = await admin.auth.getUser(accessToken);
    if (!tokenError && tokenAuth?.user?.id === expectedUserId) {
      return {
        session: storedSession,
        user: tokenAuth.user,
        reason: null,
      };
    }
  }

  const refreshToken = String(storedSession?.refresh_token || '');
  if (!refreshToken) {
    return {
      session: null,
      user: null,
      reason: 'refresh_token_missing',
    };
  }

  const { data: refreshedAuth, error: refreshError } = await admin.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (refreshError || !refreshedAuth?.session || !refreshedAuth?.user || refreshedAuth.user.id !== expectedUserId) {
    return {
      session: null,
      user: null,
      reason: refreshError?.message || 'session_refresh_failed',
    };
  }

  return {
    session: refreshedAuth.session,
    user: refreshedAuth.user,
    reason: null,
  };
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
      if (isLegacyApiKeyDisabledError(updateError)) {
        return res.status(500).json({
          error: 'As chaves locais do Supabase estao desatualizadas. Use SUPABASE_PUBLISHABLE_KEY/VITE_SUPABASE_PUBLISHABLE_KEY e SUPABASE_SECRET_KEY no .env.local.',
          error_code: 'supabase_legacy_api_keys_disabled',
        });
      }
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
      let tokenHash = '';
      try {
        tokenHash = hashChallengeToken(String(challengeToken));
      } catch {
        return res.status(400).json({ error: 'Challenge inválido.' });
      }

      const { data: challengeData, error: challengeError } = await admin
        .from('two_factor_challenges')
        .select('id, user_id, target, session_payload_encrypted, status, attempts, max_attempts, expires_at, created_at, used_at')
        .eq('token_hash', tokenHash)
        .maybeSingle();

      if (challengeError) {
        if (isLegacyApiKeyDisabledError(challengeError)) {
          return res.status(500).json({
            error: 'As chaves locais do Supabase estao desatualizadas. Use SUPABASE_PUBLISHABLE_KEY/VITE_SUPABASE_PUBLISHABLE_KEY e SUPABASE_SECRET_KEY no .env.local.',
            error_code: 'supabase_legacy_api_keys_disabled',
          });
        }

        await logSecurityEvent({
          supabaseUrl,
          serviceKey,
          eventType: 'two_factor_challenge_lookup_failed',
          severity: 'CRITICAL',
          ip: getIp(req),
          userAgent: getUserAgent(req),
          metadata: {
            source: 'auth_2fa_verify',
            flow: 'login',
            reason: challengeError.message,
          },
        });

        return res.status(500).json({
          error: 'Nao foi possivel validar o challenge 2FA.',
          error_code: 'two_factor_challenge_unavailable',
        });
      }

      const challenge = challengeData as TwoFactorChallengeRow | null;
      if (!challenge) {
        return res.status(400).json({ error: 'Challenge invalido.' });
      }

      const attempts = Number(challenge.attempts || 0);
      const maxAttempts = Math.max(1, Number(challenge.max_attempts || 5));

      if ((challenge.status || 'pending') !== 'pending' || challenge.used_at) {
        await logSecurityEvent({
          supabaseUrl,
          serviceKey,
          eventType: 'two_factor_challenge_replay',
          severity: 'WARNING',
          ip: getIp(req),
          userAgent: getUserAgent(req),
          userId: challenge.user_id,
          metadata: {
            source: 'auth_2fa_verify',
            flow: 'login',
            target: challenge.target || 'local',
            status: challenge.status || 'pending',
          },
        });
        return res.status(400).json({ error: 'Challenge ja utilizado ou invalido.' });
      }

      if (parseTimestamp(challenge.expires_at) <= Date.now()) {
        await updateChallenge(admin, challenge.id, {
          status: 'expired',
        });
        await logSecurityEvent({
          supabaseUrl,
          serviceKey,
          eventType: 'two_factor_challenge_expired',
          severity: 'WARNING',
          ip: getIp(req),
          userAgent: getUserAgent(req),
          userId: challenge.user_id,
          metadata: {
            source: 'auth_2fa_verify',
            flow: 'login',
            target: challenge.target || 'local',
          },
        });
        return res.status(400).json({ error: 'Challenge expirado.' });
      }

      if (attempts >= maxAttempts) {
        await updateChallenge(admin, challenge.id, {
          status: 'failed',
        });
        return res.status(429).json({ error: 'Challenge bloqueado por excesso de tentativas.' });
      }

      const { data: profile, error: profileError } = await admin
        .from('profiles')
        .select('id, email, totp_enabled, totp_secret_encrypted')
        .eq('id', challenge.user_id)
        .single();

      if (profileError || !profile) {
        if (isLegacyApiKeyDisabledError(profileError)) {
          return res.status(500).json({
            error: 'As chaves locais do Supabase estao desatualizadas. Use SUPABASE_PUBLISHABLE_KEY/VITE_SUPABASE_PUBLISHABLE_KEY e SUPABASE_SECRET_KEY no .env.local.',
            error_code: 'supabase_legacy_api_keys_disabled',
          });
        }
        return res.status(404).json({ error: 'Perfil de 2FA não encontrado.' });
      }

      if (!profile.totp_enabled || !profile.totp_secret_encrypted) {
        return res.status(403).json({ error: '2FA não está habilitado para esta conta.' });
      }

      let secret = '';
      try {
        secret = resolveTotpSecret(profile.totp_secret_encrypted);
      } catch (secretError: any) {
        if (secretError?.message === 'TOTP_DECRYPTION_FAILED') {
          return res.status(500).json({
            error: 'Configuração local de 2FA incompatível. Verifique se PAYMENT_ENCRYPTION_KEY é a mesma do ambiente onde a 2FA foi ativada.',
            error_code: 'totp_secret_decryption_failed',
          });
        }
        throw secretError;
      }

      if (!authenticator.check(normalizedCode, secret)) {
        const failedAttempts = attempts + 1;
        await updateChallenge(admin, challenge.id, {
          attempts: failedAttempts,
          status: failedAttempts >= maxAttempts ? 'failed' : 'pending',
          last_failed_at: new Date().toISOString(),
        });
        await logSecurityEvent({
          supabaseUrl,
          serviceKey,
          eventType: 'two_factor_login_failed',
          severity: 'WARNING',
          ip: getIp(req),
          userAgent: getUserAgent(req),
          userId: challenge.user_id,
          metadata: {
            email: maskEmail(profile.email || ''),
            source: 'auth_2fa_verify',
            flow: 'login',
            target: challenge.target || 'local',
            failed_attempts: failedAttempts,
            attempts_remaining: Math.max(0, maxAttempts - failedAttempts),
          },
        });
        return res.status(401).json({ error: 'Código TOTP inválido.' });
      }

      const claimTime = new Date().toISOString();
      const { data: claimedRows, error: claimError } = await admin
        .from('two_factor_challenges')
        .update({
          status: 'verifying',
          updated_at: claimTime,
        })
        .eq('id', challenge.id)
        .eq('status', 'pending')
        .is('used_at', null)
        .select('id');

      if (claimError || !claimedRows?.length) {
        await logSecurityEvent({
          supabaseUrl,
          serviceKey,
          eventType: 'two_factor_challenge_replay',
          severity: 'WARNING',
          ip: getIp(req),
          userAgent: getUserAgent(req),
          userId: challenge.user_id,
          metadata: {
            source: 'auth_2fa_verify',
            flow: 'login',
            target: challenge.target || 'local',
            reason: claimError?.message || 'challenge_not_pending',
          },
        });
        return res.status(400).json({ error: 'Challenge ja utilizado ou invalido.' });
      }

      let storedPayload: StoredLoginSessionPayload;
      try {
        storedPayload = JSON.parse(decrypt(challenge.session_payload_encrypted)) as StoredLoginSessionPayload;
      } catch (payloadError: any) {
        await updateChallenge(admin, challenge.id, {
          status: 'failed',
          last_failed_at: new Date().toISOString(),
        });
        await logSecurityEvent({
          supabaseUrl,
          serviceKey,
          eventType: 'two_factor_challenge_decryption_failed',
          severity: 'CRITICAL',
          ip: getIp(req),
          userAgent: getUserAgent(req),
          userId: challenge.user_id,
          metadata: {
            source: 'auth_2fa_verify',
            flow: 'login',
            target: challenge.target || 'local',
            reason: payloadError?.message || String(payloadError),
          },
        });
        return res.status(500).json({
          error: 'Configuracao local de 2FA incompativel. Verifique se PAYMENT_ENCRYPTION_KEY e a mesma do login.',
          error_code: 'two_factor_challenge_decryption_failed',
        });
      }

      const storedSession = storedPayload?.session;
      if (
        !storedSession?.access_token
        || !storedSession?.refresh_token
        || storedPayload.user_id !== challenge.user_id
        || storedSession.user?.id !== challenge.user_id
      ) {
        await updateChallenge(admin, challenge.id, {
          status: 'failed',
          last_failed_at: new Date().toISOString(),
        });
        return res.status(400).json({ error: 'Challenge invalido.' });
      }

      const resolvedAuth = await resolveStoredLoginSession(admin, storedSession, challenge.user_id);

      if (!resolvedAuth.session || !resolvedAuth.user) {
        await updateChallenge(admin, challenge.id, {
          status: 'failed',
          last_failed_at: new Date().toISOString(),
        });
        await logSecurityEvent({
          supabaseUrl,
          serviceKey,
          eventType: 'two_factor_session_invalid',
          severity: 'WARNING',
          ip: getIp(req),
          userAgent: getUserAgent(req),
          userId: challenge.user_id,
          metadata: {
            email: maskEmail(profile.email || ''),
            source: 'auth_2fa_verify',
            flow: 'login',
            target: challenge.target || 'local',
            reason: resolvedAuth.reason || 'session_validation_failed',
          },
        });
        return res.status(401).json({ error: 'Sessao expirada. Faca login novamente.' });
      }

      if (hasUserChangedSinceStoredLogin(resolvedAuth.user.updated_at, storedPayload.user_updated_at)) {
        await updateChallenge(admin, challenge.id, {
          status: 'failed',
          last_failed_at: new Date().toISOString(),
        });
        await logSecurityEvent({
          supabaseUrl,
          serviceKey,
          eventType: 'two_factor_session_invalid',
          severity: 'WARNING',
          ip: getIp(req),
          userAgent: getUserAgent(req),
          userId: challenge.user_id,
          metadata: {
            email: maskEmail(profile.email || ''),
            source: 'auth_2fa_verify',
            flow: 'login',
            target: challenge.target || 'local',
            reason: 'user_changed_after_challenge',
          },
        });
        return res.status(401).json({ error: 'Sessao expirada. Faca login novamente.' });
      }

      await updateChallenge(admin, challenge.id, {
        status: 'verified',
        used_at: new Date().toISOString(),
      });

      await logSecurityEvent({
        supabaseUrl,
        serviceKey,
        eventType: 'two_factor_verified',
        severity: 'INFO',
        ip: getIp(req),
        userAgent: getUserAgent(req),
        userId: challenge.user_id,
        metadata: {
          email: maskEmail(profile.email || resolvedAuth.user.email || ''),
          source: 'auth_2fa_verify',
          flow: 'login',
          target: challenge.target || 'local',
        },
      });

      return res.status(200).json({
        session: resolvedAuth.session,
        user: resolvedAuth.user,
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
      if (isLegacyApiKeyDisabledError(profileError)) {
        return res.status(500).json({
          error: 'As chaves locais do Supabase estao desatualizadas. Use SUPABASE_PUBLISHABLE_KEY/VITE_SUPABASE_PUBLISHABLE_KEY e SUPABASE_SECRET_KEY no .env.local.',
          error_code: 'supabase_legacy_api_keys_disabled',
        });
      }
      return res.status(404).json({ error: 'Perfil não encontrado.' });
    }

    if (!profile.totp_secret_encrypted) {
      return res.status(400).json({ error: 'Configure a 2FA antes de validar o código.' });
    }

    let secret = '';
    try {
      secret = resolveTotpSecret(profile.totp_secret_encrypted);
    } catch (secretError: any) {
      if (secretError?.message === 'TOTP_DECRYPTION_FAILED') {
        return res.status(500).json({
          error: 'Configuração local de 2FA incompatível. Verifique se PAYMENT_ENCRYPTION_KEY é a mesma do ambiente onde a 2FA foi preparada.',
          error_code: 'totp_secret_decryption_failed',
        });
      }
      throw secretError;
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
      if (isLegacyApiKeyDisabledError(profileError)) {
        return res.status(500).json({
          error: 'As chaves locais do Supabase estao desatualizadas. Use SUPABASE_PUBLISHABLE_KEY/VITE_SUPABASE_PUBLISHABLE_KEY e SUPABASE_SECRET_KEY no .env.local.',
          error_code: 'supabase_legacy_api_keys_disabled',
        });
      }
      return res.status(404).json({ error: 'Perfil não encontrado.' });
    }

    if (!profile.totp_secret_encrypted || !profile.totp_enabled) {
      return res.status(400).json({ error: '2FA já está desativado.' });
    }

    let secret = '';
    try {
      secret = resolveTotpSecret(profile.totp_secret_encrypted);
    } catch (secretError: any) {
      if (secretError?.message === 'TOTP_DECRYPTION_FAILED') {
        return res.status(500).json({
          error: 'Configuração local de 2FA incompatível. Verifique se PAYMENT_ENCRYPTION_KEY é a mesma do ambiente onde a 2FA foi ativada.',
          error_code: 'totp_secret_decryption_failed',
        });
      }
      throw secretError;
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
