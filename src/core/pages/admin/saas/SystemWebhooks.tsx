import React, { useState, useEffect } from 'react';
import { Layout } from '../../../components/Layout';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { ShieldAlert, Webhook, Eye, EyeOff, Save, Lock } from 'lucide-react';
import { supabase } from '../../../services/supabase';

export const SystemWebhooks = () => {
    // SECURITY: This page should ONLY be accessible by the Owner
    // We mask the URL by default.

    // In a real implementation with Env Vars, we can't easily "Read" the Env Var from the client side 
    // without a secure Edge Function.
    // For this UI, we will act as if we are managing a secure configuration.

    const [webhookUrl, setWebhookUrl] = useState(''); // Empty by default
    const [isEditing, setIsEditing] = useState(false);
    const [showUrl, setShowUrl] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Fetch current config if stored in DB (system_settings table)
        // Since we are currently using ENV VARS, we cannot fetch it directly to display securely.
        // We will show a placeholder or instructions.
    }, []);

    const handleSave = async () => {
        // To update an Env Var from Client -> Edge Function -> Management API
        // This is complex and risky. 
        // For phase 1, we might just instruct the user or save to a DB table 'system_settings' 
        // that the dispatch-webhook function prefers over the Env Var.

        alert('Por segurança, a alteração de Webhooks de Sistema via Painel está desabilitada temporariamente. Use o CLI ou contate o suporte para alterar a variável SYSTEM_WEBHOOK_URL.');
    };

    return (
        <Layout>
            <div className="max-w-4xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Webhook className="w-6 h-6 text-primary" /> Webhooks de Sistema
                    </h1>
                    <p className="text-gray-400 text-sm mt-1">Configuração global de eventos administrativos (Owner).</p>
                </div>

                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 mb-6 flex items-start gap-4">
                    <div className="bg-yellow-500/20 p-2 rounded-lg shrink-0">
                        <ShieldAlert className="w-6 h-6 text-yellow-500" />
                    </div>
                    <div>
                        <h3 className="text-yellow-500 font-bold text-sm mb-1">Área de Alta Segurança</h3>
                        <p className="text-gray-300 text-sm leading-relaxed">
                            O Webhook de Sistema recebe <strong>TODOS</strong> os dados da plataforma, incluindo chaves de licença e tokens de instalação.
                            <br />
                            Nunca configure isso para uma URL pública ou de terceiros desconhecidos.
                        </p>
                    </div>
                </div>

                <Card className="p-6">
                    <div className="flex items-center justify-between mb-4">
                        <label className="text-sm font-medium text-gray-300">URL de Destino (System Scope)</label>
                        <div className="flex bg-black/30 rounded-lg p-1">
                            <button
                                onClick={() => setIsEditing(!isEditing)}
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${isEditing ? 'bg-primary text-white' : 'text-gray-500 hover:text-white'}`}
                            >
                                Editar
                            </button>
                            <button
                                onClick={() => setIsEditing(false)} // View mode effectively
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${!isEditing ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}
                            >
                                Visualizar
                            </button>
                        </div>
                    </div>

                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Lock className="h-4 w-4 text-gray-500" />
                        </div>
                        <input
                            type={showUrl ? "text" : "password"}
                            value={webhookUrl || 'https://n8n-gzz2.onrender.com/webhook/super-checkout-venda (Configurado no Servidor)'}
                            readOnly={!isEditing}
                            onChange={(e) => setWebhookUrl(e.target.value)}
                            className={`w-full bg-black/20 border rounded-lg pl-10 pr-12 py-3 text-sm focus:outline-none transition-all font-mono ${isEditing
                                    ? 'border-primary/50 text-white focus:ring-1 focus:ring-primary'
                                    : 'border-white/5 text-gray-500 cursor-not-allowed'
                                }`}
                        />
                        <button
                            type="button"
                            onClick={() => setShowUrl(!showUrl)}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-white"
                        >
                            {showUrl ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                    </div>

                    {isEditing && (
                        <div className="mt-4 flex justify-end animate-in fade-in slide-in-from-top-2">
                            <Button onClick={handleSave} className="bg-red-600 hover:bg-red-700">
                                <Save className="w-4 h-4 mr-2" /> Salvar Alterações (Requer Confirmação)
                            </Button>
                        </div>
                    )}
                </Card>

                <div className="mt-8">
                    <h4 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">Eventos Disparados</h4>
                    <div className="grid gap-3">
                        <div className="bg-white/5 border border-white/5 rounded-lg p-3 flex justify-between items-center">
                            <code className="text-primary text-xs font-mono">license.created</code>
                            <span className="text-xs text-gray-500">Nova licença gerada (Admin ou Venda)</span>
                        </div>
                        <div className="bg-white/5 border border-white/5 rounded-lg p-3 flex justify-between items-center opacity-50">
                            <code className="text-gray-400 text-xs font-mono">installation.revoked</code>
                            <span className="text-xs text-gray-600">Em breve</span>
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
};
