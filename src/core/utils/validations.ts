
export const validateName = (name: string): boolean => {
    if (!name) return false;
    const trimmed = name.trim();
    // Min 6 chars
    if (trimmed.length < 6) return false;
    // At least 2 words
    if (trimmed.split(' ').length < 2) return false;
    // No numbers or special chars (basic regex for letters and accents)
    const regex = /^[a-zA-Z\u00C0-\u00FF\s]+$/;
    return regex.test(trimmed);
};

export const validateEmail = (email: string): boolean => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
};

export const validatePhone = (phone: string): boolean => {
    // Remove non-digits
    let clean = phone.replace(/\D/g, '');

    // Accept BR numbers stored with country code (+55) as well as local format.
    if ((clean.length === 12 || clean.length === 13) && clean.startsWith('55')) {
        clean = clean.substring(2);
    }

    // Check length (10 or 11 digits for BR)
    if (clean.length < 10 || clean.length > 11) return false;
    // Check valid DDD (simple check: 11-99)
    const ddd = parseInt(clean.substring(0, 2));
    if (ddd < 11 || ddd > 99) return false;
    return true;
};

export const validateCPF = (cpf: string): boolean => {
    const clean = cpf.replace(/\D/g, '');
    if (clean.length !== 11) return false;

    // Check for repeated digits
    if (/^(\d)\1+$/.test(clean)) return false;

    // Validate digits
    let sum = 0;
    let remainder;

    for (let i = 1; i <= 9; i++)
        sum = sum + parseInt(clean.substring(i - 1, i)) * (11 - i);

    remainder = (sum * 10) % 11;
    if ((remainder === 10) || (remainder === 11)) remainder = 0;
    if (remainder !== parseInt(clean.substring(9, 10))) return false;

    sum = 0;
    for (let i = 1; i <= 10; i++)
        sum = sum + parseInt(clean.substring(i - 1, i)) * (12 - i);

    remainder = (sum * 10) % 11;
    if ((remainder === 10) || (remainder === 11)) remainder = 0;
    if (remainder !== parseInt(clean.substring(10, 11))) return false;

    return true;
};

// Masks
export const maskPhone = (value: string): string => {
    const v = value.replace(/\D/g, '');
    if (v.length <= 10) {
        return v.replace(/(\d{2})(\d)/, '($1) $2')
            .replace(/(\d{4})(\d)/, '$1-$2');
    } else {
        return v.replace(/(\d{2})(\d)/, '($1) $2')
            .replace(/(\d{5})(\d)/, '$1-$2')
            .substring(0, 15);
    }
};

export const maskCPF = (value: string): string => {
    return value
        .replace(/\D/g, '')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})/, '$1-$2')
        .replace(/(-\d{2})\d+?$/, '$1');
};
