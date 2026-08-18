import React, { useRef, useState } from 'react';
import { AlertTriangle, Check, Loader2, ShieldCheck, Smartphone } from 'lucide-react';
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
  const [currentCode, setCurrentCode] = useState('');
  const [message, setMessage] = useState('');

  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

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
        body: JSON.stringify({ action: 'setup', target: 'central', current_code: currentCode }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.qr_code_data_url) {
        throw new Error(payload?.error || 'Não foi possível preparar a 2FA do Portal.');
      }
      setQrCodeDataUrl(String(payload.qr_code_data_url));
      setCode('');
      setCurrentCode('');
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

  const updateDigitAt = (currentStr: string, index: number, digit: string, setter: (val: string) => void) => {
    const cleanDigit = digit.replace(/[^\d]/g, '').slice(-1);
    const arr = (currentStr.padEnd(6, ' ')).split('');
    arr[index] = cleanDigit || ' ';
    const result = arr.join('').trimEnd();
    setter(result);

    if (cleanDigit && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDownAt = (currentStr: string, index: number, e: React.KeyboardEvent<HTMLInputElement>, setter: (val: string) => void) => {
    if (e.key === 'Backspace') {
      const digitPresent = Boolean(currentStr[index] && currentStr[index] !== ' ');
      if (!digitPresent && index > 0) {
        inputsRef.current[index - 1]?.focus();
      }
    }
  };

  // ESTADO JÁ ATIVADO
  if (enabled && !qrCodeDataUrl) {
    const currentDigits = currentCode.padEnd(6, ' ').split('');

    return (
      <article className="rounded-[2rem] border border-emerald-500/40 bg-[#0B1411] p-6 shadow-2xl relative overflow-hidden flex flex-col justify-between text-left space-y-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 shadow-md">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400">
                  {isOwner ? 'Proteção do owner' : 'Proteção do Portal'}
                </span>
                <h3 className="font-display text-xl font-black uppercase italic tracking-tight text-white">
                  2FA do Portal está ativa
                </h3>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-400">
              <Check className="h-3.5 w-3.5" /> PROTEGIDO
            </span>
          </div>

          <p className="text-xs text-gray-300 leading-relaxed font-medium">
            Novos logins por senha e operações destrutivas exigem seu aplicativo autenticador.
          </p>

          <div className="rounded-2xl border border-white/[0.08] bg-[#060B09] p-5 space-y-3 shadow-inner">
            <span className="block text-[9px] font-black uppercase tracking-widest text-emerald-400">
              CÓDIGO ATUAL DO AUTENTICADOR DO PORTAL (6 DÍGITOS)
            </span>

            <div className="flex items-center justify-between gap-2 pt-1 max-w-xs">
              {[0, 1, 2, 3, 4, 5].map((idx) => (
                <input
                  key={idx}
                  ref={(el) => (inputsRef.current[idx] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={currentDigits[idx]?.trim() || ''}
                  onChange={(e) => updateDigitAt(currentCode, idx, e.target.value, setCurrentCode)}
                  onKeyDown={(e) => handleKeyDownAt(currentCode, idx, e, setCurrentCode)}
                  placeholder="•"
                  className="w-11 h-12 rounded-xl border border-emerald-500/30 bg-[#0E1B15] text-center font-mono text-lg font-black text-white shadow-inner outline-none transition duration-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-white/[0.08]">
          <button
            type="button"
            onClick={prepare}
            disabled={loading || currentCode.replace(/[^\d]/g, '').length !== 6}
            className="inline-flex items-center gap-2.5 rounded-2xl border border-emerald-500/40 bg-emerald-500/20 hover:bg-emerald-500/30 px-6 py-3.5 text-xs font-black uppercase tracking-wider text-emerald-300 transition duration-200 disabled:opacity-40"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
            <span>Confirmar e trocar autenticador</span>
          </button>
        </div>

        {message && <p className="mt-2 text-xs font-bold text-red-300">{message}</p>}
      </article>
    );
  }

  // ESTADO DESATIVADO OU PREPARANDO SETUP
  const codeDigits = code.padEnd(6, ' ').split('');

  return (
    <article className="rounded-[2rem] border border-amber-500/30 bg-[#0F0D16] p-6 shadow-2xl relative overflow-hidden flex flex-col justify-between text-left space-y-6">
      <div className="space-y-6">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-400 shadow-md">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-400">
              {enabled ? 'Troca protegida de autenticador' : (isOwner ? 'Ação obrigatória do owner' : 'Proteção recomendada')}
            </span>
            <h3 className="font-display text-xl font-black uppercase italic tracking-tight text-white">
              {enabled ? 'Cadastre o novo autenticador' : 'Proteja o Portal com 2FA'}
            </h3>
          </div>
        </div>

        <p className="text-xs text-gray-300 leading-relaxed font-medium">
          {enabled
            ? 'A 2FA permanece obrigatória. Escaneie e confirme o novo QR Code nesta mesma tela; o código antigo deixa de valer quando o novo QR for preparado.'
            : isOwner
            ? 'Sem 2FA, uma sessão recuperada por e-mail poderia solicitar o reset da instalação. Ative agora para que essa ação passe a pedir seu código temporário.'
            : 'Ações como reset ou revogação da sua instalação pedem um código temporário. Ative agora para manter esse recurso disponível com proteção adicional.'}
        </p>

        {!qrCodeDataUrl ? (
          <div className="rounded-2xl border border-white/[0.08] bg-[#07060B] p-5 space-y-3 shadow-inner">
            <span className="block text-[9px] font-black uppercase tracking-widest text-amber-400/90">
              DIGITE O CÓDIGO DE 6 DÍGITOS PARA ATIVAR
            </span>

            <div className="flex items-center justify-between gap-2 pt-1 max-w-xs">
              {[0, 1, 2, 3, 4, 5].map((idx) => (
                <input
                  key={idx}
                  ref={(el) => (inputsRef.current[idx] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={codeDigits[idx]?.trim() || ''}
                  onChange={(e) => updateDigitAt(code, idx, e.target.value, setCode)}
                  onKeyDown={(e) => handleKeyDownAt(code, idx, e, setCode)}
                  placeholder="•"
                  className="w-11 h-12 rounded-xl border border-amber-500/30 bg-[#120E1C] text-center font-mono text-lg font-black text-amber-300 shadow-inner outline-none transition duration-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-[#07060B] p-5 space-y-4">
            <p className="text-xs font-bold text-white">1. Escaneie este QR Code no Google Authenticator, Authy ou app equivalente:</p>
            <img className="mx-auto my-3 h-44 w-44 rounded-xl bg-white p-2" src={qrCodeDataUrl} alt="QR Code para configurar 2FA do Portal" />
            <span className="block text-[9px] font-black uppercase tracking-widest text-amber-400">
              2. DIGITE O CÓDIGO DE 6 DÍGITOS GERADO NO APP
            </span>
            <div className="flex items-center justify-between gap-2 pt-1 max-w-xs mx-auto">
              {[0, 1, 2, 3, 4, 5].map((idx) => (
                <input
                  key={idx}
                  ref={(el) => (inputsRef.current[idx] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={codeDigits[idx]?.trim() || ''}
                  onChange={(e) => updateDigitAt(code, idx, e.target.value, setCode)}
                  onKeyDown={(e) => handleKeyDownAt(code, idx, e, setCode)}
                  placeholder="•"
                  className="w-11 h-12 rounded-xl border border-amber-500/30 bg-[#120E1C] text-center font-mono text-lg font-black text-amber-300 shadow-inner outline-none transition duration-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 pt-4 border-t border-white/[0.08]">
        {!qrCodeDataUrl ? (
          <button
            type="button"
            onClick={prepare}
            disabled={loading}
            className="inline-flex items-center gap-2.5 rounded-2xl border border-amber-400/50 bg-amber-400 hover:bg-amber-300 px-6 py-3.5 text-xs font-black uppercase tracking-wider text-black shadow-xl shadow-amber-950/40 transition duration-200 active:scale-95 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
            <span>Configurar 2FA agora</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={enable}
            disabled={loading || code.replace(/[^\d]/g, '').length !== 6}
            className="inline-flex items-center gap-2.5 rounded-2xl border border-emerald-400/50 bg-emerald-400 hover:bg-emerald-300 px-6 py-3.5 text-xs font-black uppercase tracking-wider text-black shadow-xl shadow-emerald-950/40 transition duration-200 active:scale-95 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            <span>Confirmar e ativar 2FA</span>
          </button>
        )}
      </div>

      {message && <p className="mt-2 text-xs font-bold text-red-300">{message}</p>}
    </article>
  );
};

export default BlockPortalSecurity;
