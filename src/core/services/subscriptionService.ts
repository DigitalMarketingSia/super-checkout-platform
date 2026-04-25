
export class SubscriptionService {
    /**
     * Promotes a user to the Vitalícia (Unlimited) plan.
     * Routes through /api/central-proxy which adds x-admin-secret server-side.
     */
    async promoteToVitalicia(userId: string) {
        try {
            const { centralSupabase } = await import('./centralClient');
            const { data: { session } } = await centralSupabase.auth.getSession();

            const response = await fetch('/api/central/manage-licenses', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {})
                },
                body: JSON.stringify({
                    action: 'promote_to_vitalicia',
                    user_id: userId
                })
            });

            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Erro ao promover usuário');
            }

            return { success: true };
        } catch (error: any) {
            console.error('[SubscriptionService] Error promoting user:', error);
            throw error;
        }
    }
}

export const subscriptionService = new SubscriptionService();
