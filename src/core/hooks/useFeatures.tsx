import { useState, useEffect, useCallback } from 'react';
import { SystemManager } from '../services/systemManager';
import {
    FeatureSet,
    LimitSet,
    resolveFeatureAccess,
} from '../services/featureAccess';
import { SystemFeature } from '../types';
import { useAuth } from '../context/AuthContext';
import { getRuntimeMode } from '../config/runtimeMode';

export interface UnifiedFeatures {
    features: FeatureSet;
    rawFeatures: SystemFeature[];
    limits: LimitSet;
    plan: string;
    isOwner: boolean;
    loading: boolean;
    refresh: () => Promise<void>;
    hasFeature: (key: string) => boolean;
    getLimit: (key: string) => number | 'unlimited' | null;
}

export const useFeatures = (): UnifiedFeatures => {
    const [loading, setLoading] = useState(true);
    const [features, setFeatures] = useState<FeatureSet>({});
    const [rawFeatures, setRawFeatures] = useState<SystemFeature[]>([]);
    const [limits, setLimits] = useState<LimitSet>({});
    const [plan, setPlan] = useState<string>('free');
    const [isOwnerState, setIsOwnerState] = useState(false);
    const { user, profile } = useAuth();

    const effectiveRole = profile?.effective_role || profile?.role;
    const isSystemOwner = effectiveRole === 'master_admin';

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            if (getRuntimeMode() === 'demo') {
                setRawFeatures([]);
                setLimits({
                    products: 'unlimited',
                    checkouts: 'unlimited',
                    domains: 'unlimited',
                    member_areas: 'unlimited',
                });
                setFeatures({});
                setPlan('demo');
                setIsOwnerState(true);
                return;
            }

            const resolvedAccess = await resolveFeatureAccess(user?.email);

            // 1. Load Local System Features (Flags)
            const locals = await SystemManager.getFeatures();
            setRawFeatures(locals);
            
            const localMap: FeatureSet = {};
            locals.forEach(f => {
                localMap[f.feature_key] = f.is_enabled;
            });

            // 2. Merge logic: local feature flags + remote entitlements
            setLimits(resolvedAccess.limits);
            setFeatures(resolvedAccess.isTestUser ? {} : {
                ...localMap,
                ...resolvedAccess.features
            });

            setPlan(resolvedAccess.plan);
            setIsOwnerState(
                isSystemOwner
                || ((resolvedAccess.plan === 'owner' || resolvedAccess.plan === 'master') && !resolvedAccess.isTestUser),
            );

        } catch (error) {
            console.error('[useFeatures] Load failed:', error);
        } finally {
            setLoading(false);
        }
    }, [isSystemOwner, user?.email]);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    useEffect(() => {
        const refreshOnFocus = () => {
            loadAll();
        };

        const refreshOnVisibility = () => {
            if (document.visibilityState === 'visible') {
                loadAll();
            }
        };

        window.addEventListener('focus', refreshOnFocus);
        document.addEventListener('visibilitychange', refreshOnVisibility);

        return () => {
            window.removeEventListener('focus', refreshOnFocus);
            document.removeEventListener('visibilitychange', refreshOnVisibility);
        };
    }, [loadAll]);

    const isOwner = isOwnerState;

    const hasFeature = (key: string): boolean => {
        if (isOwner) return true;
        return !!features[key];
    };

    const getLimit = (key: string): number | 'unlimited' | null => {
        if (isOwner) return 'unlimited';
        return limits[key] ?? null;
    };

    return { 
        features, 
        rawFeatures,
        limits, 
        plan, 
        isOwner, 
        loading, 
        refresh: loadAll,
        hasFeature,
        getLimit
    };
};
