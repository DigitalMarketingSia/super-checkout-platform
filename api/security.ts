import type { VercelRequest, VercelResponse } from '@vercel/node';
import { enforceApiRateLimit } from '../src/core/api/_rate-limit.js';

function parseBody(req: VercelRequest) {
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

function normalizeReportValue(value: unknown, maxLength = 180) {
    const text = String(value || '').replace(/[A-Za-z0-9_\-]{32,}/g, '[redacted]');
    return text.length > maxLength ? `${text.slice(0, maxLength)}...[redacted]` : text;
}

function getReportSummary(body: any) {
    const report = body?.['csp-report'] || body?.body?.['csp-report'] || body || {};
    return {
        document_uri: normalizeReportValue(report['document-uri'] || report.documentURL),
        effective_directive: normalizeReportValue(report['effective-directive'] || report.effectiveDirective, 80),
        violated_directive: normalizeReportValue(report['violated-directive'] || report.violatedDirective, 120),
        blocked_uri: normalizeReportValue(report['blocked-uri'] || report.blockedURL),
        disposition: normalizeReportValue(report.disposition, 40),
    };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const action = String(req.query.action || '').trim();
    if (action !== 'csp-report') return res.status(404).json({ error: 'Not found' });

    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const rate = enforceApiRateLimit(req, res, {
        scope: 'csp_report',
        limit: 120,
        windowMs: 5 * 60 * 1000,
    });
    if (!rate.allowed) return res.status(204).end();

    const body = parseBody(req);
    console.warn('[csp-report]', getReportSummary(body));
    return res.status(204).end();
}
