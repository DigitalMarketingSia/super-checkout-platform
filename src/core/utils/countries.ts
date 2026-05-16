export interface Country {
    code: string;
    name: string;
    ddi: string;
    mask?: string;
}

export const COUNTRIES: Country[] = [
    { code: 'BR', name: 'Brasil', ddi: '+55', mask: '(99) 9 9999-9999' },
    { code: 'US', name: 'Estados Unidos', ddi: '+1', mask: '(999) 999-9999' },
    { code: 'PT', name: 'Portugal', ddi: '+351', mask: '999 999 999' },
    { code: 'AR', name: 'Argentina', ddi: '+54', mask: '(999) 999-9999' },
    { code: 'UY', name: 'Uruguai', ddi: '+598', mask: '99 999 999' },
    { code: 'PY', name: 'Paraguai', ddi: '+595', mask: '(999) 999-999' },
    { code: 'CL', name: 'Chile', ddi: '+56', mask: '9 9999 9999' },
    { code: 'BO', name: 'Bolívia', ddi: '+591', mask: '9999 9999' },
    { code: 'PE', name: 'Peru', ddi: '+51', mask: '999 999 999' },
    { code: 'CO', name: 'Colômbia', ddi: '+57', mask: '399 999 9999' },
    { code: 'EC', name: 'Equador', ddi: '+593', mask: '99 999 9999' },
    { code: 'VE', name: 'Venezuela', ddi: '+58', mask: '(999) 999-9999' },
    { code: 'MX', name: 'México', ddi: '+52', mask: '(999) 999-9999' },
    { code: 'ES', name: 'Espanha', ddi: '+34', mask: '999 99 99 99' },
    { code: 'FR', name: 'França', ddi: '+33', mask: '9 99 99 99 99' },
    { code: 'DE', name: 'Alemanha', ddi: '+49', mask: '9999 999999' },
    { code: 'IT', name: 'Itália', ddi: '+39', mask: '399 999 9999' },
    { code: 'GB', name: 'Reino Unido', ddi: '+44', mask: '7999 999999' },
    { code: 'CA', name: 'Canadá', ddi: '+1', mask: '(999) 999-9999' },
    { code: 'AU', name: 'Austrália', ddi: '+61', mask: '499 999 999' },
    { code: 'JP', name: 'Japão', ddi: '+81', mask: '90-9999-9999' },
    { code: 'CN', name: 'China', ddi: '+86', mask: '199 9999 9999' },
    { code: 'IN', name: 'Índia', ddi: '+91', mask: '99999 99999' },
    { code: 'RU', name: 'Rússia', ddi: '+7', mask: '(999) 999-99-99' },
    { code: 'ZA', name: 'África do Sul', ddi: '+27', mask: '99 999 9999' },
    { code: 'AO', name: 'Angola', ddi: '+244', mask: '999 999 999' },
    { code: 'MZ', name: 'Moçambique', ddi: '+258', mask: '89 999 9999' },
    { code: 'CV', name: 'Cabo Verde', ddi: '+238', mask: '999 99 99' },
    // Add more as needed, this covers major markets and Portuguese speaking countries
];
