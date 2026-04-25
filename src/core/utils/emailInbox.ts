const WEBMAIL_PROVIDERS: Record<string, string> = {
    'gmail.com': 'https://mail.google.com',
    'googlemail.com': 'https://mail.google.com',
    'outlook.com': 'https://outlook.live.com/mail/0/',
    'hotmail.com': 'https://outlook.live.com/mail/0/',
    'live.com': 'https://outlook.live.com/mail/0/',
    'msn.com': 'https://outlook.live.com/mail/0/',
    'yahoo.com': 'https://mail.yahoo.com',
    'yahoo.com.br': 'https://mail.yahoo.com',
    'icloud.com': 'https://www.icloud.com/mail',
    'me.com': 'https://www.icloud.com/mail',
    'mac.com': 'https://www.icloud.com/mail',
    'zoho.com': 'https://mail.zoho.com',
    'uol.com.br': 'https://email.uol.com.br',
    'bol.com.br': 'https://www.bol.uol.com.br',
    'terra.com.br': 'https://webmail.terra.com.br',
};

export const getInboxUrl = (email: string): string | null => {
    const domain = email.split('@')[1]?.toLowerCase().trim();

    if (!domain) {
        return null;
    }

    return WEBMAIL_PROVIDERS[domain] || null;
};

export const openInboxForEmail = (email: string) => {
    const inboxUrl = getInboxUrl(email);

    if (inboxUrl) {
        window.open(inboxUrl, '_blank', 'noopener,noreferrer');
        return;
    }

    window.location.href = `mailto:${email}`;
};
