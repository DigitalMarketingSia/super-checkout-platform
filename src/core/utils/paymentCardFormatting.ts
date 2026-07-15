export const MAX_PAYMENT_CARD_DIGITS = 19;
export const MAX_PAYMENT_CARD_INPUT_LENGTH = 23;

export const formatPaymentCardNumberInput = (value: string) => {
    const digits = String(value || '').replace(/\D/g, '').slice(0, MAX_PAYMENT_CARD_DIGITS);
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
};

export const formatPaymentCardSecurityCodeInput = (value: string) => (
    String(value || '').replace(/\D/g, '').slice(0, 4)
);
