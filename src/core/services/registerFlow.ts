import { getApiUrl } from '../utils/apiUtils';

export interface RegisterApiResponse {
    success?: boolean;
    ignored?: boolean;
    error?: string;
    error_code?: string;
    retryAfterSec?: number;
    requiresCaptcha?: boolean;
    captchaSiteKey?: string | null;
    registrationOpen?: boolean;
    manualApprovalEnabled?: boolean;
    approvalPending?: boolean;
    alreadyJoined?: boolean;
    inviteValid?: boolean;
    inviteReason?: string | null;
    inviteExpiresAt?: string | null;
}

async function postRegister(payload: Record<string, unknown>): Promise<RegisterApiResponse> {
    const response = await fetch(getApiUrl('/api/auth/register'), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw {
            status: response.status,
            ...data
        };
    }

    return data;
}

export function registerAccount(payload: {
    name: string;
    email: string;
    whatsapp: string;
    password: string;
    partnerId?: string | null;
    partnerConsent?: boolean;
    honeypot?: string;
    captchaToken?: string | null;
    inviteToken?: string | null;
}) {
    return postRegister({
        action: 'signup',
        ...payload
    });
}

export function resendRegistrationEmail(payload: {
    email: string;
    flow?: 'register' | 'activation_setup';
    captchaToken?: string | null;
}) {
    return postRegister({
        action: 'resend',
        ...payload
    });
}

export function getRegistrationStatus() {
    return postRegister({
        action: 'status'
    });
}

export function validateInviteToken(payload: {
    inviteToken: string;
}) {
    return postRegister({
        action: 'validate_invite',
        ...payload
    });
}

export function joinRegistrationWaitlist(payload: {
    email: string;
}) {
    return postRegister({
        action: 'waitlist',
        ...payload
    });
}

export function trackRegistrationEvent(payload: {
    event:
        | 'register_page_view'
        | 'register_form_started'
        | 'register_confirmation_viewed'
        | 'activation_email_unconfirmed_viewed';
    email?: string;
    partnerId?: string | null;
}) {
    return postRegister({
        action: 'track',
        ...payload
    }).catch(() => undefined);
}
