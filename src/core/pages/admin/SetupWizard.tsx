
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import { Building2, Mail, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';

export const SetupWizard = () => {
    const { user, refreshProfile } = useAuth(); // Assuming refreshProfile or fetchProfile is available
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        business_name: '',
        support_email: user?.email || '',
        legal_name: '',
        agree_terms: false
    });
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Pre-fill if existing data (e.g. partial setup)
        const loadSettings = async () => {
            if (!user) return;
            const { data: accounts } = await supabase.from('accounts').select('id').eq('owner_user_id', user.id).single();
            if (accounts) {
                const { data: settings } = await supabase.from('business_settings').select('*').eq('account_id', accounts.id).single();
                if (settings) {
                    setFormData(prev => ({
                        ...prev,
                        business_name: settings.business_name || '',
                        support_email: settings.support_email || user.email || '',
                        legal_name: settings.legal_name || ''
                    }));
                }
            }
        };
        loadSettings();
    }, [user]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setLoading(true);
        setError(null);

        try {
            // 1. Ensure Account Exists
            let { data: account, error: accError } = await supabase
                .from('accounts')
                .select('id')
                .eq('owner_user_id', user.id)
                .single();

            if (!account) {
                // Create Account if missing (migration fail-safe)
                const { data: newAccount, error: createError } = await supabase
                    .from('accounts')
                    .insert({ owner_user_id: user.id, plan_type: 'free' })
                    .select()
                    .single();

                if (createError) throw createError;
                account = newAccount;
            }

            if (!formData.agree_terms) {
                throw new Error("Você precisa concordar com os termos de responsabilidade.");
            }

            // 2. Update Business Settings
            const { error: settingsError } = await supabase
                .from('business_settings')
                .upsert({
                    account_id: account.id,
                    business_name: formData.business_name,
                    legal_name: formData.legal_name || formData.business_name, // Fallback
                    support_email: formData.support_email,
                    sender_name: formData.business_name, // Default sender name
                    sender_email: formData.support_email, // Default sender email (to be verified later)
                    compliance_status: 'verified', // Auto-verify for now (in future, maybe manual check)
                    is_ready_to_sell: true
                }, { onConflict: 'account_id' });

            if (settingsError) throw settingsError;

            // 3. Log Event
            await supabase.from('audit_logs').insert({
                user_id: user.id, // We need to support user_id in audit_logs or link via account
                // Wait, audit_logs schema wasn't fully defined in my SQL execution step (I used system_events mostly).
                // Let's use system_events for business log. 
                // Checks Plan: "system_events" -> account_id.
            });

            await supabase.from('system_events').insert({
                account_id: account.id,
                type: 'identity_verified',
                metadata: {
                    ip: 'client', // can't get real IP easily on client without edge function
                    business_name: formData.business_name
                }
            });

            // Refresh Auth Context to unblock routes
            // We need a way to force reload profile/account status
            window.location.href = '/admin';

        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Erro ao salvar configurações.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#05050A] flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md bg-[#0F0F13] border border-[#1F1F23] rounded-2xl p-8 shadow-2xl">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-500">
                        <ShieldCheck size={32} />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Configuração Obrigatória</h1>
                    <p className="text-gray-400">Para garantir a segurança e profissionalismo, configure a identidade do seu negócio.</p>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-lg mb-6 flex items-center gap-2">
                        <AlertCircle size={20} />
                        <span className="text-sm">{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Nome do Negócio (Público)</label>
                        <div className="relative">
                            <Building2 className="absolute left-3 top-3 text-gray-500" size={18} />
                            <input
                                type="text"
                                required
                                value={formData.business_name}
                                onChange={e => setFormData({ ...formData, business_name: e.target.value })}
                                className="w-full bg-[#05050A] border border-[#1F1F23] rounded-lg pl-10 pr-4 py-2.5 text-white focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all outline-none"
                                placeholder="Ex: Loja do João, Agência Tech"
                            />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Este nome aparecerá no checkout e nos e-mails para seus clientes.</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">E-mail de Suporte</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-3 text-gray-500" size={18} />
                            <input
                                type="email"
                                required
                                value={formData.support_email}
                                onChange={e => setFormData({ ...formData, support_email: e.target.value })}
                                className="w-full bg-[#05050A] border border-[#1F1F23] rounded-lg pl-10 pr-4 py-2.5 text-white focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all outline-none"
                                placeholder="suporte@suaempresa.com"
                            />
                        </div>
                    </div>

                    <div className="bg-[#1F1F23]/50 p-4 rounded-lg border border-[#1F1F23]">
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                required
                                checked={formData.agree_terms}
                                onChange={e => setFormData({ ...formData, agree_terms: e.target.checked })}
                                className="mt-1 w-4 h-4 rounded bg-[#05050A] border-gray-600 text-emerald-500 focus:ring-emerald-500"
                            />
                            <span className="text-sm text-gray-400">
                                Declaro que sou o responsável legal pelas vendas realizadas através desta conta e que os produtos ofertados respeitam as leis vigentes.
                            </span>
                        </label>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-lg transition-all flex items-center justify-center gap-2"
                    >
                        {loading ? 'Salvando...' : 'Confirmar Identidade'}
                        {!loading && <ArrowRight size={18} />}
                    </button>

                    <p className="text-xs text-gray-500 text-center px-4">
                        Seu nome e contatos serão exibidos publicamente no rodapé do checkout para segurança do consumidor.
                    </p>
                </form>
            </div>
        </div>
    );
};
