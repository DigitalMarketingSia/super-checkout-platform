import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';
import { COUNTRIES, Country } from '../../utils/countries';

interface PhoneInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    error?: boolean;
    isValid?: boolean;
    variant?: 'default' | 'dark';
    onCountryChange?: (country: Country) => void;
}

export const PhoneInput: React.FC<PhoneInputProps> = ({ 
    value, 
    onChange, 
    error, 
    isValid, 
    className, 
    variant = 'default',
    onBlur,
    ...props 
}) => {
    const [selectedCountry, setSelectedCountry] = useState<Country>(COUNTRIES[0]); // Default BR
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleCountrySelect = (country: Country) => {
        setSelectedCountry(country);
        setIsOpen(false);
        setSearch('');
        if (onCountryChange) onCountryChange(country);

        // Also trigger a change with the current value but new dial code
        const numeric = value.replace(/\D/g, '');
        // If the value already started with a dial code of previous country, we might need to strip it.
        // But usually value is just the masked part.
        
        const syntheticEvent = {
            target: {
                name: props.name || 'phone',
                value: `${country.ddi} ${applyMask(numeric, country.mask)}`
            }
        };
        onChange(syntheticEvent as any);
    };

    const applyMask = (rawValue: string, mask: string) => {
        if (!mask) return rawValue;

        const numeric = rawValue.replace(/\D/g, '');
        let masked = '';
        let numericIndex = 0;

        for (let i = 0; i < mask.length; i++) {
            if (numericIndex >= numeric.length) break;
            if (mask[i] === '9') {
                masked += numeric[numericIndex];
                numericIndex++;
            } else {
                masked += mask[i];
            }
        }
        return masked;
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let inputVal = e.target.value;
        
        // Strip out the dial code if it's there to get just the local number part
        let localPart = inputVal;
        if (inputVal.startsWith(selectedCountry.ddi)) {
            localPart = inputVal.substring(selectedCountry.ddi.length).trim();
        }

        const numeric = localPart.replace(/\D/g, '');
        const masked = applyMask(numeric, selectedCountry.mask);
        const fullValue = `${selectedCountry.ddi} ${masked}`;

        const syntheticEvent = {
            ...e,
            target: {
                ...e.target,
                name: props.name || 'phone',
                value: fullValue
            }
        };

        onChange(syntheticEvent as React.ChangeEvent<HTMLInputElement>);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        if (!onBlur) return;

        const inputVal = e.target.value;
        let localPart = inputVal;
        if (inputVal.startsWith(selectedCountry.ddi)) {
            localPart = inputVal.substring(selectedCountry.ddi.length).trim();
        }

        const numeric = localPart.replace(/\D/g, '');
        const masked = applyMask(numeric, selectedCountry.mask);
        const fullValue = `${selectedCountry.ddi} ${masked}`;

        const syntheticEvent = {
            ...e,
            target: {
                ...e.target,
                name: props.name || 'phone',
                value: fullValue
            }
        };

        onBlur(syntheticEvent as React.FocusEvent<HTMLInputElement>);
    };

    const filteredCountries = COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.ddi.includes(search) ||
        c.code.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Custom Selector Trigger */}
            <div
                className="absolute left-[1px] top-[1px] bottom-[1px] flex items-center z-20"
            >
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className={`h-full flex items-center gap-1.5 border-r px-2 transition-colors focus:outline-none ${
                        variant === 'dark' 
                        ? 'bg-transparent border-white/10 hover:bg-white/5' 
                        : 'bg-gray-50 hover:bg-gray-100 border-gray-200 rounded-l-lg'
                    }`}
                >
                    <img
                        src={`https://flagcdn.com/w40/${selectedCountry.code.toLowerCase()}.png`}
                        alt={selectedCountry.name}
                        className="w-5 h-3.5 object-cover rounded-sm shadow-sm opacity-90"
                    />
                    <span className={`text-xs font-semibold ${variant === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>{selectedCountry.ddi}</span>
                    <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
            </div>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute top-full left-0 mt-2 w-[280px] bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    {/* Search Header */}
                    <div className="p-2 border-b border-gray-100 bg-gray-50/50">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar país..."
                                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-md focus:outline-none focus:border-[#10B981] focus:ring-2 focus:ring-[#10B981]/10"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* Country List */}
                    <div className="max-h-[200px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                        {filteredCountries.length > 0 ? (
                            filteredCountries.map(country => (
                                <button
                                    key={country.code}
                                    type="button"
                                    onClick={() => handleCountrySelect(country)}
                                    className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition-colors text-left ${selectedCountry.code === country.code ? 'bg-green-50/50' : ''}`}
                                >
                                    <img
                                        src={`https://flagcdn.com/w40/${country.code.toLowerCase()}.png`}
                                        alt={country.name}
                                        className="w-5 h-3.5 object-cover rounded-sm shadow-sm flex-shrink-0"
                                    />
                                    <span className="flex-1 text-xs text-gray-700 font-medium truncate">{country.name}</span>
                                    <span className="text-xs text-gray-400 font-mono">{country.ddi}</span>
                                    {selectedCountry.code === country.code && (
                                        <Check className="w-3.5 h-3.5 text-[#10B981]" />
                                    )}
                                </button>
                            ))
                        ) : (
                            <div className="p-3 text-center text-xs text-gray-500">
                                Nenhum país encontrado
                            </div>
                        )}
                    </div>
                </div>
            )}

            <input
                type="tel"
                value={value.startsWith(selectedCountry.ddi) ? value.substring(selectedCountry.ddi.length).trim() : value}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder={selectedCountry.mask || '(00) 00000-0000'}
                className={`w-full pl-[95px] pr-10 py-3 rounded-lg border focus:ring-2 focus:ring-opacity-50 transition-all outline-none ${
                    variant === 'dark'
                    ? 'bg-transparent text-white border-transparent'
                    : 'bg-white text-gray-900 border-gray-200'
                } ${error
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
                    : isValid
                        ? 'border-green-400 focus:border-green-500 focus:ring-green-200'
                        : variant === 'dark' ? 'focus:ring-primary/40' : 'focus:border-[#10B981] focus:ring-[#10B981]/20'
                    } ${className || ''}`}
                {...props}
            />
        </div>
    );
};
