
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Loading } from '../../components/ui/Loading';
import { MigrationRunner } from './MigrationRunner';
import { getRuntimeMode } from '../../config/runtimeMode';

export const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, profile, loading, signOut } = useAuth();
    const isDemoMode = getRuntimeMode() === 'demo';

    if (loading) {
        return <Loading />;
    }

    if (!user) {
        return <Navigate to={isDemoMode ? '/demo' : '/login'} replace />;
    }

    const effectiveRole = profile?.effective_role || profile?.role;
    const isAdmin = effectiveRole === 'admin';
    const isOwner = effectiveRole === 'owner';
    const isMasterAdmin = effectiveRole === 'master_admin';
    const isAuthorized = isAdmin || isOwner || isMasterAdmin;

    // 1. Role Check
    if (!isAuthorized) {
        if (!profile && !isOwner) {
            return (
                <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#05050A] text-white px-6 text-center">
                    <p className="text-gray-300">Nao foi possivel carregar suas permissoes.</p>
                    <p className="mt-2 max-w-md text-sm text-gray-500">
                        Tente novamente. Se o problema continuar, saia e entre de novo.
                    </p>
                    <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                        <button
                            onClick={() => window.location.reload()}
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded transition-colors"
                        >
                            Tentar novamente
                        </button>
                        <button
                            onClick={() => void signOut()}
                            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded transition-colors"
                        >
                            Sair
                        </button>
                    </div>
                </div>
            );
        }

        return (
            <div className="min-h-screen bg-[#05050A] flex flex-col items-center justify-center text-white p-6 text-center">
                <h1 className="text-3xl font-bold text-red-500 mb-4">Acesso Negado</h1>
                <p className="text-gray-400 max-w-md mb-6">
                    Sua conta não possui permissão para acessar o Painel Administrativo.
                </p>
                <button
                    onClick={() => window.history.back()}
                    className="mt-8 px-6 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                >
                    Voltar
                </button>
            </div>
        );
    }

    if (isDemoMode) {
        return <>{children}</>;
    }

    return (
        <>
            <MigrationRunner />
            {children}
        </>
    );
};
