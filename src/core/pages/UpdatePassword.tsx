import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { centralSupabase } from '../services/centralClient';
import { useNavigate } from 'react-router-dom';
import { Lock, Loader2, AlertCircle, CheckCircle, ArrowRight } from 'lucide-react';
import { logSecurityEvent } from '../services/securityAuditClient';

export const UpdatePassword = () => {
    const navigate = useNavigate();
    const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const isCentralRecovery = searchParams.get('scope') === 'central';
    const nextPath = searchParams.get('next') || (isCentralRecovery ? '/activate/setup' : '/admin');
    const authClient = isCentralRecovery ? centralSupabase : supabase;
    const [loading, setLoading] = useState(false);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        // Check if we have a session (user clicked magic link)
        authClient.auth.getSession().then(({ data: { session } }) => {
            if (!session) {
                navigate(isCentralRecovery ? '/activate' : '/login');
            }
        });
    }, [authClient, isCentralRecovery, navigate]);

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            setError('As senhas não coincidem');
            return;
        }

        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const { error } = await authClient.auth.updateUser({
                password: password
            });

            if (error) throw error;

            await logSecurityEvent('password_changed', { flow: 'recovery' }, 'INFO');
            setSuccess('Senha atualizada com sucesso! Redirecionando...');
            setTimeout(() => {
                navigate(nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/admin');
            }, 2000);
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Erro ao atualizar senha.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#05050A] text-white p-4 font-sans">
            <div className="w-full max-w-md">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl">
                    <div className="text-center mb-8">
                        <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center mx-auto mb-4">
                            <Lock className="w-6 h-6 text-primary" />
                        </div>
                        <h2 className="text-xl font-bold mb-2">Definir Nova Senha</h2>
                        <p className="text-gray-400 text-sm">
                            Digite sua nova senha abaixo para recuperar o acesso à sua conta.
                        </p>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg mb-6 text-sm flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" /> {error}
                        </div>
                    )}

                    {success && (
                        <div className="bg-green-500/10 border border-green-500/20 text-green-400 p-3 rounded-lg mb-6 text-sm flex items-center gap-2">
                            <CheckCircle className="w-4 h-4" /> {success}
                        </div>
                    )}

                    <form onSubmit={handleUpdate} className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-300 ml-1">Nova Senha</label>
                            <div className="relative group">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary transition-colors" />
                                <input
                                    type="password"
                                    required
                                    minLength={6}
                                    className="w-full bg-black/20 border border-white/10 rounded-xl pl-12 pr-4 py-3.5 text-white outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all placeholder:text-gray-600"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-300 ml-1">Confirmar Senha</label>
                            <div className="relative group">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary transition-colors" />
                                <input
                                    type="password"
                                    required
                                    minLength={6}
                                    className="w-full bg-black/20 border border-white/10 rounded-xl pl-12 pr-4 py-3.5 text-white outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all placeholder:text-gray-600"
                                    placeholder="••••••••"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-primary hover:bg-primary-hover text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                                <>
                                    Atualizar Senha
                                    <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};
