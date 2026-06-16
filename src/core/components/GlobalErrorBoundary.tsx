import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

const DYNAMIC_IMPORT_RECOVERY_STORAGE_KEY = 'supercheckout:dynamic-import-recovery-at';
const DYNAMIC_IMPORT_RECOVERY_WINDOW_MS = 60_000;

const isDynamicImportFailure = (error: Error | null) => {
    const message = String(error?.message || '').toLowerCase();

    return (
        message.includes('failed to fetch dynamically imported module') ||
        message.includes('importing a module script failed') ||
        message.includes('chunkloaderror') ||
        message.includes('loading chunk')
    );
};

const shouldAttemptDynamicImportRecovery = () => {
    if (typeof window === 'undefined') return false;

    try {
        const lastAttemptAt = Number(window.sessionStorage.getItem(DYNAMIC_IMPORT_RECOVERY_STORAGE_KEY) || '0');
        return !Number.isFinite(lastAttemptAt) || (Date.now() - lastAttemptAt) > DYNAMIC_IMPORT_RECOVERY_WINDOW_MS;
    } catch {
        return true;
    }
};

const markDynamicImportRecoveryAttempt = () => {
    if (typeof window === 'undefined') return;

    try {
        window.sessionStorage.setItem(DYNAMIC_IMPORT_RECOVERY_STORAGE_KEY, String(Date.now()));
    } catch {
        // Ignore storage failures and still try a hard reload.
    }
};

export class GlobalErrorBoundary extends React.Component<Props, State> {
    declare props: Readonly<Props>;

    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);

        if (isDynamicImportFailure(error) && shouldAttemptDynamicImportRecovery()) {
            markDynamicImportRecoveryAttempt();
            window.location.reload();
        }
    }

    public render() {
        if (this.state.hasError) {
            const isDynamicImportError = isDynamicImportFailure(this.state.error);

            return (
                <div className="min-h-screen bg-[#0D1118] flex items-center justify-center p-4">
                    <div className="bg-[#1a1e26] border border-red-500/20 rounded-xl p-8 max-w-lg w-full shadow-2xl">
                        <h1 className="text-2xl font-bold text-red-500 mb-4">Algo deu errado</h1>
                        <p className="text-gray-300 mb-6">
                            {isDynamicImportError
                                ? 'Detectamos uma versao desatualizada do aplicativo ou um arquivo do deploy que mudou durante a navegacao.'
                                : 'Ocorreu um erro inesperado que impediu o carregamento da aplicacao.'}
                        </p>

                        <div className="bg-black/30 p-4 rounded-lg mb-6 overflow-auto max-h-48">
                            <code className="text-xs text-red-400 font-mono">
                                {this.state.error?.message}
                            </code>
                        </div>

                        <button
                            onClick={() => window.location.reload()}
                            className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold transition-colors"
                        >
                            {isDynamicImportError ? 'Atualizar Aplicacao' : 'Recarregar Pagina'}
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
