import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

type SetupBody = {
    name?: string;
    email?: string;
    password?: string;
    installation_id?: string;
    central_user_id?: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sendCors(res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function parseBody(req: VercelRequest): SetupBody {
    if (!req.body) return {};
    if (typeof req.body === 'string') {
        try {
            return JSON.parse(req.body);
        } catch {
            return {};
        }
    }
    return req.body;
}

async function isSetupRequired(supabase: any, installationId: string) {
    const scoped = await supabase.rpc('is_setup_required', {
        target_installation_id: installationId
    });

    if (!scoped.error) return Boolean(scoped.data);

    const msg = scoped.error.message || '';
    if (!msg.includes('is_setup_required') && !msg.includes('schema cache')) {
        throw scoped.error;
    }

    const fallback = await supabase.rpc('is_setup_required');
    if (fallback.error) throw fallback.error;
    return Boolean(fallback.data);
}

async function findUserByEmail(supabase: any, email: string) {
    for (let page = 1; page <= 10; page += 1) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
        if (error) throw error;

        const user = data?.users?.find((candidate: any) => candidate.email?.toLowerCase() === email.toLowerCase());
        if (user) return user;

        if (!data?.users || data.users.length < 100) break;
    }

    return null;
}

async function upsertProfile(supabase: any, params: {
    userId: string;
    name: string;
    email: string;
    installationId: string;
    centralUserId?: string | null;
}) {
    const baseProfile: Record<string, any> = {
        id: params.userId,
        email: params.email,
        full_name: params.name,
        role: 'admin',
        status: 'active'
    };

    const variants = [
        {
            ...baseProfile,
            installation_id: params.installationId,
            ...(params.centralUserId ? { central_user_id: params.centralUserId } : {})
        },
        {
            ...baseProfile,
            ...(params.centralUserId ? { central_user_id: params.centralUserId } : {})
        },
        baseProfile
    ];

    let lastError: any = null;
    for (const profile of variants) {
        const { error } = await supabase
            .from('profiles')
            .upsert(profile, { onConflict: 'id' });

        if (!error) return;

        lastError = error;
        const msg = `${error.message || ''} ${error.details || ''}`;
        if (!msg.includes('installation_id') && !msg.includes('central_user_id') && !msg.includes('schema cache')) {
            break;
        }
    }

    throw lastError;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    sendCors(res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: 'Server configuration error: missing local Supabase service credentials' });
    }

    const body = parseBody(req);
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const installationId = String(body.installation_id || '').trim();
    const centralUserId = body.central_user_id && UUID_RE.test(String(body.central_user_id))
        ? String(body.central_user_id)
        : null;

    if (!name || !email || !password || !installationId) {
        return res.status(400).json({ error: 'Nome, e-mail, senha e installation_id sao obrigatorios.' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });

    try {
        const required = await isSetupRequired(supabase, installationId);
        if (!required) {
            return res.status(409).json({ error: 'Esta instalacao ja possui um administrador.' });
        }

        const { count, error: adminCountError } = await supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .in('role', ['admin', 'owner']);

        if (adminCountError) throw adminCountError;
        if ((count || 0) > 0) {
            return res.status(409).json({ error: 'Esta instalacao ja possui um administrador.' });
        }

        const userMetadata = {
            full_name: name,
            name,
            role: 'admin',
            installation_id: installationId,
            ...(centralUserId ? { central_user_id: centralUserId } : {})
        };

        let user: any = null;
        const created = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: userMetadata
        });

        if (created.error) {
            const msg = created.error.message || '';
            if (!msg.toLowerCase().includes('already')) throw created.error;

            user = await findUserByEmail(supabase, email);
            if (!user) throw created.error;

            const updated = await supabase.auth.admin.updateUserById(user.id, {
                password,
                email_confirm: true,
                user_metadata: userMetadata
            });

            if (updated.error) throw updated.error;
            user = updated.data.user;
        } else {
            user = created.data.user;
        }

        if (!user?.id) {
            return res.status(500).json({ error: 'Usuario criado, mas o ID nao foi retornado pelo Supabase.' });
        }

        await upsertProfile(supabase, {
            userId: user.id,
            name,
            email,
            installationId,
            centralUserId
        });

        await supabase
            .from('integrations')
            .upsert({
                user_id: user.id,
                name: 'resend',
                provider: 'resend',
                active: false,
                config: {}
            }, { onConflict: 'user_id,name' });

        return res.status(200).json({
            success: true,
            user_id: user.id,
            installation_id: installationId,
            message: 'Administrador criado e confirmado com sucesso.'
        });
    } catch (error: any) {
        console.error('[setup-admin] error:', error);
        return res.status(500).json({ error: error.message || 'Falha ao criar administrador.' });
    }
}
