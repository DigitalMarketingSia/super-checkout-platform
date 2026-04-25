/**
 * Sanitiza HTML de traduções i18n para prevenir XSS.
 * Permite apenas tags seguras usadas nas traduções: span, strong, br, em, b, i
 * Remove qualquer outra tag HTML, atributos perigosos (onclick, onerror, etc), e scripts.
 * 
 * Fase 11G — Security Hardening
 */

const ALLOWED_TAGS = ['span', 'strong', 'br', 'em', 'b', 'i', 'p'];
const ALLOWED_ATTRS = ['class', 'className'];

export function sanitizeTranslationHtml(html: string): string {
    if (!html) return '';

    // 1. Remove <script> tags and content entirely
    let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    // 2. Remove event handlers (onclick, onerror, onload, etc.)
    clean = clean.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');

    // 3. Remove javascript: URLs
    clean = clean.replace(/href\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, '');

    // 4. Remove disallowed tags but keep their content
    // Build regex that matches any tag NOT in the allowed list
    const tagRegex = /<\/?([a-z][a-z0-9]*)\b[^>]*\/?>/gi;
    clean = clean.replace(tagRegex, (match, tagName) => {
        const tag = tagName.toLowerCase();
        if (!ALLOWED_TAGS.includes(tag)) {
            return ''; // Strip disallowed tags
        }

        // For allowed tags, strip disallowed attributes
        if (tag === 'br') return '<br />';
        
        // Keep only allowed attributes
        const attrRegex = /\s+([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
        const isClosing = match.startsWith('</');
        if (isClosing) return `</${tag}>`;

        let safeAttrs = '';
        let attrMatch;
        while ((attrMatch = attrRegex.exec(match)) !== null) {
            const attrName = attrMatch[1].toLowerCase();
            const attrValue = attrMatch[2] || attrMatch[3] || '';
            if (ALLOWED_ATTRS.includes(attrName)) {
                safeAttrs += ` ${attrName}="${attrValue}"`;
            }
        }

        return `<${tag}${safeAttrs}>`;
    });

    return clean;
}
