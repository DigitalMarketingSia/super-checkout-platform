import React, { useState, useEffect } from 'react';
import { Outlet, useParams, useNavigate, useLocation } from 'react-router-dom';
import { MemberAreaLayout } from './MemberAreaLayout';
import { storage } from '../../services/storageService';
import { MemberArea } from '../../types';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const MemberAreaWrapper = ({ forcedSlug }: { forcedSlug?: string }) => {
    const { slug: paramSlug } = useParams<{ slug: string }>();
    const slug = forcedSlug || paramSlug;
    const navigate = useNavigate();
    const location = useLocation();
    const { user, loading: authLoading } = useAuth();
    const [memberArea, setMemberArea] = useState<MemberArea | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadMemberArea = async () => {
            console.log('[Wrapper] Loading Member Area for slug:', slug);
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

    useEffect(() => {
        if (loading || authLoading || !memberArea || user) return;

        const isCustomDomain = Boolean(forcedSlug);
        const loginPath = isCustomDomain ? '/login' : `/app/${memberArea.slug}/login`;
        const nextPath = `${location.pathname}${location.search}`;

        navigate(`${loginPath}?next=${encodeURIComponent(nextPath)}`, { replace: true });
    }, [
        authLoading,
        forcedSlug,
        loading,
        location.pathname,
        location.search,
        memberArea,
        navigate,
        user,
    ]);

    if (loading || authLoading || !user) {
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
