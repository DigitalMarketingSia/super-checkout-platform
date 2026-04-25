import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { storage } from '../../services/storageService';
import { supabase, CLIENT_INSTANCE_ID } from '../../services/supabase';

export const AuthDebug = () => {
    const { user: authUser, session: authSession, loading: authLoading, instanceId: ctxInstanceId } = useAuth();
    const [storageUser, setStorageUser] = useState<any>(null);
    const [products, setProducts] = useState<any[]>([]);
    const [productsError, setProductsError] = useState<string | null>(null);
    const [rawSession, setRawSession] = useState<any>(null);

    const [localStorageDump, setLocalStorageDump] = useState<string>('');

    const refreshDebug = async () => {
        const sUser = await storage.getUser();
        setStorageUser(sUser);

        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<{ data: { session: any } }>((resolve) => setTimeout(() => resolve({ data: { session: null } }), 1000));
        const { data: { session: sess } } = await Promise.race([sessionPromise, timeoutPromise]);

        setRawSession(sess);

        // Dump localStorage keys related to supabase
        const dump = Object.keys(localStorage)
            .filter(k => k.startsWith('sb-') || k.includes('supabase'))
            .reduce((acc, k) => ({ ...acc, [k]: localStorage.getItem(k) }), {});
        setLocalStorageDump(JSON.stringify(dump, null, 2));

        try {
            const prods = await storage.getProducts();
            setProducts(prods);
        } catch (e: any) {
            setProductsError(e.message);
        }
    };

    const handleHardReset = async () => {
        if (!confirm('Tem certeza? Isso vai limpar todos os dados locais.')) return;

        try {
            console.log('Attempting sign out...');
            await supabase.auth.signOut();
        } catch (e) {
            console.error('SignOut failed, ignoring:', e);
        }

        console.log('Clearing storage...');
        localStorage.clear();
        sessionStorage.clear();

        // Clear cookies manually if possible (simple attempt)
        document.cookie.split(";").forEach((c) => {
            document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });

        alert('Sessão limpa. Recarregando...');
        window.location.href = '/login';
    };

    useEffect(() => {
        refreshDebug();
    }, [authUser]);

    return (
        <div className="min-h-screen bg-black text-white p-8 font-mono text-sm overflow-auto">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-2xl text-red-500 font-bold">SYSTEM DIAGNOSTIC (STRICT MODE)</h1>
                <div className="flex gap-4">
                    <button onClick={refreshDebug} className="bg-blue-600 px-4 py-2 rounded">Refresh Data</button>
                    <button onClick={handleHardReset} className="bg-red-700 px-4 py-2 rounded border border-red-500 hover:bg-red-600">HARD RESET SESSION</button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="border border-gray-800 p-4 rounded col-span-2">
                    <h2 className="text-pink-400 font-bold mb-2">Supabase Singleton Check</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-gray-500">AuthContext Instance:</p>
                            <p className="font-mono text-lg">{ctxInstanceId || 'Unknown'}</p>
                        </div>
                        <div>
                            <p className="text-gray-500">Direct Import Instance:</p>
                            <p className="font-mono text-lg">{CLIENT_INSTANCE_ID}</p>
                        </div>
                    </div>
                    {ctxInstanceId !== CLIENT_INSTANCE_ID && (
                        <div className="text-red-500 font-bold mt-2 animate-pulse">
                            CRITICAL ERROR: DUPLICATE SUPABASE INSTANCES DETECTED
                        </div>
                    )}
                </div>

                <div className="border border-gray-800 p-4 rounded">
                    <h2 className="text-blue-400 font-bold mb-2">AuthContext State</h2>
                    <pre>{JSON.stringify({ authLoading, userId: authUser?.id, hasSession: !!authSession }, null, 2)}</pre>
                </div>

                <div className="border border-gray-800 p-4 rounded">
                    <h2 className="text-yellow-400 font-bold mb-2">StorageService State</h2>
                    <pre>{JSON.stringify({ storageUser: storageUser?.id }, null, 2)}</pre>
                </div>

                <div className="border border-gray-800 p-4 rounded col-span-2">
                    <h2 className="text-green-400 font-bold mb-2">Supabase Raw Session</h2>
                    <pre className="whitespace-pre-wrap word-break">{JSON.stringify(rawSession, null, 2)}</pre>
                </div>

                <div className="border border-gray-800 p-4 rounded col-span-2">
                    <h2 className="text-purple-400 font-bold mb-2">Products Query Result</h2>
                    {productsError && <div className="text-red-500">Error: {productsError}</div>}
                    <div className="text-gray-400">Count: {products.length}</div>
                    <pre>{JSON.stringify(products.slice(0, 2), null, 2)}</pre>
                </div>

                <div className="border border-gray-800 p-4 rounded col-span-2">
                    <h2 className="text-orange-400 font-bold mb-2">LocalStorage (Supabase Keys)</h2>
                    <pre className="whitespace-pre-wrap word-break text-xs">{localStorageDump}</pre>
                </div>

                <div className="border border-gray-800 p-4 rounded col-span-2">
                    <h2 className="text-cyan-400 font-bold mb-2">Boot Sequence Logs</h2>
                    <div className="bg-[#111] p-2 rounded max-h-60 overflow-y-auto text-xs font-mono text-gray-300">
                        {/* @ts-ignore */}
                        {(window._authLogs || []).map((log, i) => (
                            <div key={i} className="border-b border-gray-800 pb-1 mb-1 last:border-0">{log}</div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
