export const DISPOSABLE_EMAIL_DOMAINS = [
    '10minutemail.com',
    '10minutemail.net',
    '20minutemail.com',
    'dispostable.com',
    'emailondeck.com',
    'fakeinbox.com',
    'fakemail.net',
    'getairmail.com',
    'getnada.com',
    'guerrillamail.com',
    'guerrillamail.net',
    'guerrillamail.org',
    'maildrop.cc',
    'mailinator.com',
    'mailnesia.com',
    'mintemail.com',
    'moakt.com',
    'mytrashmail.com',
    'sharklasers.com',
    'spam4.me',
    'temp-mail.io',
    'temp-mail.org',
    'tempail.com',
    'tempmail.com',
    'tempmail.dev',
    'tempmailo.com',
    'throwawaymail.com',
    'trashmail.com',
    'trashmail.de',
    'yopmail.com',
    'yopmail.fr',
    'yopmail.net'
];

export function isDisposableEmailDomain(email: string): boolean {
    const domain = String(email || '').trim().toLowerCase().split('@')[1] || '';
    if (!domain) return false;

    return DISPOSABLE_EMAIL_DOMAINS.some((blocked) =>
        domain === blocked || domain.endsWith(`.${blocked}`)
    );
}
