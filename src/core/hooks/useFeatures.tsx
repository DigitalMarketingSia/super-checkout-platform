import { useState, useEffect, useCallback } from 'react';
import { centralSupabase } from '../services/centralClient';
import { SystemManager } from '../services/systemManager';
import { CENTRAL_CONFIG } from '../config/central';
import { SystemFeature } from '../types';
import { useAuth } from '../context/AuthContext';

export interface FeatureSet {
    [key: string]: boolean;
}

export interface LimitSet {
    [key: string]: number | 'unlimited' | null;
}

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

const DEFAULT_PLAN_LIMITS: Record<string, LimitSet> = {
    free: {
        products: 3,
        domains: 1,
        custom_branding: 0
    },
    starter: {
        products: 3,
        domains: 1,
        custom_branding: 0
    },
    pro: {
        products: 'unlimited',
        domains: 'unlimited',
        custom_branding: 1
    },
    agency: {
        products: 'unlimited',
        domains: 'unlimited',
        custom_branding: 1
    },
    enterprise: {
        products: 'unlimited',
        domains: 'unlimited',
        custom_branding: 1
    },
    master: {
        products: 'unlimited',
        domains: 'unlimited',
        custom_branding: 1
    }
};

export const useFeatures = (): UnifiedFeatures => {
    const [loading, setLoading] = useState(true);
    const [features, setFeatures] = useState<FeatureSet>({});
    const [rawFeatures, setRawFeatures] = useState<SystemFeature[]>([]);
    const [limits, setLimits] = useState<LimitSet>({});
    const [plan, setPlan] = useState<string>('free');
    const [isOwnerState, setIsOwnerState] = useState(false);
    const { user } = useAuth();

    const isMasterOwner = user?.email === 'contato.jeandamin@gmail.com';
    const isTestUser = user?.email === 'contato.digitalmarketingsia@gmail.com';

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Get local plan from database
            const localPlan = await SystemManager.getPlanType();
            const planDefaults = DEFAULT_PLAN_LIMITS[localPlan.toLowerCase()] || DEFAULT_PLAN_LIMITS.free;

            // 2. Load Remote Features (Central)
            const licenseKey = import.meta.env.VITE_LICENSE_KEY || localStorage.getItem('installer_license_key');
            const { data: { session } } = await centralSupabase.auth.getSession();
            
            let remoteData = { features: {}, limits: {}, plan_slug: localPlan };

            if (session?.access_token || licenseKey) {
                const response = await fetch(`${CENTRAL_CONFIG.API_URL}/check-entitlement`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': session?.access_token ? `Bearer ${session.access_token}` : ''
                    },
                    body: JSON.stringify({ 
                        action: 'resolve_all',
                        license_key: licenseKey
                    })
                });

                if (response.ok) {
                    remoteData = await response.json();
                }
            }

            // 3. Load Local System Features (Flags)
            const locals = await SystemManager.getFeatures();
            setRawFeatures(locals);
            
            const localMap: FeatureSet = {};
            locals.forEach(f => {
                localMap[f.feature_key] = f.is_enabled;
            });

            // 4. Merge Logic
            // Remote Entitlements > Plan Defaults
            // FIX: If it's the Test User, IGNORE remote unlimited limits to simulate 'free'
            setLimits(isTestUser ? planDefaults : {
                ...planDefaults,
                ...remoteData.limits
            });

            setFeatures(isTestUser ? {} : {
                ...localMap,
                ...remoteData.features
            });

            const resolvedPlan = isMasterOwner ? 'master' : (isTestUser ? 'free' : (remoteData.plan_slug || localPlan));
            setPlan(resolvedPlan);
            setIsOwnerState((resolvedPlan === 'owner' || resolvedPlan === 'master' || isMasterOwner) && !isTestUser);

        } catch (error) {
            console.error('[useFeatures] Load failed:', error);
        } finally {
            setLoading(false);
        }
    }, [isMasterOwner]);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    const isOwner = isOwnerState || isMasterOwner;

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
