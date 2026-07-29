import React, { useState } from 'react';
import { AlertTriangle, Loader2, ShieldCheck, Smartphone } from 'lucide-react';
import { centralSupabase } from '../../../services/centralClient';
import { getApiUrl } from '../../../utils/apiUtils';

interface BlockPortalSecurityProps {
  enabled: boolean;
  isOwner: boolean;
  onEnabled: () => void;
}

async function getCentralSessionToken() {
  const { data: { session } } = await centralSupabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Sua sessão do Portal expirou. Entre novamente para configurar a 2FA.');
  }
  return session.access_token;
}

export const BlockPortalSecurity: React.FC<BlockPortalSecurityProps> = ({ enabled, isOwner, onEnabled }) => {
  const [loading, setLoading] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');

  const prepare = async () => {
    setLoading(true);
    setMessage('');
    try {
      const token = await getCentralSessionToken();
      const response = await fetch(getApiUrl('/api/auth?route=2fa&action=setup&target=central'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'setup', target: 'central' }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.qr_code_data_url) {
        throw new Error(payload?.error || 'Não foi possível preparar a 2FA do Portal.');
      }
      setQrCodeDataUrl(String(payload.qr_code_data_url));
      setCode('');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível preparar a 2FA do Portal.');
    } finally {
      setLoading(false);
    }
  };

  const enable = async () => {
    const normalizedCode = code.replace(/[^\d]/g, '');
    if (normalizedCode.length !== 6) {
      setMessage('Digite o código de 6 dígitos mostrado pelo seu aplicativo autenticador.');
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      const token = await getCentralSessionToken();
      const response = await fetch(getApiUrl('/api/auth?route=2fa&action=verify&target=central'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'verify', target: 'central', code: normalizedCode }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.totp_enabled) {
        throw new Error(payload?.error || 'O código 2FA não foi aceito.');
      }
      setQrCodeDataUrl('');
      setCode('');
      onEnabled();
    } catch (error: any) {
      setMessage(error?.message || 'O código 2FA não foi aceito.');
    } finally {
      setLoading(false);
    }
  };

  if (enabled) {
    return (
      <section className="rounded-[2rem] border border-emerald-400/20 bg-emerald-500/[0.07] p-6 text-left">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-emerald-400/15 p-3 text-emerald-300"><ShieldCheck className="h-6 w-6" /></div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">{isOwner ? 'Proteção do owner' : 'Proteção do Portal'}</p>
            <h2 className="mt-1 text-xl font-black text-white">2FA do Portal está ativa</h2>
            <p className="mt-2 text-sm leading-relaxed text-emerald-100/75">
              Novos logins por senha e operações destrutivas exigem seu aplicativo autenticador.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[2rem] border border-amber-400/25 bg-amber-500/[0.07] p-6 text-left">
      <div className="flex items-start gap-4">
        <div className="rounded-2xl bg-amber-400/15 p-3 text-amber-200"><AlertTriangle className="h-6 w-6" /></div>
        <div className="flex-1">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-200">{isOwner ? 'Ação obrigatória do owner' : 'Proteção recomendada'}</p>
          <h2 className="mt-1 text-xl font-black text-white">Proteja o Portal com 2FA</h2>
          <p className="mt-2 text-sm leading-relaxed text-amber-50/75">
            {isOwner
              ? 'Sem 2FA, uma sessão recuperada por e-mail poderia solicitar o reset da instalação. Ative agora para que essa ação passe a pedir seu código temporário.'
              : 'Ações como reset ou revogação da sua instalação pedem um código temporário. Ative agora para manter esse recurso disponível com proteção adicional.'}
          </p>
        </div>
      </div>

      {!qrCodeDataUrl ? (
        <button
          type="button"
          onClick={prepare}
          disabled={loading}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-amber-300 px-5 py-3 text-sm font-black text-black transition hover:bg-amber-200 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
          Configurar 2FA agora
        </button>
      ) : (
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-5">
          <p className="text-sm font-bold text-white">1. Escaneie este QR Code no Google Authenticator, Authy ou app equivalente.</p>
          <img className="mx-auto my-5 h-48 w-48 rounded-xl bg-white p-2" src={qrCodeDataUrl} alt="QR Code para configurar 2FA do Portal" />
          <label className="block text-xs font-black uppercase tracking-[0.16em] text-gray-300">2. Digite o código de 6 dígitos</label>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/[^\d]/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-center text-lg font-black tracking-[0.35em] text-white outline-none focus:border-amber-300"
          />
          <button
            type="button"
            onClick={enable}
            disabled={loading}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-black text-black transition hover:bg-emerald-300 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Confirmar e ativar 2FA
          </button>
        </div>
      )}

      {message && <p className="mt-4 text-sm font-medium text-red-200">{message}</p>}
    </section>
  );
};
