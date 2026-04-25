import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { storage } from '../../services/storageService';
import { MemberArea } from '../../types';
import { Button } from '../../components/ui/Button';
import { Lock, ArrowRight, Mail, User } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { getApiUrl } from '../../utils/apiUtils';

export const MemberLogin = ({ forcedSlug }: { forcedSlug?: string }) => {
    const { slug: paramSlug } = useParams<{ slug: string }>();
    const slug = forcedSlug || paramSlug;
    const navigate = useNavigate();
    const [memberArea, setMemberArea] = useState<MemberArea | null>(null);
    const [loading, setLoading] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loggingIn, setLoggingIn] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (slug) {
            loadMemberArea(slug);
        }
    }, [slug]);

    const loadMemberArea = async (slug: string) => {
        try {
            const area = await storage.getMemberAreaBySlug(slug);
            if (area) {
                setMemberArea(area);
            } else {
                navigate('/app'); // Not found
            }
        } catch (error) {
            console.error('Error loading member area:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoggingIn(true);
        setError('');

        try {
            // Fase 15.3 — Rate-limited login via Vercel Serverless proxy
            const loginResponse = await fetch(getApiUrl('/api/auth/login'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, target: 'local' }),
            });

            const loginData = await loginResponse.json();

            if (!loginResponse.ok) {
                if (loginResponse.status === 429) {
                    const mins = Math.ceil((loginData.retryAfterSec || 900) / 60);
                    throw new Error(`Muitas tentativas. Tente em ${mins} minutos.`);
                }
                throw new Error(loginData.error || 'Email ou senha incorretos.');
            }

            // Inject session into local Supabase client
            if (loginData.session) {
                await supabase.auth.setSession({
                    access_token: loginData.session.access_token,
                    refresh_token: loginData.session.refresh_token,
                });
            }

            if (loginData.user) {
                navigate(`/app/${slug}`);
            }
        } catch (error: any) {
            console.error('Login error:', error);
            setError(error.message || 'Email ou senha incorretos.');
        } finally {
            setLoggingIn(false);
        }
    };

    if (loading) {
        return <div className="min-h-screen bg-black flex items-center justify-center text-white">Carregando...</div>;
    }

    if (!memberArea) return null;

    const primaryColor = memberArea.primary_color || '#E50914';

    return (
        <div className="min-h-screen flex bg-[#141414] text-white">
            {/* Left Side - Image */}
            <div className="hidden lg:block w-1/2 relative overflow-hidden">
                {memberArea.login_image_url ? (
                    <img
                        src={memberArea.login_image_url}
                        alt="Login Background"
                        className="absolute inset-0 w-full h-full object-cover"
                    />
                ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-black" />
                )}
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />

                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-12">
                    {memberArea.logo_url && (
                        <img src={memberArea.logo_url} alt={memberArea.name} className="h-24 object-contain mb-8 drop-shadow-2xl" />
                    )}
                    <h1 className="text-4xl font-bold mb-4 drop-shadow-lg">{memberArea.name}</h1>
                    <p className="text-xl text-gray-200 max-w-md drop-shadow-md">
                        Acesse sua conta para continuar aprendendo.
                    </p>
                </div>
            </div>

            {/* Right Side - Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
                <div className="w-full max-w-md space-y-8">
                    <div className="text-center lg:hidden mb-8">
                        {memberArea.logo_url && (
                            <img src={memberArea.logo_url} alt={memberArea.name} className="h-16 object-contain mx-auto mb-4" />
                        )}
                        <h1 className="text-2xl font-bold">{memberArea.name}</h1>
                    </div>

                    <div>
                        <h2 className="text-3xl font-bold mb-2">Bem-vindo de volta</h2>
                        <p className="text-gray-400">Entre com suas credenciais para acessar.</p>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-xl text-sm">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleLogin} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                    placeholder="seu@email.com"
                                    style={{ '--tw-ring-color': primaryColor } as any}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Senha</label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                    placeholder="••••••••"
                                    style={{ '--tw-ring-color': primaryColor } as any}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loggingIn}
                            className="w-full py-4 rounded-xl font-bold text-white shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                            style={{ backgroundColor: primaryColor }}
                        >
                            {loggingIn ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    Entrar <ArrowRight className="w-5 h-5" />
                                </>
                            )}
                        </button>
                    </form>

                    {/* Public Signup Disabled by strict architecture rules
                    {memberArea.allow_free_signup !== false && (
                        <div className="text-center pt-4 border-t border-white/10">
                            <p className="text-gray-400 mb-4">Ainda não tem uma conta?</p>
                            <Link
                                to={`/app/${slug}/signup`}
                                className="inline-flex items-center gap-2 text-white hover:underline transition-all"
                                style={{ color: primaryColor }}
                            >
                                Criar conta gratuita
                            </Link>
                        </div>
                    )}
                    */}
                </div>
            </div>
        </div>
    );
};
