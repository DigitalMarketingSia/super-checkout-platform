import { centralSupabase } from './centralClient';
import { supabase } from './supabase';
import { SystemManager } from './systemManager';
import { getApiUrl } from '../utils/apiUtils';

export interface FeatureSet {
    [key: string]: boolean;
}

export interface LimitSet {
    [key: string]: number | 'unlimited' | null;
}

interface RemoteFeatureResolution {
    features: FeatureSet;
    limits: LimitSet;
    plan_slug: string;
}

export interface ResolvedFeatureAccess {
    features: FeatureSet;
    limits: LimitSet;
    plan: string;
    localPlan: string;
    isTestUser: boolean;
}

export interface PlanLimitError extends Error {
    code: 'PLAN_LIMIT_REACHED';
    limitKey: string;
    limitValue: number | 'unlimited' | null;
    currentCount: number;
}

export const DEFAULT_PLAN_LIMITS: Record<string, LimitSet> = {
    free: {
        products: 3,
        domains: 1,
        checkouts: 3,
        member_areas: 1,
        custom_branding: 0
    },
    starter: {
        products: 3,
        domains: 1,
        checkouts: 3,
        member_areas: 1,
        custom_branding: 0
    },
    pro: {
        products: 'unlimited',
        domains: 'unlimited',
        checkouts: 'unlimited',
        member_areas: 'unlimited',
        custom_branding: 1
    },
    upgrade_domains: {
        products: 'unlimited',
        domains: 'unlimited',
        checkouts: 'unlimited',
        member_areas: 'unlimited',
        custom_branding: 1
    },
    saas: {
        products: 'unlimited',
        domains: 'unlimited',
        checkouts: 'unlimited',
        member_areas: 'unlimited',
        custom_branding: 1
    },
    whitelabel: {
        products: 'unlimited',
        domains: 'unlimited',
        checkouts: 'unlimited',
        member_areas: 'unlimited',
        custom_branding: 1
    },
    agency: {
        products: 'unlimited',
        domains: 'unlimited',
        checkouts: 'unlimited',
        member_areas: 'unlimited',
        custom_branding: 1
    },
    enterprise: {
        products: 'unlimited',
        domains: 'unlimited',
        checkouts: 'unlimited',
        member_areas: 'unlimited',
        custom_branding: 1
    },
    master: {
        products: 'unlimited',
        domains: 'unlimited',
        checkouts: 'unlimited',
        member_areas: 'unlimited',
        custom_branding: 1
    },
    owner: {
        products: 'unlimited',
        domains: 'unlimited',
        checkouts: 'unlimited',
        member_areas: 'unlimited',
        custom_branding: 1
    }
};

const TEST_USER_EMAILS = String(import.meta.env.VITE_TEST_FREE_USER_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

export const resolvePlanDefaults = (planSlug: string): LimitSet => (
    DEFAULT_PLAN_LIMITS[String(planSlug || '').toLowerCase()] || DEFAULT_PLAN_LIMITS.free
);

export const normalizeLimits = (limits: LimitSet): LimitSet => {
    const normalized = { ...limits };

    if (normalized.domains === 'unlimited') {
        normalized.products = 'unlimited';
        normalized.domains = 'unlimited';
        normalized.checkouts = 'unlimited';
        normalized.member_areas = 'unlimited';
    }

    return normalized;
};

export const createPlanLimitError = (
    limitKey: string,
    currentCount: number,
    limitValue: number | 'unlimited' | null,
): PlanLimitError => {
    const error = new Error(`PLAN_LIMIT_REACHED:${limitKey}`) as PlanLimitError;
    error.code = 'PLAN_LIMIT_REACHED';
    error.limitKey = limitKey;
    error.limitValue = limitValue;
    error.currentCount = currentCount;
    return error;
};

export const isPlanLimitError = (
    error: unknown,
    limitKey?: string,
): error is PlanLimitError => {
    if (!error || typeof error !== 'object') return false;

    const candidate = error as Partial<PlanLimitError>;
    if (candidate.code !== 'PLAN_LIMIT_REACHED') return false;
    if (!limitKey) return true;
    return candidate.limitKey === limitKey;
};

export const resolveFeatureAccess = async (userEmail?: string | null): Promise<ResolvedFeatureAccess> => {
    const normalizedEmail = String(userEmail || '').trim().toLowerCase();
    const isTestUser = TEST_USER_EMAILS.includes(normalizedEmail);

    const localPlan = await SystemManager.getPlanType();
    const localPlanDefaults = resolvePlanDefaults(localPlan);
    const licenseKey = import.meta.env.VITE_LICENSE_KEY || localStorage.getItem('installer_license_key');

    const [{ data: { session: centralSession } }, { data: { session: localSession } }] = await Promise.all([
        centralSupabase.auth.getSession(),
        supabase.auth.getSession(),
    ]);

    const accessToken = centralSession?.access_token || localSession?.access_token || '';
    let remoteData: RemoteFeatureResolution = { features: {}, limits: {}, plan_slug: localPlan };

    if (accessToken) {
        try {
            const response = await fetch(getApiUrl('/api/central/check-entitlement'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                    action: 'resolve_all',
                    license_key: licenseKey,
                }),
            });

            if (response.ok) {
                remoteData = await response.json();
            }
        } catch (error) {
            console.error('[featureAccess] Entitlement resolution failed:', error);
        }
    }

    const resolvedPlan = isTestUser ? 'free' : (remoteData.plan_slug || localPlan);
    const remotePlanDefaults = resolvePlanDefaults(resolvedPlan);
    const mergedLimits = normalizeLimits({
        ...localPlanDefaults,
        ...remotePlanDefaults,
        ...remoteData.limits,
    });

    return {
        features: isTestUser ? {} : (remoteData.features || {}),
        limits: isTestUser ? DEFAULT_PLAN_LIMITS.free : mergedLimits,
        plan: resolvedPlan,
        localPlan,
        isTestUser,
    };
};
