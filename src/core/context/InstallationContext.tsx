import React, { createContext, useContext, useState, useEffect } from 'react';

interface InstallationContextType {
    installationId: string | null;
    setInstallationId: (id: string) => void;
    loading: boolean;
}

const InstallationContext = createContext<InstallationContextType | undefined>(undefined);

export const InstallationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [installationId, setInstId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    // Initialize from LocalStorage as a starting point, 
    // but LicenseGuard will be the ultimate authority to validate it.
    useEffect(() => {
        const stored = localStorage.getItem('installation_id');
        if (stored) {
            setInstId(stored);
        }
        setLoading(false);
    }, []);

    const setInstallationId = (id: string) => {
        console.log('[InstallationContext] Setting authoritative ID:', id);
        localStorage.setItem('installation_id', id);
        setInstId(id);
    };

    return (
        <InstallationContext.Provider value={{ installationId, setInstallationId, loading }}>
            {children}
        </InstallationContext.Provider>
    );
};

export const useInstallation = () => {
    const context = useContext(InstallationContext);
    if (context === undefined) {
        throw new Error('useInstallation must be used within an InstallationProvider');
    }
    return context;
};
