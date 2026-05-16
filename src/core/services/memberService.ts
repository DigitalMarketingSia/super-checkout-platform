import { supabase } from './storageService';
import { Profile, MemberNote, MemberTag, ActivityLog, AccessGrant, Product } from '../types';

interface MemberDetails {
    profile: Profile;
    accessGrants: Partial<AccessGrant>[];
    notes: MemberNote[];
    tags: MemberTag[];
    logs: ActivityLog[];
    orders: any[]; // Using any for simplify, ideally Order[]
}

async function getAdminApiHeaders() {
    const { data } = await supabase.auth.getSession();
    return {
        'Content-Type': 'application/json',
        ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
    };
}

export const memberService = {
    /**
     * Get all members (profiles) with optional filtering
     * This uses the 'admin_members_view' if available, or manual joins
     */
    async getMembers(page = 1, limit = 20, search = '', status = '', productId = '') {
        // ... (existing implementation)
        return this.getMembersByArea('', page, limit, search, status);
    },

    /**
     * Get members for a specific area (or all if areaId is empty for now)
     * Supports filtering by status and type (free/paid)
     */
    async getMembersByArea(memberAreaId: string, page = 1, limit = 20, search = '', status = '', type: 'all' | 'free' | 'paid' = 'all') {
        const { data, error } = await supabase
            .rpc('get_area_members_enriched', {
                p_area_id: memberAreaId,
                p_page: page,
                p_limit: limit,
                p_search: search,
                p_status_filter: status,
                p_type_filter: type
            });

        if (error) {
            console.error('Error fetching area members via RPC:', error);
            return { data: [], count: 0 };
        }

        const count = data && data.length > 0 ? data[0].total_count : 0;

        // Map view data to expected Member interface
        const mappedData = (data || []).map((m: any) => ({
            user_id: m.user_id,
            email: m.email,
            name: m.name || m.email.split('@')[0],
            status: m.status,
            joined_at: m.joined_at,
            orders_count: m.orders_count, // Extra info
            active_products_count: m.active_products_count // Extra info
        }));

        return { data: mappedData, count: count };
    },

    async exportMembersCSV(memberAreaId: string) {
        const { data, error } = await supabase.from('admin_members_view').select('*');
        if (error) throw error;

        const csvContent = [
            ['ID', 'Nome', 'Email', 'Status', 'Entrou em', 'Pedidos', 'Produtos Ativos'],
            ...data.map((m: any) => [
                m.user_id,
                m.full_name,
                m.email,
                m.status,
                m.joined_at,
                m.orders_count,
                m.active_products_count
            ])
        ].map(e => e.join(',')).join('\n');

        return csvContent;
    },

    async getMemberDetails(userId: string, fallbackMember?: { email?: string; name?: string; status?: string; joined_at?: string }) {
        if (!userId) {
            throw new Error('ID do membro nao informado.');
        }

        let { data: profiles, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .limit(1);

        if (profileError) throw profileError;

        if ((!profiles || profiles.length === 0) && fallbackMember?.email) {
            const { data: emailProfiles, error: emailProfileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('email', fallbackMember.email)
                .limit(1);

            if (emailProfileError) throw emailProfileError;
            profiles = emailProfiles;
        }

        const profile = profiles?.[0] || {
            id: userId,
            email: fallbackMember?.email || '',
            full_name: fallbackMember?.name || fallbackMember?.email || 'Membro',
            status: (fallbackMember?.status || 'active') as Profile['status'],
            role: 'member' as Profile['role'],
            created_at: fallbackMember?.joined_at || new Date().toISOString()
        };

        // Fetch related data in parallel
        // Fetch related data in parallel with error suppression
        const [accessGrants, notes, tags, logs, orders] = await Promise.all([
            this.getMemberAccess(userId).catch(e => { console.error('Failed to load access:', e); return []; }),
            this.getMemberNotes(userId).catch(e => { console.error('Failed to load notes:', e); return []; }),
            this.getMemberTags(userId).catch(e => { console.error('Failed to load tags:', e); return []; }),
            this.getMemberActivityLogs(userId).catch(e => { console.error('Failed to load logs:', e); return []; }),
            this.getMemberOrders(userId).catch(e => { console.error('Failed to load orders:', e); return []; }),
        ]);

        return {
            profile: profile as Profile,
            accessGrants,
            notes,
            tags,
            logs,
            orders
        };
    },

    async getMemberAccess(userId: string) {
        const { data, error } = await supabase
            .from('access_grants')
            .select('*, product:products(*), content:contents(*)')
            .eq('user_id', userId);

        if (error) {
            console.error('Error fetching member access grants:', error);
            throw error;
        }
        return data; // Typed as partial AccessGrant[]
    },

    async getMemberNotes(userId: string) {
        const { data, error } = await supabase
            .from('member_notes')
            .select('*, author:profiles(full_name, email)')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data as MemberNote[];
    },

    async addMemberNote(userId: string, content: string) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { error } = await supabase
            .from('member_notes')
            .insert({
                user_id: userId,
                author_id: user.id,
                content
            });

        if (error) throw error;
    },

    async getMemberTags(userId: string) {
        const { data, error } = await supabase
            .from('member_tags')
            .select('*')
            .eq('user_id', userId);

        if (error) throw error;
        return data as MemberTag[];
    },

    async addMemberTag(userId: string, tag: string) {
        const { error } = await supabase
            .from('member_tags')
            .insert({ user_id: userId, tag });

        if (error) throw error;
    },

    async removeMemberTag(userId: string, tag: string) {
        const { error } = await supabase
            .from('member_tags')
            .delete()
            .match({ user_id: userId, tag });

        if (error) throw error;
    },

    async getMemberActivityLogs(userId: string) {
        const { data, error } = await supabase
            .from('activity_logs')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;
        return data as ActivityLog[];
    },

    async getMemberOrders(userId: string) {
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('customer_user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    async updateMemberStatus(userId: string, status: 'active' | 'suspended' | 'disabled', memberAreaId?: string) {
        const action = status === 'suspended' ? 'suspend' : status === 'active' ? 'activate' : 'disable';

        const response = await fetch('/api/admin/members', {
            method: 'POST',
            headers: await getAdminApiHeaders(),
            body: JSON.stringify({ action, userId, memberAreaId })
        });

        const contentType = response.headers.get("content-type");
        if (!response.ok || (contentType && contentType.includes("text/html"))) {
            throw new Error(await response.text() || 'Falha ao atualizar acesso do membro.');
        }

        this.logActivity(userId, `member_area_access_changed_to_${status}`, { action, memberAreaId });
    },

    async deleteMember(userId: string, memberAreaId?: string) {
        const response = await fetch('/api/admin/members', {
            method: 'POST',
            headers: await getAdminApiHeaders(),
            body: JSON.stringify({ action: 'delete', userId, memberAreaId })
        });
        if (!response.ok) throw new Error(await response.text());
        this.logActivity(userId, 'member_area_access_removed', { memberAreaId });
    },

    async resendMemberEmail(userId: string, type: 'reset_password' | 'magic_link', memberAreaId?: string) {
        const response = await fetch('/api/admin/members', {
            method: 'POST',
            headers: await getAdminApiHeaders(),
            body: JSON.stringify({ action: 'resend_email', userId, type, memberAreaId })
        });

        if (!response.ok) {
            throw new Error(await response.text() || 'Falha ao reenviar e-mail do membro.');
        }
    },

    async grantAccess(userId: string, productIds: string[]) {
        console.log(`Attempting to grant access for user ${userId} to products:`, productIds);
        // This assumes product-based access
        const grants = productIds.map(pid => ({
            user_id: userId,
            product_id: pid,
            status: 'active',
            granted_at: new Date().toISOString()
        }));

        // Start of a "transaction" via RPC if possible, or just sequential inserts
        // We use upsert to avoid duplicates
        const { data, error } = await supabase
            .from('access_grants')
            .upsert(grants, { onConflict: 'user_id, product_id' })
            .select();

        if (error) {
            console.error('Supabase error granting access:', error);
            throw error;
        }
        console.log('Access granted successfully:', data);

        // Log activity
        this.logActivity(userId, 'access_granted', { productIds });
    },

    async revokeAccess(userId: string, productId: string) {
        const { error } = await supabase
            .from('access_grants')
            .update({ status: 'revoked' }) // Soft delete/revoke
            .match({ user_id: userId, product_id: productId });

        if (error) throw error;

        // Log activity
        this.logActivity(userId, 'access_revoked', { productId });
    },

    async createMember(email: string, fullName: string, initialProductIds: string[] = [], memberAreaId?: string) {
        const response = await fetch('/api/admin/members', {
            method: 'POST',
            headers: await getAdminApiHeaders(),
            body: JSON.stringify({
                action: 'create',
                email,
                name: fullName,
                productIds: initialProductIds,
                memberAreaId
            })
        });

        if (!response.ok) {
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("text/html")) {
                throw new Error("Erro: API Admin não detectada (Rota 404). Se estiver local, use 'vercel dev'.");
            }

            const errorText = await response.text();
            try {
                const errorJson = JSON.parse(errorText);
                throw new Error(errorJson.error || errorJson.message || 'Erro desconhecido');
            } catch (e: any) {
                // If the error is the one we just threw, rethrow it
                if (e.message !== 'JSON' && e.message !== 'Unexpected token') throw e;
                // Otherwise use the raw text
                throw new Error(errorText || 'Erro ao comunicar com servidor');
            }
        }

        return response.json();
    },

    async getProducts() {
        const { data, error } = await supabase
            .from('products')
            .select('id, name')
            .eq('active', true)
            .order('name');

        if (error) throw error;
        return data as Partial<Product>[];
    },

    async updateLastSeen(userId: string) {
        const { error } = await supabase
            .from('profiles')
            .update({ last_seen_at: new Date().toISOString() })
            .eq('id', userId);

        if (error) console.error('Error updating last_seen:', error);

        // Log occasional activity? Or maybe just 'login' is enough.
        // We'll trust explicit logActivity calls for now.
    },

    async logActivity(userId: string, event: string, metadata: any = {}) {
        try {
            const { error } = await supabase
                .from('activity_logs')
                .insert({
                    user_id: userId,
                    event,
                    metadata
                });

            if (error) console.error('Error logging activity:', error);
        } catch (e) {
            console.error('Exception logging activity:', e);
        }
    }
};
