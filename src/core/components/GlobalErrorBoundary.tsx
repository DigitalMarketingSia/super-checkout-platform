import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class GlobalErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-[#0D1118] flex items-center justify-center p-4">
                    <div className="bg-[#1a1e26] border border-red-500/20 rounded-xl p-8 max-w-lg w-full shadow-2xl">
                        <h1 className="text-2xl font-bold text-red-500 mb-4">Algo deu errado</h1>
                        <p className="text-gray-300 mb-6">
                            Ocorreu um erro inesperado que impediu o carregamento da aplicação.
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
                            Recarregar Página
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
