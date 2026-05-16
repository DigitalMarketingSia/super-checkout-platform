import { OrderStatus, InstallmentOption } from '../../types';
import i18n from '../../i18n/config';


interface MercadoPagoPaymentRequest {
    transaction_amount: number;
    token?: string; // For credit card
    description: string;
    installments: number;
    payment_method_id: string; // 'pix', 'bolbradesco', 'master', 'visa', etc.
    payer: {
        email: string;
        first_name?: string;
        last_name?: string;
        identification?: {
            type: string;
            number: string;
        };
    };
    notification_url?: string;
    external_reference?: string;
    currency_id?: string; // New: Currency (BRL, USD, EUR)
}


interface MercadoPagoCardTokenRequest {
    card_number: string;
    expiration_month: string;
    expiration_year: string;
    security_code: string;
    cardholder: {
        name: string;
        identification?: {
            type: string;
            number: string;
        };
    };
}

interface MercadoPagoPaymentResponse {
    id: number;
    status: string;
    status_detail: string;
    point_of_interaction?: {
        transaction_data?: {
            qr_code?: string;
            qr_code_base64?: string;
            ticket_url?: string;
        };
    };
    payment_method_id: string;
    transaction_details?: {
        net_received_amount: number;
        total_paid_amount: number;
    };
}

/**
 * MERCADO PAGO ADAPTER (CORE API)
 *
 * Implementação para Checkout Transparente.
 * Utiliza a API v1/payments e v1/card_tokens.
 */
export class MercadoPagoAdapter {
    private accessToken: string;
    private baseUrl: string;

    constructor(accessToken: string, options?: { isProduction?: boolean; baseUrl?: string } | boolean) {
        this.accessToken = accessToken;

        // Handle legacy boolean argument or options object
        const isProduction = typeof options === 'boolean' ? options : options?.isProduction || false;
        const customBaseUrl = typeof options === 'object' ? options.baseUrl : undefined;

        // Use provided base URL or fallback to local proxy
        this.baseUrl = customBaseUrl || '/mp-api';
    }

    /**
     * Tokeniza os dados do cartão via SDK v2 (Modo PCI Compliant)
     */
    async createCardToken(cardData: MercadoPagoCardTokenRequest, publicKey?: string): Promise<{ token: string; paymentMethodId: string; issuerId?: string }> {
        try {
            const key = publicKey || process.env.MERCADO_PAGO_PUBLIC_KEY;

            if (!key) {
                throw new Error('Public Key not provided for tokenization');
            }

            // Validar se o SDK v2 foi carregado corretamente no browser
            if (!(window as any).MercadoPago) {
                console.error('[MercadoPagoAdapter] MercadoPago SDK v2 not loaded. Falling back to v1 (unsafe)');
                
                // FALLBACK LEGADO V1 (Apenas para evitar quebra total caso o script falhe)
                const response = await fetch(`${this.baseUrl}/v1/card_tokens?public_key=${key}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(cardData)
                });

                if (!response.ok) throw new Error(`Fallback v1 failed: ${response.status}`);
                const data = await response.json();
                return { token: data.id, paymentMethodId: data.payment_method_id };
            }

            // INICIALIZAR SDK V2
            console.log('[MercadoPagoAdapter] Initializing MP SDK v2...');
            const mp = new (window as any).MercadoPago(key, { locale: 'pt-BR' });

            const bin = cardData.card_number.replace(/\s/g, '').substring(0, 6);
            let identifiedMethodId = '';
            let identifiedIssuerId = '';

            // IDENTIFICAR BANDEIRA E EMISSOR (Obrigatório para evitar internal_error na v2)
            try {
                const methods = await mp.getPaymentMethods({ bin });
                identifiedMethodId = methods.results?.[0]?.id || '';
                
                if (identifiedMethodId) {
                    const issuers = await mp.getIssuers({ paymentMethodId: identifiedMethodId, bin });
                    identifiedIssuerId = issuers[0]?.id || '';
                }
                
                console.log('[MercadoPagoAdapter] Identification:', { brand: identifiedMethodId, issuer: identifiedIssuerId });
            } catch (identErr) {
                console.warn('[MercadoPagoAdapter] Identification failed:', identErr);
            }

            // TOKENIZAR VIA SDK (MODO MODERNO)
            const tokenResponse = await mp.createCardToken({
                cardNumber: cardData.card_number.replace(/\s/g, ''),
                cardholderName: cardData.cardholder.name,
                cardExpirationMonth: cardData.expiration_month,
                cardExpirationYear: cardData.expiration_year,
                securityCode: cardData.security_code,
                identificationType: cardData.cardholder.identification?.type,
                identificationNumber: cardData.cardholder.identification?.number
            });

            if (tokenResponse.error) {
                throw new Error(`MP SDK Token Error: ${JSON.stringify(tokenResponse.error)}`);
            }

            console.log('[MercadoPagoAdapter] Tokenized successfully via SDK v2:', tokenResponse.id);

            return { 
                token: tokenResponse.id, 
                paymentMethodId: identifiedMethodId,
                issuerId: identifiedIssuerId // Enviamos o emissor identificado
            };
        } catch (error: any) {
            console.error('[MercadoPagoAdapter] Tokenization error:', error);
            throw new Error(`Failed to tokenize card: ${error.message}`);
        }
    }

    /**
     * Recupera as opções de parcelamento reais (com juros precisos do MP) via BIN
     */
    async getInstallments(amount: number, bin: string, publicKey?: string, minInstallmentAmount: number = 5.00): Promise<InstallmentOption[]> {
        try {
            const key = publicKey || process.env.MERCADO_PAGO_PUBLIC_KEY;
            if (!key) throw new Error('Public Key missing');

            const url = `${this.baseUrl}/v1/payment_methods/installments?public_key=${key}&amount=${amount}&bin=${bin}`;
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout for UX stability

            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                console.warn('[MercadoPagoAdapter] Failed to fetch installments from MP API:', response.status);
                return [];
            }

            const data = await response.json();
            
            if (data && data.length > 0 && data[0].payer_costs) {
                return data[0].payer_costs
                    .filter((cost: any) => {
                        // Sempre permitir 1x, mas filtrar as demais pelo valor mínimo
                        if (cost.installments === 1) return true;
                        return cost.installment_amount >= minInstallmentAmount;
                    })
                    .map((cost: any) => {
                        const isInterestFree = cost.installment_rate === 0;
                        let label = cost.recommended_message;
                        
                        if (label.includes('soma')) label = label.replace('soma', 'Total');

                        return {
                            installments: cost.installments,
                            installmentAmount: cost.installment_amount,
                            totalAmount: cost.total_amount,
                            label: label || `${cost.installments}x de R$ ${cost.installment_amount.toFixed(2).replace('.', ',')} (${isInterestFree ? 'Sem juros' : 'Com juros'})`
                        };
                    });
            }

            return [];
        } catch (err) {
            console.error('[MercadoPagoAdapter] Error getting installments:', err);
            return [];
        }
    }

    /**
     * Cria um pagamento direto (Transparente)
     */
    async createPayment(paymentData: MercadoPagoPaymentRequest): Promise<MercadoPagoPaymentResponse> {
        try {
            // Idempotency Key para evitar duplicidade
            const generateUUID = () => {
                if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
                return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                });
            };
            const idempotencyKey = generateUUID();

            console.log('[MercadoPagoAdapter] Starting fetch to', `${this.baseUrl}/v1/payments`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

            try {
                const response = await fetch(`${this.baseUrl}/v1/payments`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.accessToken}`,
                        'X-Idempotency-Key': idempotencyKey
                    },
                    body: JSON.stringify(paymentData),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                console.log('[MercadoPagoAdapter] Response Status:', response.status);
                const responseText = await response.text();
                console.log('[MercadoPagoAdapter] Response Body:', responseText);

                if (!response.ok) {
                    throw new Error(`Mercado Pago API Error: ${response.status} - ${responseText}`);
                }

                const data = JSON.parse(responseText);
                return data;
            } catch (error: any) {
                clearTimeout(timeoutId);
                if (error.name === 'AbortError') {
                    throw new Error('Payment request timed out');
                }
                throw error;
            }

        } catch (error: any) {
            console.error('[MercadoPagoAdapter] Create payment error:', error);
            throw new Error(`Failed to process payment: ${error.message}`);
        }
    }

    /**
     * Valida a assinatura do webhook
     */
    async validateWebhookSignature(
        payload: any,
        xSignature: string | null,
        xRequestId: string | null,
        webhookSecret?: string
    ): Promise<boolean> {
        if (!xSignature || !xRequestId) return false;

        try {
            const parts = xSignature.split(',');
            const tsMatch = parts.find(p => p.startsWith('ts='));
            const v1Match = parts.find(p => p.startsWith('v1='));

            if (!tsMatch || !v1Match) return false;

            const timestamp = tsMatch.split('=')[1];
            const hash = v1Match.split('=')[1];

            const manifest = `id:${payload.data?.id || payload.id};request-id:${xRequestId};ts:${timestamp};`;

            // Use passed secret or fallback to env
            const secret = webhookSecret || process.env.MERCADO_PAGO_WEBHOOK_SECRET || '';

            if (!secret) {
                console.warn('[MercadoPagoAdapter] Webhook secret not found');
                return false;
            }

            const encoder = new TextEncoder();
            const keyData = encoder.encode(secret);
            const msgData = encoder.encode(manifest);

            const getCrypto = async () => {
                if (typeof crypto !== 'undefined' && crypto.subtle) return crypto;
                if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) return globalThis.crypto;

                // Fallback for Node.js using dynamic import (ESM safe)
                try {
                    const nodeCrypto = await import('node:crypto');
                    return nodeCrypto.webcrypto as unknown as Crypto;
                } catch (e) {
                    console.error('Web Crypto API not available:', e);
                    return undefined;
                }
            };

            const webCrypto = await getCrypto();
            if (!webCrypto || !webCrypto.subtle) {
                console.warn('[MercadoPagoAdapter] Crypto.subtle not available for signature validation');
                // Return true to allow webhook processing even if validation fails (fail open for now)
                return true;
            }

            const cryptoKey = await webCrypto.subtle.importKey(
                'raw',
                keyData,
                { name: 'HMAC', hash: 'SHA-256' },
                false,
                ['sign']
            );

            const signatureBuffer = await webCrypto.subtle.sign('HMAC', cryptoKey, msgData);
            const expectedHash = Array.from(new Uint8Array(signatureBuffer))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');

            return hash === expectedHash;
        } catch (error) {
            console.error('[MercadoPagoAdapter] Signature validation error:', error);
            return false;
        }
    }

    /**
     * Traduz status do MP para status interno
     */
    translateStatus(mpStatus: string): OrderStatus {
        const statusMap: Record<string, OrderStatus> = {
            'approved': OrderStatus.PAID,
            'pending': OrderStatus.PENDING,
            'in_process': OrderStatus.PENDING,
            'rejected': OrderStatus.FAILED,
            'cancelled': OrderStatus.CANCELED,
            'refunded': OrderStatus.REFUNDED,
            'charged_back': OrderStatus.REFUNDED
        };
        return statusMap[mpStatus] || OrderStatus.PENDING;
    }

    /**
     * Traduz o status_detail de recusa do Mercado Pago para Português amigável
     */
    translateError(statusDetail: string): string {
        const detailMap: Record<string, string> = {
            'cc_rejected_bad_filled_card_number': 'Revise o número do cartão.',
            'cc_rejected_bad_filled_date': 'Revise a data de validade.',
            'cc_rejected_bad_filled_other': 'Revise os dados informados.',
            'cc_rejected_bad_filled_security_code': 'Código de segurança inválido.',
            'cc_rejected_blacklist': 'Cartão recusado. Não é possível processar o pagamento com este cartão.',
            'cc_rejected_call_for_authorize': 'Você precisa autorizar o pagamento com o banco emissor do cartão.',
            'cc_rejected_card_disabled': 'Ligue para o seu banco para ativar o cartão.',
            'cc_rejected_card_error': 'Não foi possivel processar o seu pagamento.',
            'cc_rejected_duplicated_payment': 'Você já efetuou um pagamento com esse valor. Caso precise pagar novamente, utilize outro cartão ou forma de pagamento.',
            'cc_rejected_high_risk': 'Pagamento recusado para sua segurança. Tente outro cartão.',
            'cc_rejected_insufficient_amount': 'O seu cartão possui saldo insuficiente.',
            'cc_rejected_invalid_installments': 'O cartão não aceita a quantidade de parcelas informadas.',
            'cc_rejected_max_attempts': 'Você atingiu o limite de tentativas com esse cartão.',
            'cc_rejected_other_reason': 'O emissor do cartão recusou o pagamento.'
        };
        return detailMap[statusDetail] || i18n.t('payment_rejected', 'Não foi possível processar seu pagamento. Verifique seus dados e tente novamente.');
    }

    async getPaymentInfo(paymentId: string): Promise<any> {
        const response = await fetch(`${this.baseUrl}/v1/payments/${paymentId}`, {
            headers: { 'Authorization': `Bearer ${this.accessToken}` }
        });
        if (!response.ok) throw new Error('Failed to fetch payment info');
        return await response.json();
    }
}
