import React, { useState, useEffect } from 'react';
import { Outlet, useParams, useNavigate } from 'react-router-dom';
import { MemberAreaLayout } from './MemberAreaLayout';
import { storage } from '../../services/storageService';
import { MemberArea } from '../../types';
import { Loader2 } from 'lucide-react';

export const MemberAreaWrapper = ({ forcedSlug }: { forcedSlug?: string }) => {
    const { slug: paramSlug } = useParams<{ slug: string }>();
    const slug = forcedSlug || paramSlug;
    const navigate = useNavigate();
    const [memberArea, setMemberArea] = useState<MemberArea | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadMemberArea = async () => {
            console.log('[Wrapper] Loading Member Area for slug:', slug);

            const params = new URLSearchParams(window.location.search);
            const loginToken = params.get('login_token');
            const authToken = params.get('auth_token');
            const authEmail = params.get('auth_email');

            // NEW: Server-side auto-login (login_token from purchase emails)
            if (loginToken) {
                console.log('[Wrapper] Found login_token, authenticating via server...');
                try {
                    const res = await fetch(`/api/system?action=auto-login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token: loginToken }),
                    });

                    if (res.ok) {
                        const { access_token, refresh_token } = await res.json();
                        if (access_token && refresh_token) {
                            const { supabase } = await import('../../services/supabase');
                            await supabase.auth.setSession({ access_token, refresh_token });
                            console.log('[Wrapper] Server-side auto-login successful');
                        }
                    } else {
                        const err = await res.json().catch(() => ({}));
                        console.error('[Wrapper] Auto-login failed:', err);
                    }

                    params.delete('login_token');
                    const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash;
                    window.history.replaceState({}, document.title, newUrl);
                } catch (e) {
                    console.error('[Wrapper] Auto-login error:', e);
                }
            }
            // LEGACY FALLBACK: auth_token from older emails
            else if (authToken && authEmail) {
                console.log('[Wrapper] Found legacy auth_token, verifying...');
                try {
                    const { supabase } = await import('../../services/supabase');
                    const { data, error } = await supabase.auth.verifyOtp({
                        token_hash: authToken,
                        type: 'email' as any,
                    });

                    if (error) throw error;
                    if (!data?.session) throw new Error('Token verified but no session returned.');

                    params.delete('auth_token');
                    params.delete('auth_email');
                    const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash;
                    window.history.replaceState({}, document.title, newUrl);
                    console.log('[Wrapper] Legacy auth successful');
                } catch (e) {
                    console.error('[Wrapper] Legacy auth failed:', e);
                }
            }
            if (!slug) return;
            try {
                const area = await storage.getMemberAreaBySlug(slug);
                console.log('[Wrapper] Found area:', area);
                if (area) {
                    setMemberArea(area);
                } else {
                    console.error('[Wrapper] Member Area not found for slug:', slug);
                    navigate('/app'); // Redirect if not found
                }
            } catch (error) {
                console.error('[Wrapper] Error loading member area:', error);
            } finally {
                setLoading(false);
            }
        };

        loadMemberArea();
    }, [slug, navigate]);

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0E1012] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-red-600" />
            </div>
        );
    }

    return (
        <MemberAreaLayout memberArea={memberArea}>
            <Outlet context={{ memberArea }} />
        </MemberAreaLayout>
    );
};
