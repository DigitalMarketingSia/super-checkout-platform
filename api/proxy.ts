export const config = {
    runtime: 'edge',
};

export default async function handler(req) {
    // 1. Handle CORS
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS, POST, PUT, PATCH, DELETE',
        'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-Idempotency-Key',
    };

    // 2. Handle Preflight (OPTIONS)
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: corsHeaders });
    }

    try {
        const url = new URL(req.url);
        const endpoint = url.searchParams.get('endpoint');

        // 3. Health Check
        if (!endpoint) {
            return new Response(JSON.stringify({ status: 'ok', message: 'Edge Proxy is running' }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const targetUrl = `https://api.mercadopago.com${endpoint}`;
        console.log(`[Edge Proxy] Forwarding ${req.method} to ${targetUrl}`);

        // 4. Prepare Request to Upstream
        const upstreamHeaders = {
            'Content-Type': 'application/json',
            'Authorization': req.headers.get('Authorization') || '',
            'X-Idempotency-Key': req.headers.get('X-Idempotency-Key') || ''
        };

        const body = req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined;

        const response = await fetch(targetUrl, {
            method: req.method,
            headers: upstreamHeaders,
            body: body
        });

        // 5. Return Response
        const data = await response.text();
        return new Response(data, {
            status: response.status,
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
            }
        });

    } catch (error) {
        console.error('[Edge Proxy] Error:', error);
        return new Response(JSON.stringify({ error: error.message || 'Internal Edge Proxy Error' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}
