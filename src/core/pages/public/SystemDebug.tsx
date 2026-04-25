import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';

export const SystemDebug = () => {
    const [logs, setLogs] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    const addLog = (msg: string) => setLogs(prev => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);

    const runDiagnostics = async () => {
        setLoading(true);
        setLogs([]);
        addLog('Iniciando diagnóstico...');

        try {
            // 1. Frontend Supabase Connection
            addLog('1. Testando conexão Frontend Supabase...');
            const { data, error } = await supabase.from('public_gateways').select('count').limit(1);
            if (error) throw new Error(`Frontend Supabase Fail: ${error.message}`);
            addLog('✅ Frontend Supabase OK');

            // 2. Test Backend API (Check Status Endpoint with fake ID to test Headers/Keys)
            addLog('2. Testando API Backend (Check Status)...');
            // Usamos um ID falso, esperamos 404 ou 400, mas NÃO 500
            const res = await fetch('/api/check-status?orderId=fake-uuid-test');
            addLog(`Status Code: ${res.status}`);

            const text = await res.text();
            addLog(`Response: ${text.substring(0, 100)}...`);

            if (res.status === 500) {
                addLog('❌ ERRO CRÍTICO NO BACKEND (500). Verifique Logs da Vercel e Chaves de API.');
            } else if (res.status === 400 || res.status === 404) {
                addLog('✅ Backend respondendo (OK - Erro esperado para ID falso)');
            } else {
                addLog('⚠️ Resposta inesperada do backend.');
            }

            // 3. Environment Vars Check (Frontend side)
            addLog('3. Verificando Variáveis de Ambiente (Frontend)...');
            addLog(`VITE_SUPABASE_URL: ${import.meta.env.VITE_SUPABASE_URL ? 'Definido' : 'FALTANDO'}`);
            addLog(`VITE_SUPABASE_ANON_KEY: ${import.meta.env.VITE_SUPABASE_ANON_KEY ? 'Definido' : 'FALTANDO'}`);

        } catch (err: any) {
            addLog(`❌ ERRO NO DIAGNÓSTICO: ${err.message}`);
        } finally {
            setLoading(false);
            addLog('Diagnóstico finalizado.');
        }
    };

    return (
        <div className="p-8 max-w-2xl mx-auto font-mono text-sm">
            <h1 className="text-xl font-bold mb-4">System Diganostics</h1>
            <button
                onClick={runDiagnostics}
                disabled={loading}
                className="bg-blue-600 text-white px-4 py-2 rounded mb-4 disabled:opacity-50"
            >
                {loading ? 'Rodando...' : 'Rodar Testes'}
            </button>

            <div className="bg-gray-100 p-4 rounded h-96 overflow-auto border border-gray-300">
                {logs.map((log, i) => (
                    <div key={i} className="mb-1 border-b border-gray-200 pb-1">{log}</div>
                ))}
            </div>
        </div>
    );
};
