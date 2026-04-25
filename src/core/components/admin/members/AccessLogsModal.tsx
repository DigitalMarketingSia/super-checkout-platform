import React, { useState, useEffect } from 'react';
import { centralSupabase as supabase } from '../../../services/centralClient';
import { Modal } from '../../ui/Modal';
import { Clock, Globe, Shield, ShieldAlert, AlertCircle } from 'lucide-react';

interface AccessLog {
    id: number;
    created_at: string;
    ip_address: string;
    domain: string;
    granted: boolean;
    message: string;
}

interface AccessLogsModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
    userName: string;
}

export const AccessLogsModal: React.FC<AccessLogsModalProps> = ({ isOpen, onClose, userId, userName }) => {
    const [logs, setLogs] = useState<AccessLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isOpen && userId) {
            fetchLogs();
        }
    }, [isOpen, userId]);

    const fetchLogs = async () => {
        try {
            setLoading(true);

            // First, get the license key for this user
            const { data: license } = await supabase
                .from('licenses')
                .select('key')
                .eq('owner_id', userId)
                .maybeSingle();

            if (!license) {
                setLogs([]);
                return;
            }

            // Fetch logs for this license
            const { data, error } = await supabase
                .from('access_logs')
                .select('*')
                .eq('license_key', license.key)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;
            setLogs(data || []);
        } catch (error) {
            console.error('Error fetching access logs:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Logs de Acesso: ${userName}`}
            className="max-w-2xl"
        >
            <div className="space-y-4">
                {loading ? (
                    <div className="py-12 text-center text-gray-500">
                        Carregando histórico...
                    </div>
                ) : logs.length === 0 ? (
                    <div className="py-12 text-center text-gray-500 flex flex-col items-center gap-3">
                        <AlertCircle className="w-8 h-8 opacity-20" />
                        <p>Nenhum log de acesso encontrado para este usuário.</p>
                    </div>
                ) : (
                    <div className="overflow-hidden border border-white/5 rounded-xl bg-black/20">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-white/5 text-gray-400 text-xs uppercase font-medium">
                                <tr>
                                    <th className="px-4 py-3 font-semibold">Data / Hora</th>
                                    <th className="px-4 py-3 font-semibold">Domínio</th>
                                    <th className="px-4 py-3 font-semibold">Status</th>
                                    <th className="px-4 py-3 font-semibold">IP</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="px-4 py-3 whitespace-nowrap text-gray-300">
                                            <div className="flex flex-col">
                                                <span>{new Date(log.created_at).toLocaleDateString()}</span>
                                                <span className="text-[10px] opacity-50">{new Date(log.created_at).toLocaleTimeString()}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <Globe className="w-3.5 h-3.5 text-gray-500" />
                                                <span className="text-gray-200">{log.domain || '-'}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className={`flex items-center gap-1.5 font-medium ${log.granted ? 'text-green-400' : 'text-red-400'}`}>
                                                {log.granted ? <Shield className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                                                {log.granted ? 'Permitido' : 'Negado'}
                                            </div>
                                            {log.message && (
                                                <p className="text-[10px] opacity-60 mt-0.5 truncate max-w-[150px]" title={log.message}>
                                                    {log.message}
                                                </p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                                            {log.ip_address}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex gap-3">
                    <Clock className="w-5 h-5 text-blue-400 shrink-0" />
                    <p className="text-xs text-blue-200/80 leading-relaxed">
                        Exibindo os últimos 50 registros de atividade. Os logs mostram tentativas de ativação e validação do Super Checkout nos domínios do cliente.
                    </p>
                </div>
            </div>
        </Modal>
    );
};
