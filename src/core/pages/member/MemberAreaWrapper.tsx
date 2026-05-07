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
            const authToken = params.get('auth_token');
            const authEmail = params.get('auth_email');
            
            if (authToken && authEmail) {
                console.log('[Wrapper] Found custom auth token, verifying...');
                try {
                    const { supabase } = await import('../../services/supabase');
                    const { data, error } = await supabase.auth.verifyOtp({
                        email: authEmail,
                        token_hash: authToken,
                        type: 'magiclink'
                    });

                    if (error) {
                        console.warn('[Wrapper] magiclink verification failed, retrying as email token:', error.message);
                        const retry = await supabase.auth.verifyOtp({
                            email: authEmail,
                            token_hash: authToken,
                            type: 'email' as any
                        });
                        if (retry.error) throw retry.error;
                        if (!retry.data?.session) throw new Error('Magic link verified without session.');
                    } else if (!data?.session) {
                        throw new Error('Magic link verified without session.');
                    }
                    
                    params.delete('auth_token');
                    params.delete('auth_email');
                    const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash;
                    window.history.replaceState({}, document.title, newUrl);
                    console.log('[Wrapper] Custom auth successful');
                } catch (e) {
                    console.error('[Wrapper] Custom auth failed:', e);
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
