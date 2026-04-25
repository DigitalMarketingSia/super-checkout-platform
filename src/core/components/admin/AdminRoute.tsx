
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Loading } from '../../components/ui/Loading';
import { MigrationRunner } from './MigrationRunner';

export const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, profile, account, compliance, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return <Loading />;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // Master Owner Logic (Email based as safety net)
    const ownerEmail = 'contato.jeandamin@gmail.com';
    const isMasterEmail = user.email?.toLowerCase() === ownerEmail.toLowerCase();

    // 0. IMMEDIATE BYPASS FOR OWNER (SOLVES LOGIN LOOP)
    if (isMasterEmail) {
        console.log('🔓 SUPER OWNER BYPASS ACTIVE');
        return (
            <>
                <MigrationRunner />
                {children}
            </>
        );
    }

    const isAdmin = profile?.role === 'admin';
    const isOwner = profile?.role === 'owner';
    const isAuthorized = isAdmin || isOwner;

    // 1. Role Check
    if (!isAuthorized) {
        if (!profile && !isOwner) {
            return (
                <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#05050A] text-white">
                    <p className="text-gray-400">Não foi possível carregar suas permissões.</p>
                    <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-purple-600 rounded">Tentar Novamente</button>
                    <p className="text-xs text-gray-600 mt-4 font-mono">UID: {user?.id}</p>
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

    // 2. Compliance Logic Check
    // We NO LONGER redirect to /admin/setup.
    // Instead, we allow access but might show a banner (handled in Layout).

    // const isSetupPage = location.pathname === '/admin/setup';
    // const isCompliant = compliance?.status === 'verified';

    // if (!isCompliant && !isSetupPage) {
    //     console.log('AdminRoute: Account not compliant, redirecting to Wizard.');
    //     return <Navigate to="/admin/setup" replace />;
    // }

    return (
        <>
            <MigrationRunner />
            {children}
        </>
    );
};
