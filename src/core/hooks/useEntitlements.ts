import { useState, useEffect } from 'react';
import { centralSupabase } from '../services/centralClient'; // Adjust path as needed
import { CENTRAL_CONFIG } from '../config/central';

export interface EntitlementCheck {
    allowed: boolean;
    limit: number | 'unlimited' | null;
    message: string;
    upsell_offer: 'unlimited_domains' | 'partner_rights' | 'whitelabel' | null;
    partner_status?: 'none' | 'active' | 'suspended' | 'revoked';
    is_partner?: boolean;
}

export const useEntitlements = () => {
    const [loading, setLoading] = useState(false);
    const [entitlements, setEntitlements] = useState<EntitlementCheck | null>(null);

    const checkEntitlement = async (
        resource?: 'domains' | 'installations' | 'products',
        currentCount?: number,
        feature?: 'custom_branding' | 'partner_rights'
    ): Promise<EntitlementCheck> => {
        setLoading(true);
        try {
            const licenseKey = import.meta.env.VITE_LICENSE_KEY || localStorage.getItem('installer_license_key');
            const { data: { session } } = await centralSupabase.auth.getSession();
            if (!session?.access_token && !licenseKey) {
                return { allowed: false, limit: 0, message: 'Not authenticated', upsell_offer: null };
            }

            const response = await fetch(`${CENTRAL_CONFIG.API_URL}/check-entitlement`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': session?.access_token ? `Bearer ${session.access_token}` : ''
                },
                body: JSON.stringify({ 
                    resource, 
                    feature, 
                    current_count: currentCount,
                    license_key: licenseKey
                })
            });

            const data = await response.json();
            setEntitlements(data);
            return data;
        } catch (error) {
            console.error('Entitlement check failed:', error);
            // Default to stricter safety
            return { allowed: false, limit: 0, message: 'Error checking limits', upsell_offer: null };
        } finally {
            setLoading(false);
        }
    };

    // Auto-fetch on mount for basic status? 
    // Or let the caller decide. Let's add a helper to refresh all.
    useEffect(() => {
        checkEntitlement(); // Fetch basic status (partner_status etc)
    }, []);

    return { checkEntitlement, entitlements, loading };
};
