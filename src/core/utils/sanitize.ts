import createDOMPurify from 'dompurify';

const ALLOWED_TAGS = ['span', 'strong', 'br', 'em', 'b', 'i', 'p'];
const ALLOWED_ATTRS = ['class'];

type Purifier = {
    sanitize: (dirty: string, config: Record<string, unknown>) => string;
};

function getPurifier(): Purifier | null {
    const candidate = createDOMPurify as unknown as Purifier & ((win: Window) => Purifier);

    if (typeof candidate.sanitize === 'function') {
        return candidate;
    }

    if (typeof window !== 'undefined' && typeof candidate === 'function') {
        return candidate(window);
    }

    return null;
}

export function sanitizeTranslationHtml(html: string): string {
    if (!html) return '';

    const purifier = getPurifier();
    if (!purifier) return '';

    return purifier.sanitize(html, {
        ALLOWED_TAGS,
        ALLOWED_ATTR: ALLOWED_ATTRS,
        ALLOW_DATA_ATTR: false,
        FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'svg', 'math'],
        FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick'],
        KEEP_CONTENT: true,
    });
}
