import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, Loader2, AlertCircle, User, ArrowRight, CheckCircle, ShieldCheck, Coins, Check } from 'lucide-react';
import { memberService } from '../services/memberService';
import { useInstallation } from '../context/InstallationContext';
import { useTranslation } from 'react-i18next';
import { getEnv } from '../utils/env';
import { getApiUrl } from '../utils/apiUtils';

export const Login = () => {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'recovery' | 'two_factor'>('login');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');

  // Manual Setup State
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [setupErrorReason, setSetupErrorReason] = useState<'keys_missing' | 'sql_missing' | 'connection'>('connection');
  const [setupErrorMessage, setSetupErrorMessage] = useState<string>('');
  const [manualUrl, setManualUrl] = useState('');
  const [manualKey, setManualKey] = useState('');

  // Use Context
  const { installationId, loading: instLoading, setInstallationId } = useInstallation();

  const completeSuccessfulLogin = async (loginData: any) => {
    const user = loginData.user;
    if (!user) throw new Error('Login falhou: usuário não encontrado.');

    if (loginData.session) {
      await supabase.auth.setSession({
        access_token: loginData.session.access_token,
        refresh_token: loginData.session.refresh_token,
      });
    }

    memberService.updateLastSeen(user.id).catch(console.error);
    memberService.logActivity(user.id, 'login', { method: 'password' }).catch(console.error);

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!profile) {
      console.error('❌ Access Denied: Profile not found.');
      await supabase.auth.signOut();
      throw new Error('Perfil de usuário não encontrado.');
    }

    if (profile.installation_id !== installationId || !installationId) {
      console.log('🔍 Mismatch Debug:', {
        profileId: profile.installation_id,
        contextId: installationId,
        role: profile.role,
        isAdmin: profile.role === 'admin',
        isOwner: profile.role === 'owner'
      });
    }

    const profileBusinessId = (profile as any).installations?.installation_id;
    if (profileBusinessId && (profileBusinessId !== installationId || !installationId)) {
      const canHeal = profile.role === 'admin' || profile.role === 'owner';
      if (canHeal) {
        console.warn('⚠️ Admin Installation Mismatch/Missing Detected. Auto-healing...');
        console.log(`Setting Authoritative Installation ID to [${profileBusinessId}]`);

        localStorage.setItem('installation_id', profileBusinessId);
        localStorage.setItem('license_usage_type', 'commercial');

        if (installationId === profileBusinessId) {
          console.log('✅ ID already matches, proceeding without reload.');
          navigate('/admin');
          return;
        }

        if (profile.role === 'owner') {
          console.log('🔑 Owner detected: Skipping reload healing to prevent loop.');
          navigate('/admin');
          return;
        }

        window.location.reload();
        return;
      }

      console.error('❌ Access Denied: User belongs to another installation.',
        { userInst: profile.installation_id, currentInst: installationId });
      await supabase.auth.signOut();
      throw new Error('Este usuário não pertence a esta instalação.');
    }

    if (profile?.role === 'admin' || profile?.role === 'owner') {
      localStorage.setItem('license_usage_type', 'commercial');
      navigate('/admin');
    } else {
      navigate('/admin');
    }
  };

  const handleManualSetup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualUrl || !manualKey) return;

    // Save to LocalStorage to override environment variables
    localStorage.setItem('installer_supabase_url', manualUrl);
    localStorage.setItem('installer_supabase_anon_key', manualKey);

    // Clean URL
    const finalUrl = manualUrl.replace(/\/$/, '');
    localStorage.setItem('installer_supabase_url', finalUrl);

    window.location.reload();
  };

  // Check if initial setup is required
  useEffect(() => {
    if (instLoading) return; // Wait for context

    const checkSetup = async () => {
      if (!installationId) {
        console.warn('[Login] No installation ID available yet. Waiting for Guard or Setup.');
        return;
      }

      // FIX: Legacy master-override string caused UUID syntax error in Postgres
      if (installationId === 'master-override') {
        console.warn('⚠️ Legacy installation ID detected. Auto-fixing...');
        setInstallationId('00000000-0000-0000-0000-000000000000');
        return;
      }

      const { data, error } = await supabase.rpc('is_setup_required', {
        target_installation_id: installationId
      });

      console.log('[Login] Setup check result:', { data, error });

        if (error) {
          console.error('[Login] Error checking setup:', error);
          setSetupErrorMessage(error.message || JSON.stringify(error));
  
          // ANALYZE FAILURE REASON
        const hasKeys = !!getEnv('VITE_SUPABASE_URL');

        if (!hasKeys) {
          console.warn('⚠️ No keys found. Redirecting to Installer.');
          navigate('/installer');
          return;
        } else {
          // We have keys. Did the function fail?
          if (error.message && (error.message.includes('function') || error.message.includes('fail') || error.message.includes('exist'))) {
            console.warn('⚠️ Keys present but SQL function missing.');
            setSetupErrorReason('sql_missing');
          } else {
            console.warn('⚠️ Connection failed (Network/Auth).');
            setSetupErrorReason('connection');
          }
        }
        setShowSetupModal(true);
        return;
      }

      if (data === true) {
        console.log('[Login] Setup required. Redirecting...');
        navigate('/setup');
      } else {
        console.log('[Login] Setup not required.');
      }
    };
    checkSetup();
  }, [instLoading, installationId]); // Depend on installationId

  // Form Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (mode === 'two_factor') {
        if (!twoFactorToken) throw new Error('Sessão de validação expirada. Faça login novamente.');

        const verifyResponse = await fetch(getApiUrl('/api/auth/2fa?action=verify'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: twoFactorCode, challenge_token: twoFactorToken }),
        });

        const verifyData = await verifyResponse.json().catch(() => ({}));
        if (!verifyResponse.ok) {
          throw new Error(verifyData.error || 'Não foi possível validar o código.');
        }

        await completeSuccessfulLogin(verifyData);
        return;
      }

      if (mode === 'login') {
        // Fase 15.3 — Rate-limited login via Vercel Serverless proxy
        const loginResponse = await fetch(getApiUrl('/api/auth/login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, target: 'local' }),
        });

        const contentType = loginResponse.headers.get('content-type') || '';
        let loginData: any = {};

        if (contentType.includes('application/json')) {
          loginData = await loginResponse.json().catch(() => ({}));
        } else {
          const rawBody = await loginResponse.text().catch(() => '');
          throw new Error(
            rawBody.trim()
              ? `Backend de login respondeu algo inesperado: ${rawBody.slice(0, 160)}`
              : 'Backend de login indisponível no ambiente local. Use npm run vercel ou um deploy para testar o login.'
          );
        }

        if (!loginResponse.ok) {
          if (loginResponse.status === 429) {
            throw new Error(loginData.error || 'Muitas tentativas de login. Tente novamente mais tarde.');
          }
          throw new Error(loginData.error || 'Erro ao fazer login.');
        }

        if (loginData.requires_two_factor) {
          setTwoFactorToken(loginData.two_factor_token || '');
          setTwoFactorCode('');
          setPassword('');
          setMode('two_factor');
          setSuccess('Autenticação em duas etapas exigida. Digite o código do seu app autenticador.');
          return;
        }

        // Inject the session from the proxy into the local Supabase client
        if (loginData.session) {
          await supabase.auth.setSession({
            access_token: loginData.session.access_token,
            refresh_token: loginData.session.refresh_token,
          });
        }

        const user = loginData.user;
        if (!user) throw new Error('Login falhou: usuário não encontrado.');

        if (user) {
          // Update last seen & log activity (Fire & Forget)
          memberService.updateLastSeen(user.id).catch(console.error);
          memberService.logActivity(user.id, 'login', { method: 'password' }).catch(console.error);

          // Fetch Profile to check role
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();


          // CRITICAL: Strict Isolation Check & Auto-Healing for Admins
          if (profile) {

            // Debug Logs
            if (profile.installation_id !== installationId || !installationId) {
              console.log('🔍 Mismatch Debug:', {
                profileId: profile.installation_id,
                contextId: installationId,
                role: profile.role,
                isAdmin: profile.role === 'admin',
                isOwner: profile.role === 'owner'
              });
            }

            // FIX: If admin has explicit installation_id but context is different (or missing),
            // TRUST THE DB PROFILE for Admins and auto-fix the browser context.
            // FIX: Compare with the joined Business ID, not the internal record PK
            const profileBusinessId = (profile as any).installations?.installation_id;

            if (profileBusinessId && (profileBusinessId !== installationId || !installationId)) {

              // Allow 'admin' or 'owner' to auto-heal
              const canHeal = profile.role === 'admin' || profile.role === 'owner';

              if (canHeal) {
                console.warn('⚠️ Admin Installation Mismatch/Missing Detected. Auto-healing...');
                console.log(`Setting Authoritative Installation ID to [${profileBusinessId}]`);

                // Heal LocalStorage
                localStorage.setItem('installation_id', profileBusinessId);
                localStorage.setItem('license_usage_type', 'commercial');

                // Important: Verify if we are already on the correct ID to avoid infinite reloads
                if (installationId === profileBusinessId) {
                  console.log('✅ ID already matches, proceeding without reload.');
                  navigate('/admin');
                  return;
                }

                // If owner, DO NOT RELOAD, just navigate to admin to break the loop
                if (profile.role === 'owner') {
                   console.log('🔓 Owner detected: Skipping reload healing to prevent loop.');
                   navigate('/admin');
                   return;
                }

                // Force Reload to pick up new Context
                window.location.reload();
                return;
              }

              // Non-admin users are strictly blocked
              console.error('❌ Access Denied: User belongs to another installation.',
                { userInst: profile.installation_id, currentInst: installationId });
              await supabase.auth.signOut();
              throw new Error('Este usuário não pertence a esta instalação.');
            }
          } else {
            // Profile missing? This is bad if we expect strictness.
            console.error('❌ Access Denied: Profile not found.');
            await supabase.auth.signOut();
            throw new Error('Perfil de usuário não encontrado.');
          }

          if (profile?.role === 'admin' || profile?.role === 'owner') {
            // Guarantee admin access rights in local storage
            localStorage.setItem('license_usage_type', 'commercial');
            navigate('/admin');
          } else {
            // Member login at root? Try to find where to go or show message
            // Ideally we find their first accessible member area
            // For now, redirect to a generic page or just show success and tell them to use their link
            // But wait, if they have a link /app/teste, they should be logging in THERE (MemberLogin.tsx).
            // If they log in here, they might be confused.
            // Let's redirect to a "Hub" or just "app" and let App.tsx handle it?
            // App.tsx has no generic /app route.
            // Let's redirect to /admin so the AdminRoute showing "Access Denied" does its job explaining "Use your link".
            // This is the safest "quick fix" that aligns with the user's request "User could not access admin".
            // The AdminRoute page has the text: "Se você é um aluno/membro, por favor utilize o link de acesso enviado para seu e-mail."
            navigate('/admin');
          }
        }
      } else if (mode === 'recovery') {
        if (!installationId) {
          setError('Instalação não identificada. Acesse pelo link correto.');
          return;
        }

        // SECURE: Call Edge Function instead of direct Auth API
        const { error: fnError } = await supabase.functions.invoke('request-password-reset', {
          body: {
            email,
            installation_id: installationId,
            redirect_url: window.location.origin + '/update-password'
          }
        });

        if (fnError) throw fnError;

        // Always show success (UX + Security)
        setSuccess(t('login.recovery_success_msg'));
      }
    } catch (err: any) {
      console.error(err);
      setError(translateAuthError(err.message));
    } finally {
      setLoading(false);
    }
  };

  const translateAuthError = (msg: string) => {
    if (!msg) return t('common:error');
    const m = msg.toLowerCase();
    if (m.includes('invalid login credentials')) return t('login.invalid_credentials');
    if (m.includes('email not confirmed')) return t('login.email_not_confirmed');
    if (m.includes('user not found')) return t('login.user_not_found');
    if (m.includes('too many requests')) return t('login.too_many_requests');
    if (m.includes('two-factor') || m.includes('totp')) return 'O código informado não é válido.';
    return t('login.generic_error', { error: msg });
  };

  return (
    <div className="min-h-screen flex bg-[#05050A] text-white font-sans relative">

      {/* CONNECTION SETUP MODAL */}
      {showSetupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#0A0A12] border border-red-500/30 w-full max-w-md p-8 rounded-2xl shadow-2xl relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-orange-500"></div>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">
                  {setupErrorReason === 'sql_missing' ? 'Banco de Dados Incompleto' : 'Falha na Conexão'}
                </h3>
                <p className="text-sm text-gray-400">
                  {setupErrorReason === 'sql_missing' ? 'A instalação não criou as tabelas necessárias.' : 'Não foi possível conectar ao banco de dados.'}
                </p>
              </div>
            </div>

            <p className="text-gray-300 text-sm mb-6 leading-relaxed">
              {setupErrorReason === 'keys_missing' && "O aplicativo não encontrou as chaves de conexão. Isso pode acontecer se o deploy na Vercel não recebeu as variáveis de ambiente."}
              {setupErrorReason === 'connection' && "Verifique se suas chaves do Supabase estão corretas e se o projeto está ativo."}
              {setupErrorReason === 'sql_missing' && (
                <>
                  Parece que você <b>pulou a etapa de Migração</b> no instalador, ou ela falhou.<br /><br />
                  O sistema conectou, mas não encontrou as funções do banco. Execute o SQL de instalação ou reinstale o sistema.
                </>
              )}
            </p>

            {setupErrorMessage && (
              <div className="mb-6 p-3 bg-red-500/5 border border-red-500/10 rounded-lg">
                <p className="text-[10px] text-red-400 uppercase font-bold mb-1">Erro do Sistema:</p>
                <p className="text-xs text-gray-500 font-mono break-all">{setupErrorMessage}</p>
              </div>
            )}

            {setupErrorReason !== 'sql_missing' && (
              <>
                <p className="text-xs text-gray-500 mb-4 uppercase font-bold">Solução Manual (Reconectar)</p>
                <form onSubmit={handleManualSetup} className="space-y-4">
                  <div>
                    <input
                      type="text"
                      placeholder="Project URL (https://...)"
                      value={manualUrl}
                      onChange={e => setManualUrl(e.target.value)}
                      required
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:border-red-500/50 outline-none"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Anon Public Key"
                      value={manualKey}
                      onChange={e => setManualKey(e.target.value)}
                      required
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:border-red-500/50 outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 mt-2"
                  >
                    Salvar e Reconectar
                  </button>
                </form>
              </>
            )}

            {setupErrorReason === 'sql_missing' && (
              <button
                onClick={() => navigate('/installer')}
                className="w-full bg-[#3ECF8E] hover:bg-[#3ECF8E]/90 text-black font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 mt-2"
              >
                {t('common:back_to_installer')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Left Side - Visual & Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-[#0A0A12] items-center justify-center p-12">
        {/* Abstract Background Elements */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
          <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-primary/20 rounded-full blur-[120px] animate-pulse-slow"></div>
          <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-purple-900/20 rounded-full blur-[100px] animate-pulse-slow delay-1000"></div>
        </div>

        <div className="relative z-10 max-w-2xl px-8 text-center lg:text-left">
          <h1 className="text-[6rem] leading-[0.85] font-black italic tracking-tighter uppercase relative select-none">
            <span className="block text-white transform -skew-x-6 drop-shadow-2xl">
              Super
            </span>
            <span className="block text-white transform -skew-x-6 drop-shadow-2xl pl-2">
              Checkout
            </span>
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-[#8257E5] to-purple-400 transform -skew-x-6 drop-shadow-2xl pl-1">
              .App
            </span>
          </h1>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 lg:p-12 relative">
        {/* Mobile Background Blob */}
        <div className="absolute top-0 right-0 w-full h-full overflow-hidden z-0 lg:hidden pointer-events-none">
          <div className="absolute top-[-10%] right-[-10%] w-[80%] h-[50%] bg-primary/10 rounded-full blur-[80px]"></div>
        </div>

        <div className="w-full max-w-md relative z-10">
          <div className="text-center mb-8">
            <img src="/logo.png" alt="Super Checkout" className="h-12 mx-auto mb-6" />
            <h2 className="text-4xl font-bold mb-2">
              {t('auth:login.access_infra')}
            </h2>
            <p className="text-gray-400">
              {mode === 'login' && t('auth:login.manage_freedom')}
              {mode === 'recovery' && t('auth:login.recovery_desc')}
              {mode === 'two_factor' && 'Digite o código de 6 dígitos do seu app autenticador.'}
            </p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl mb-6 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {success && (
            <div className="bg-green-500/10 border border-green-500/20 text-green-400 p-4 rounded-xl mb-6 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
              <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span className="text-sm">{success}</span>
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-5">



            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-300 ml-1">{t('auth:login.email')}</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary transition-colors" />
                <input
                  type="email"
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3.5 text-white outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all placeholder:text-gray-600"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
            </div>

            {mode === 'login' && (
              <div className="space-y-1.5">
                <div className="flex justify-between items-center ml-1">
                  <label className="text-sm font-medium text-gray-300">{t('auth:login.password')}</label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => { setMode('recovery'); setError(null); setSuccess(null); }}
                      className="text-xs text-primary hover:text-primary-light transition-colors"
                    >
                      {t('auth:login.forgot_password')}
                    </button>
                  )}
                </div>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary transition-colors" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3.5 text-white outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all placeholder:text-gray-600"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                </div>
              </div>
            )}

            {mode === 'two_factor' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between ml-1">
                  <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    Código de 2FA
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setTwoFactorToken('');
                      setTwoFactorCode('');
                      setPassword('');
                      setError(null);
                      setSuccess(null);
                    }}
                    className="text-xs text-primary hover:text-primary-light transition-colors"
                  >
                    Voltar
                  </button>
                </div>
                <div className="relative group">
                  <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary transition-colors" />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3.5 text-white outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all placeholder:text-gray-600 tracking-[0.2em]"
                    placeholder="123456"
                    value={twoFactorCode}
                    onChange={e => setTwoFactorCode(e.target.value)}
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-primary to-purple-600 hover:from-primary-hover hover:to-purple-700 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-primary/25 hover:shadow-primary/40 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed mt-4 group"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  {mode === 'login' && t('auth:login.sign_in_button')}
                  {mode === 'recovery' && t('auth:login.send_recovery_button')}
                  {mode === 'two_factor' && 'Verificar Código'}
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 text-center py-2">
            {mode === 'recovery' && (
              <button
                onClick={() => { setMode('login'); setError(null); setSuccess(null); }}
                className="text-gray-400 hover:text-white transition-colors flex items-center justify-center gap-2 mx-auto mb-4"
              >
                {t('auth:login.back_to_login')}
              </button>
            )}
            <p className="text-[10px] text-gray-700 font-mono">v0.0.11</p>
          </div>
        </div>
      </div>
    </div>
  );
};
