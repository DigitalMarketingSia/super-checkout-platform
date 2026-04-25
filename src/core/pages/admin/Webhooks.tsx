import React, { useState, useEffect } from 'react';
import { Layout } from '../../components/Layout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { 
   Globe, 
   Settings, 
   Trash2, 
   Plus, 
   Copy, 
   Play, 
   Terminal 
} from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';

interface Webhook {
   id: string;
   name: string;
   url: string;
   events: string[];
   active: boolean;
   method: string;
   last_fired_at?: string;
   last_status?: number;
}

interface WebhookLog {
   id: string;
   webhook_id: string;
   event: string;
   payload: any;
   response_status: number;
   response_body: string;
   duration_ms: number;
   created_at: string;
   direction: 'incoming' | 'outgoing';
}

export const Webhooks = () => {
   const { user } = useAuth();
   const [activeTab, setActiveTab] = useState<'outgoing' | 'history' | 'incoming'>('outgoing');
   const [webhooks, setWebhooks] = useState<Webhook[]>([]);
   const [logs, setLogs] = useState<WebhookLog[]>([]);
   const [loading, setLoading] = useState(true);
   const [isModalOpen, setIsModalOpen] = useState(false);
   const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
   const [viewLog, setViewLog] = useState<WebhookLog | null>(null);
   const [currentPage, setCurrentPage] = useState(1);
   const itemsPerPage = 10;

   // Form state
   const [formData, setFormData] = useState({
      name: '',
      url: '',
      events: ['pedido.pago', 'pedido.criado'],
      active: true,
      method: 'POST'
   });

   useEffect(() => {
      fetchData();
   }, [user]);

   const fetchData = async () => {
      if (!user) return;
      try {
         const [whRes, logRes] = await Promise.all([
            supabase.from('webhooks').select('*').order('created_at', { ascending: false }),
            supabase.from('webhook_logs').select('*').order('created_at', { ascending: false })
         ]);

         if (whRes.error) throw whRes.error;
         if (logRes.error) throw logRes.error;

         setWebhooks(whRes.data || []);
         setLogs(logRes.data || []);
      } catch (error) {
         console.error('Error fetching data:', error);
         toast.error('Falha ao carregar configurações de webhooks');
      } finally {
         setLoading(false);
      }
   };

   const openNew = () => {
      setEditingWebhook(null);
      setFormData({
         name: '',
         url: '',
         events: ['pedido.pago', 'pedido.criado'],
         active: true,
         method: 'POST'
      });
      setIsModalOpen(true);
   };

   const openEdit = (wh: Webhook) => {
      setEditingWebhook(wh);
      setFormData({
         name: wh.name,
         url: wh.url,
         events: wh.events,
         active: wh.active,
         method: wh.method
      });
      setIsModalOpen(true);
   };

   const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
         if (editingWebhook) {
            const { error } = await supabase
               .from('webhooks')
               .update(formData)
               .eq('id', editingWebhook.id);
            if (error) throw error;
            toast.success('Webhook atualizado com sucesso');
         } else {
            const { error } = await supabase
               .from('webhooks')
               .insert([{ ...formData, user_id: user?.id }]);
            if (error) throw error;
            toast.success('Webhook criado com sucesso');
         }
         setIsModalOpen(false);
         fetchData();
      } catch (error) {
         console.error('Error saving webhook:', error);
         toast.error('Erro ao salvar webhook');
      }
   };

   const handleDeleteClick = async (id: string) => {
      if (!confirm('Tem certeza que deseja excluir este webhook?')) return;
      try {
         const { error } = await supabase.from('webhooks').delete().eq('id', id);
         if (error) throw error;
         toast.success('Webhook excluído');
         fetchData();
      } catch (error) {
         toast.error('Erro ao excluir webhook');
      }
   };

   const handleTest = async (wh: Webhook) => {
      toast.promise(
         fetch(`${wh.url}`, {
            method: wh.method,
            body: JSON.stringify({ test: true, timestamp: new Date().toISOString() })
         }),
         {
            loading: 'Disparando webhook de teste...',
            success: 'Webhook disparado com sucesso',
            error: 'Erro ao conectar com o endpoint'
         }
      );
   };

   const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text);
      toast.success('Copiado para a área de transferência');
   };

   const exportCSV = () => {
      const headers = ['ID', 'Evento', 'Status', 'Duração', 'Data'];
      const rows = logs.map(log => [
         log.id,
         log.event,
         log.response_status,
         `${log.duration_ms}ms`,
         new Date(log.created_at).toLocaleString()
      ]);
      const csvContent = [headers, ...rows].map(e => e.join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.setAttribute('hidden', '');
      a.setAttribute('href', url);
      a.setAttribute('download', 'webhook_logs.csv');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
   };

   const tryFormatJson = (json: any) => {
      try {
         return JSON.stringify(json, null, 2);
      } catch (e) {
         return String(json);
      }
   };

   return (
      <Layout
         title="Webhooks & Integrações"
         subtitle="Conecte seu checkout a ferramentas externas com baixa latência."
      >
         {/* Top Header Decor */}
         <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
         
         <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
            <div>
               <h1 className="text-5xl font-portal-display text-white italic tracking-tighter mb-4">Central de Webhooks</h1>
               <p className="text-gray-500 font-medium max-w-xl">Orquestre o fluxo de dados em tempo real. Configure endpoints de saída ou utilize nossa API de borda para atualizações remotas.</p>
            </div>
            <Button 
               onClick={openNew}
               className="h-16 px-10 rounded-[2rem] bg-primary hover:bg-primary-hover text-white font-black text-xs uppercase tracking-widest shadow-2xl shadow-primary/20 flex items-center gap-3 transition-all active:scale-95"
            >
               <Plus className="w-5 h-5" /> Nova Integração
            </Button>
         </div>

         {/* Tabs */}
         <div className="relative z-10 flex p-1.5 bg-white/5 backdrop-blur-xl rounded-[1.5rem] border border-white/5 mb-10 w-fit">
            <button
               onClick={() => setActiveTab('outgoing')}
               className={`px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all duration-300 ${activeTab === 'outgoing' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-500 hover:text-white'}`}
            >
               Saída
            </button>
            <button
               onClick={() => setActiveTab('incoming')}
               className={`px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all duration-300 ${activeTab === 'incoming' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-500 hover:text-white'}`}
            >
               Entrada
            </button>
            <button
               onClick={() => setActiveTab('history')}
               className={`px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all duration-300 ${activeTab === 'history' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-500 hover:text-white'}`}
            >
               Histórico
            </button>
         </div>

         <div className="relative z-10">
            {/* CONTENT: OUTGOING */}
            {activeTab === 'outgoing' && (
               <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {webhooks.length === 0 ? (
                     <div className="text-center py-24 bg-white/5 rounded-[2.5rem] border border-dashed border-white/10">
                        <Globe className="w-16 h-16 text-gray-700 mx-auto mb-6" />
                        <h3 className="text-xl font-bold text-white mb-2">Sem Conexões Ativas</h3>
                        <p className="text-gray-500 mb-10 max-w-sm mx-auto">Sincronize seu fluxo de dados com ferramentas externas em segundos.</p>
                        <Button 
                           onClick={openNew}
                           className="rounded-2xl bg-white/5 hover:bg-white/10 text-white font-bold border border-white/10 px-8 py-4"
                        >
                           INICIAR INTEGRAÇÃO
                        </Button>
                     </div>
                  ) : (
                     <div className="grid grid-cols-1 gap-6">
                        {webhooks.map(wh => (
                           <Card key={wh.id} noPadding className="group overflow-hidden bg-black/40 border-white/5 hover:border-primary/40 transition-all rounded-[2.5rem]">
                              <div className="p-8 flex flex-col lg:flex-row items-center gap-8">
                                 <div className="flex flex-col items-center">
                                    <div className={`w-4 h-4 rounded-full relative ${wh.active ? 'bg-primary' : 'bg-gray-800'}`}>
                                       {wh.active && <div className="absolute inset-0 rounded-full bg-primary animate-ping opacity-40 scale-150" />}
                                    </div>
                                    <span className="text-[9px] font-black tracking-widest text-gray-700 mt-2 uppercase">
                                       {wh.active ? 'Ativo' : 'Pausa'}
                                    </span>
                                 </div>

                                 <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-4 mb-2">
                                       <h3 className="text-2xl font-portal-display text-white italic tracking-tight truncate">{wh.name}</h3>
                                       <div className="px-3 py-1 bg-white/5 rounded-lg border border-white/10">
                                          <span className="text-[10px] font-black font-mono text-primary-light uppercase">
                                             {wh.method}
                                          </span>
                                       </div>
                                    </div>
                                    <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5 w-fit group-hover:bg-white/10 transition-all">
                                       <Globe className="w-3.5 h-3.5 text-gray-500" />
                                       <span className="text-xs font-mono text-gray-400 truncate max-w-[300px]">{wh.url}</span>
                                       <button onClick={() => copyToClipboard(wh.url)} className="text-gray-600 hover:text-white transition-colors">
                                          <Copy className="w-3.5 h-3.5" />
                                       </button>
                                    </div>
                                 </div>

                                 <div className="hidden lg:block text-right pr-4 border-r border-white/5 min-w-[180px]">
                                    <p className="text-[10px] font-black tracking-widest text-gray-700 uppercase mb-2">Status</p>
                                    {wh.last_fired_at ? (
                                       <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg border font-mono text-[11px] font-bold ${wh.last_status && wh.last_status >= 200 && wh.last_status < 300 
                                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                          : 'bg-red-500/10 text-red-400 border-red-500/20'
                                       }`}>
                                          {wh.last_status} {wh.last_status === 200 ? 'OK' : 'ERR'}
                                       </div>
                                    ) : (
                                       <p className="text-gray-700 uppercase tracking-tighter text-xs">Sem Dados</p>
                                    )}
                                 </div>

                                 <div className="flex items-center gap-3">
                                    <Button size="sm" onClick={() => handleTest(wh)} variant="ghost" className="bg-white/5 hover:bg-white/10 rounded-xl h-12 px-6 font-bold border border-white/5">
                                       <Play className="w-4 h-4 text-primary mr-2" /> TESTAR
                                    </Button>
                                    <button onClick={() => openEdit(wh)} className="w-12 h-12 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-xl text-gray-400 border border-white/5 transition-all">
                                       <Settings className="w-5 h-5" />
                                    </button>
                                    <button onClick={() => handleDeleteClick(wh.id)} className="w-12 h-12 flex items-center justify-center bg-red-500/5 hover:bg-red-500/10 rounded-xl text-gray-700 hover:text-red-500 border border-white/5 transition-all">
                                       <Trash2 className="w-5 h-5" />
                                    </button>
                                 </div>
                              </div>
                           </Card>
                        ))}
                     </div>
                  )}
               </div>
            )}

            {/* CONTENT: HISTORY */}
            {activeTab === 'history' && (
               <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="bg-black/40 border border-white/5 rounded-[2rem] overflow-hidden backdrop-blur-xl">
                     <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                        <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-3">
                           <Terminal className="w-4 h-4 text-primary" /> Log Recente
                        </h3>
                        <Button variant="ghost" size="sm" onClick={exportCSV} className="text-[10px] font-bold text-gray-500 uppercase">
                           Exportar CSV
                        </Button>
                     </div>
                     <div className="divide-y divide-white/5">
                        {logs.length === 0 ? (
                           <div className="text-center py-12 text-gray-600 italic">Sem registros.</div>
                        ) : (
                           logs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(log => (
                              <div key={log.id} className="p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                                 <div className="flex items-center gap-4">
                                    <span className={`px-2 py-1 rounded text-[10px] font-black border ${log.response_status < 400 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                                       {log.response_status}
                                    </span>
                                    <div>
                                       <p className="text-xs font-black text-white uppercase">{log.event}</p>
                                       <p className="text-[10px] text-gray-500">{new Date(log.created_at).toLocaleString()}</p>
                                    </div>
                                 </div>
                                 <button onClick={() => setViewLog(log)} className="px-4 py-2 bg-white/5 hover:bg-primary rounded-lg text-xs font-black uppercase text-gray-400 hover:text-white transition-all">
                                    Payload
                                 </button>
                              </div>
                           ))
                        )}
                     </div>
                  </div>
               </div>
            )}

            {/* CONTENT: INCOMING */}
            {activeTab === 'incoming' && (
               <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl space-y-10">
                  <div className="bg-gradient-to-br from-primary/10 via-purple-500/5 to-transparent rounded-[2.5rem] p-10 border border-white/5 mb-10 overflow-hidden relative">
                     <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2" />
                     <div className="relative z-10">
                        <h2 className="text-3xl font-portal-display text-white italic tracking-tight mb-4">Webhooks de Entrada</h2>
                        <p className="text-gray-400 font-medium mb-8 max-w-2xl leading-relaxed">
                           Orquestre seu ecossistema. Utilize nossa API de borda para atualizar status e sincronizar dados.
                        </p>
                        <div className="bg-black/60 backdrop-blur-3xl rounded-[1.5rem] p-6 border border-primary/20 flex flex-col md:flex-row items-center justify-between gap-6">
                           <code className="text-primary-light font-mono text-sm break-all font-bold">
                              {typeof window !== 'undefined' ? window.location.origin : 'https://api.supercheckout.app'}/api/v1/webhooks/incoming/{'{integration_id}'}
                           </code>
                           <Button onClick={() => copyToClipboard('ENDPOINT_URL')} size="sm" className="rounded-xl bg-primary text-white font-black px-6 h-12 shrink-0 shadow-lg">
                              COPIAR ENDPOINT
                           </Button>
                        </div>
                     </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                     <Card className="bg-black/40 border-white/5 rounded-[2rem] p-8">
                        <h3 className="text-xs font-black text-gray-500 uppercase tracking-[0.2em] mb-6">Executar CURL</h3>
                        <pre className="bg-[#050505] p-6 rounded-2xl text-[11px] text-gray-400 font-mono overflow-x-auto border border-white/5">
                           {`curl -X POST /api/v1/inbound \\
-H "Content-Type: application/json" \\
-d '{"event": "test"}'`}
                        </pre>
                     </Card>
                     <Card className="bg-black/40 border-white/5 rounded-[2rem] p-8">
                        <h3 className="text-xs font-black text-gray-500 uppercase tracking-[0.2em] mb-6">Eventos</h3>
                        <div className="space-y-2">
                           {['pedido.pago', 'assinatura.cancelada'].map(evt => (
                              <div key={evt} className="p-3 bg-white/[0.02] border border-white/5 rounded-xl text-xs font-bold text-white font-mono">
                                 {evt}
                              </div>
                           ))}
                        </div>
                     </Card>
                  </div>
               </div>
            )}
         </div>

         {/* MODAL: CREATE / EDIT */}
         <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
            <div className="p-8">
               <h2 className="text-2xl font-portal-display text-white italic mb-6">
                  {editingWebhook ? 'Configurar Webhook' : 'Nova Integração'}
               </h2>
               <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                     <label className="block text-[10px] font-black uppercase text-gray-500 mb-2">Identificação</label>
                     <input 
                        type="text" 
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all"
                        placeholder="Ex: Integração CRM Alpha"
                     />
                  </div>
                  <div>
                     <label className="block text-[10px] font-black uppercase text-gray-500 mb-2">Endpoint URL</label>
                     <input 
                        type="url" 
                        value={formData.url}
                        onChange={e => setFormData({ ...formData, url: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all"
                        placeholder="https://api.empresa.com/webhook"
                     />
                  </div>
                  <div className="flex justify-end gap-3 mt-8">
                     <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                     <Button type="submit">Salvar Webhook</Button>
                  </div>
               </form>
            </div>
         </Modal>

         {/* MODAL: VIEW LOG */}
         <Modal isOpen={!!viewLog} onClose={() => setViewLog(null)}>
            {viewLog && (
               <div className="p-8">
                  <h2 className="text-2xl font-portal-display text-white italic mb-6">Inspecionar Rastro</h2>
                  <div className="bg-black/40 p-6 rounded-2xl border border-white/5">
                     <pre className="text-xs font-mono text-primary-light overflow-x-auto">
                        {tryFormatJson(viewLog.payload)}
                     </pre>
                  </div>
                  <div className="mt-8 flex justify-end">
                     <Button onClick={() => setViewLog(null)}>Sair</Button>
                  </div>
               </div>
            )}
         </Modal>
      </Layout>
   );
};
