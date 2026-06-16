import React, { useEffect, useState } from 'react';
import { Layout } from '../../components/Layout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import {
  Copy,
  Globe,
  Play,
  Plus,
  Settings,
  Terminal,
  Trash2,
} from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { storage } from '../../services/storageService';
import type { WebhookConfig, WebhookLog } from '../../types';
import { isDemoDataRuntime } from '../../services/demoDataService';
import {
  buildDemoWebhookTestPayload,
  dispatchDemoWebhookEvent,
  getDefaultDemoWebhookDraft,
  getDemoWebhookEventOptions,
} from '../../services/demoWebhookService';

type WebhookFormState = {
  name: string;
  description: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  method: WebhookConfig['method'];
};

const generateWebhookId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `webhook-${Date.now()}`;
};

const demoWebhookMode = isDemoDataRuntime();
const eventOptions = getDemoWebhookEventOptions();

export const Webhooks = () => {
  const { t } = useTranslation('admin');
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'outgoing' | 'history' | 'incoming'>('outgoing');
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<WebhookConfig | null>(null);
  const [viewLog, setViewLog] = useState<WebhookLog | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [formData, setFormData] = useState<WebhookFormState>({
    name: '',
    description: '',
    url: '',
    secret: '',
    ...getDefaultDemoWebhookDraft(),
  });

  useEffect(() => {
    void fetchData();
  }, [user]);

  const fetchData = async () => {
    if (!user && !demoWebhookMode) return;

    setLoading(true);
    try {
      const [nextWebhooks, nextLogs] = await Promise.all([
        storage.getWebhooks(),
        storage.getWebhookLogs(),
      ]);

      setWebhooks(nextWebhooks);
      setLogs(nextLogs);
    } catch (error) {
      console.error('Error fetching webhooks:', error);
      toast.error('Falha ao carregar configuracoes de webhook.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      url: '',
      secret: '',
      ...getDefaultDemoWebhookDraft(),
    });
  };

  const openNew = () => {
    setEditingWebhook(null);
    resetForm();
    setIsModalOpen(true);
  };

  const openEdit = (webhook: WebhookConfig) => {
    setEditingWebhook(webhook);
    setFormData({
      name: webhook.name,
      description: webhook.description || '',
      url: webhook.url,
      secret: webhook.secret || '',
      events: webhook.events,
      active: webhook.active,
      method: webhook.method || 'POST',
    });
    setIsModalOpen(true);
  };

  const toggleEvent = (eventId: string) => {
    setFormData((current) => {
      const hasEvent = current.events.includes(eventId);
      return {
        ...current,
        events: hasEvent
          ? current.events.filter((event) => event !== eventId)
          : [...current.events, eventId],
      };
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.name.trim() || !formData.url.trim()) {
      toast.error('Preencha o nome e a URL do endpoint.');
      return;
    }

    if (formData.events.length === 0) {
      toast.error('Selecione pelo menos um evento.');
      return;
    }

    const existing = editingWebhook;
    const payload: WebhookConfig = {
      id: existing?.id || generateWebhookId(),
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      url: formData.url.trim(),
      method: formData.method,
      headers: existing?.headers || [],
      events: formData.events,
      active: formData.active,
      secret: formData.secret.trim() || undefined,
      created_at: existing?.created_at || new Date().toISOString(),
      last_fired_at: existing?.last_fired_at,
      last_status: existing?.last_status,
    };

    setSaving(true);
    try {
      await storage.saveWebhooks([payload]);
      toast.success(existing ? 'Webhook atualizado com sucesso.' : 'Webhook criado com sucesso.');
      setIsModalOpen(false);
      resetForm();
      await fetchData();
    } catch (error) {
      console.error('Error saving webhook:', error);
      toast.error('Erro ao salvar webhook.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este webhook?')) return;

    try {
      await storage.deleteWebhook(id);
      toast.success('Webhook excluido.');
      await fetchData();
    } catch (error) {
      console.error('Error deleting webhook:', error);
      toast.error('Erro ao excluir webhook.');
    }
  };

  const handleTest = async (webhook: WebhookConfig) => {
    setTestingId(webhook.id);

    try {
      if (demoWebhookMode) {
        const result = await dispatchDemoWebhookEvent({
          event: 'pagamento.aprovado',
          payload: buildDemoWebhookTestPayload(),
          targetWebhookId: webhook.id,
          bypassEventFilter: true,
        });

        if (result.logs.length > 0) {
          await storage.saveWebhookLogs(result.logs);
        }

        toast.success(result.delivered > 0
          ? 'Webhook demo disparado com sucesso.'
          : 'Webhook demo enviado, mas o endpoint nao confirmou sucesso.');
        await fetchData();
        return;
      }

      const response = await fetch(webhook.url, {
        method: webhook.method,
        headers: {
          'Content-Type': 'application/json',
          ...(webhook.secret ? { 'X-Super-Checkout-Signature': webhook.secret } : {}),
        },
        body: webhook.method === 'GET'
          ? undefined
          : JSON.stringify({
            test: true,
            event: 'pagamento.aprovado',
            timestamp: new Date().toISOString(),
          }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      toast.success('Webhook disparado com sucesso.');
    } catch (error) {
      console.error('Error testing webhook:', error);
      toast.error('Erro ao conectar com o endpoint.');
    } finally {
      setTestingId(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado para a area de transferencia.');
  };

  const exportCSV = () => {
    const headers = ['ID', 'Evento', 'Status', 'Duracao', 'Data'];
    const rows = logs.map((log) => [
      log.id,
      log.event,
      String(log.response_status || ''),
      `${log.duration_ms || 0}ms`,
      new Date(log.created_at).toLocaleString(),
    ]);

    const csvContent = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.setAttribute('hidden', '');
    anchor.setAttribute('href', url);
    anchor.setAttribute('download', 'webhook_logs.csv');
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const tryFormatJson = (payload: unknown) => {
    try {
      if (typeof payload === 'string') {
        return JSON.stringify(JSON.parse(payload), null, 2);
      }
      return JSON.stringify(payload, null, 2);
    } catch {
      return String(payload);
    }
  };

  return (
    <Layout
      title={t('webhooks.layout_title', 'Webhooks e integracoes')}
      subtitle={t('webhooks.layout_subtitle', 'Conecte seu checkout a ferramentas externas com baixa latencia.')}
    >
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />

      <div className="relative z-10 flex flex-col gap-6 mb-12">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-5xl font-portal-display text-white italic tracking-tighter mb-4">
              {t('webhooks.title', 'Central de webhooks')}
            </h1>
            <p className="text-gray-500 font-medium max-w-xl">
              {t('webhooks.subtitle', 'Orquestre o fluxo de dados em tempo real. Configure endpoints de saida ou utilize nossa API de borda para atualizacoes remotas.')}
            </p>
          </div>
          <Button
            onClick={openNew}
            className="h-16 px-10 rounded-[2rem] bg-primary hover:bg-primary-hover text-white font-black text-xs uppercase tracking-widest shadow-2xl shadow-primary/20 flex items-center gap-3 transition-all active:scale-95"
          >
            <Plus className="w-5 h-5" /> {t('webhooks.new_integration', 'Nova integracao')}
          </Button>
        </div>

        {demoWebhookMode && (
          <div className="rounded-[2rem] border border-primary/20 bg-primary/10 px-6 py-5 text-sm text-primary-light">
            Os webhooks do demo disparam de verdade a partir desta sessao e deste navegador. Todos os payloads saem marcados com <code className="font-mono">demo: true</code>.
          </div>
        )}
      </div>

      <div className="relative z-10 flex p-1.5 bg-white/5 backdrop-blur-xl rounded-[1.5rem] border border-white/5 mb-10 w-fit">
        <button
          onClick={() => setActiveTab('outgoing')}
          className={`px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all duration-300 ${activeTab === 'outgoing' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-500 hover:text-white'}`}
        >
          {t('webhooks.tabs.outgoing', 'Saida')}
        </button>
        <button
          onClick={() => setActiveTab('incoming')}
          className={`px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all duration-300 ${activeTab === 'incoming' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-500 hover:text-white'}`}
        >
          {t('webhooks.tabs.incoming', 'Entrada')}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all duration-300 ${activeTab === 'history' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-500 hover:text-white'}`}
        >
          {t('webhooks.tabs.history', 'Historico')}
        </button>
      </div>

      <div className="relative z-10">
        {activeTab === 'outgoing' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {!loading && webhooks.length === 0 ? (
              <div className="text-center py-24 bg-white/5 rounded-[2.5rem] border border-dashed border-white/10">
                <Globe className="w-16 h-16 text-gray-700 mx-auto mb-6" />
                <h3 className="text-xl font-bold text-white mb-2">{t('webhooks.empty_title', 'Sem conexoes ativas')}</h3>
                <p className="text-gray-500 mb-10 max-w-sm mx-auto">
                  {t('webhooks.empty_desc', 'Sincronize seu fluxo de dados com ferramentas externas em segundos.')}
                </p>
                <div className="flex justify-center">
                  <Button
                    onClick={openNew}
                    className="min-w-[240px] justify-center rounded-2xl bg-white/5 hover:bg-white/10 text-white font-bold border border-white/10 px-8 py-4"
                  >
                    {t('webhooks.start_integration', 'Iniciar integracao')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {webhooks.map((webhook) => (
                  <Card key={webhook.id} noPadding className="group overflow-hidden bg-black/40 border-white/5 hover:border-primary/40 transition-all rounded-[2.5rem]">
                    <div className="p-8 flex flex-col gap-6">
                      <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                        <div className="flex flex-col items-center">
                          <div className={`w-4 h-4 rounded-full relative ${webhook.active ? 'bg-primary' : 'bg-gray-800'}`}>
                            {webhook.active && <div className="absolute inset-0 rounded-full bg-primary animate-ping opacity-40 scale-150" />}
                          </div>
                          <span className="text-[9px] font-black tracking-widest text-gray-700 mt-2 uppercase">
                            {webhook.active ? t('webhooks.status.active', 'Ativo') : t('webhooks.status.paused', 'Pausado')}
                          </span>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-3 mb-2">
                            <h3 className="text-2xl font-portal-display text-white italic tracking-tight truncate">{webhook.name}</h3>
                            <div className="px-3 py-1 bg-white/5 rounded-lg border border-white/10">
                              <span className="text-[10px] font-black font-mono text-primary-light uppercase">
                                {webhook.method}
                              </span>
                            </div>
                          </div>
                          {webhook.description && (
                            <p className="text-sm text-gray-500 mb-3">{webhook.description}</p>
                          )}
                          <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5 w-fit group-hover:bg-white/10 transition-all">
                            <Globe className="w-3.5 h-3.5 text-gray-500" />
                            <span className="text-xs font-mono text-gray-400 truncate max-w-[320px]">{webhook.url}</span>
                            <button onClick={() => copyToClipboard(webhook.url)} className="text-gray-600 hover:text-white transition-colors">
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="hidden lg:block text-right pr-4 border-r border-white/5 min-w-[180px]">
                          <p className="text-[10px] font-black tracking-widest text-gray-700 uppercase mb-2">{t('common.status', 'Status')}</p>
                          {webhook.last_fired_at ? (
                            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg border font-mono text-[11px] font-bold ${webhook.last_status && webhook.last_status >= 200 && webhook.last_status < 300
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-red-500/10 text-red-400 border-red-500/20'
                              }`}
                            >
                              {webhook.last_status} {webhook.last_status === 200 ? 'OK' : 'ERR'}
                            </div>
                          ) : (
                            <p className="text-gray-700 uppercase tracking-tighter text-xs">{t('webhooks.no_data', 'Sem dados')}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <Button
                            size="sm"
                            onClick={() => void handleTest(webhook)}
                            variant="ghost"
                            className="bg-white/5 hover:bg-white/10 rounded-xl h-12 px-6 font-bold border border-white/5"
                            disabled={testingId === webhook.id}
                          >
                            <Play className="w-4 h-4 text-primary mr-2" />
                            {testingId === webhook.id ? 'Testando...' : t('common.test', 'Testar')}
                          </Button>
                          <button onClick={() => openEdit(webhook)} className="w-12 h-12 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-xl text-gray-400 border border-white/5 transition-all">
                            <Settings className="w-5 h-5" />
                          </button>
                          <button onClick={() => void handleDeleteClick(webhook.id)} className="w-12 h-12 flex items-center justify-center bg-red-500/5 hover:bg-red-500/10 rounded-xl text-gray-700 hover:text-red-500 border border-white/5 transition-all">
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {webhook.events.map((eventId) => (
                          <span key={eventId} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-gray-300">
                            {eventId}
                          </span>
                        ))}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-black/40 border border-white/5 rounded-[2rem] overflow-hidden backdrop-blur-xl">
              <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-3">
                  <Terminal className="w-4 h-4 text-primary" /> {t('webhooks.recent_log', 'Log recente')}
                </h3>
                <Button variant="ghost" size="sm" onClick={exportCSV} className="text-[10px] font-bold text-gray-500 uppercase">
                  {t('webhooks.export_csv', 'Exportar CSV')}
                </Button>
              </div>
              <div className="divide-y divide-white/5">
                {logs.length === 0 ? (
                  <div className="text-center py-12 text-gray-600 italic">{t('webhooks.no_logs', 'Sem registros.')}</div>
                ) : (
                  logs
                    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                    .map((log) => (
                      <div key={log.id} className="p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                        <div className="flex items-center gap-4">
                          <span className={`px-2 py-1 rounded text-[10px] font-black border ${(log.response_status || 0) < 400
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-red-500/10 text-red-400 border-red-500/20'
                            }`}
                          >
                            {log.response_status || 0}
                          </span>
                          <div>
                            <p className="text-xs font-black text-white uppercase">{log.event}</p>
                            <p className="text-[10px] text-gray-500">{new Date(log.created_at).toLocaleString()}</p>
                          </div>
                        </div>
                        <button onClick={() => setViewLog(log)} className="px-4 py-2 bg-white/5 hover:bg-primary rounded-lg text-xs font-black uppercase text-gray-400 hover:text-white transition-all">
                          {t('webhooks.payload', 'Payload')}
                        </button>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'incoming' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl space-y-10">
            <div className="bg-gradient-to-br from-primary/10 via-purple-500/5 to-transparent rounded-[2.5rem] p-10 border border-white/5 mb-10 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2" />
              <div className="relative z-10">
                <h2 className="text-3xl font-portal-display text-white italic tracking-tight mb-4">
                  {t('webhooks.incoming_title', 'Webhooks de entrada')}
                </h2>
                <p className="text-gray-400 font-medium mb-8 max-w-2xl leading-relaxed">
                  {t('webhooks.incoming_desc', 'Orquestre seu ecossistema. Utilize nossa API de borda para atualizar status e sincronizar dados.')}
                </p>
                <div className="bg-black/60 backdrop-blur-3xl rounded-[1.5rem] p-6 border border-primary/20 flex flex-col md:flex-row items-center justify-between gap-6">
                  <code className="text-primary-light font-mono text-sm break-all font-bold">
                    {typeof window !== 'undefined' ? window.location.origin : 'https://api.supercheckout.app'}/api/v1/webhooks/incoming/{'{integration_id}'}
                  </code>
                  <Button onClick={() => copyToClipboard(`${window.location.origin}/api/v1/webhooks/incoming/{integration_id}`)} size="sm" className="rounded-xl bg-primary text-white font-black px-6 h-12 shrink-0 shadow-lg">
                    {t('webhooks.copy_endpoint', 'Copiar endpoint')}
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Card className="bg-black/40 border-white/5 rounded-[2rem] p-8">
                <h3 className="text-xs font-black text-gray-500 uppercase tracking-[0.2em] mb-6">{t('webhooks.run_curl', 'Executar CURL')}</h3>
                <pre className="bg-[#050505] p-6 rounded-2xl text-[11px] text-gray-400 font-mono overflow-x-auto border border-white/5">
                  {`curl -X POST /api/v1/inbound \\
-H "Content-Type: application/json" \\
-d '{"event": "test"}'`}
                </pre>
              </Card>
              <Card className="bg-black/40 border-white/5 rounded-[2rem] p-8">
                <h3 className="text-xs font-black text-gray-500 uppercase tracking-[0.2em] mb-6">{t('webhooks.events', 'Eventos')}</h3>
                <div className="space-y-2">
                  {eventOptions.map((option) => (
                    <div key={option.id} className="p-3 bg-white/[0.02] border border-white/5 rounded-xl">
                      <p className="text-xs font-bold text-white font-mono">{option.id}</p>
                      <p className="text-[11px] text-gray-500 mt-1">{option.description}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <div className="p-8">
          <h2 className="text-2xl font-portal-display text-white italic mb-6">
            {editingWebhook ? t('webhooks.configure_webhook', 'Configurar webhook') : t('webhooks.new_integration', 'Nova integracao')}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-500 mb-2">{t('webhooks.form.name', 'Identificacao')}</label>
              <input
                type="text"
                value={formData.name}
                onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all"
                placeholder={t('webhooks.form.name_placeholder', 'Ex: Integracao CRM Alpha')}
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase text-gray-500 mb-2">Descricao curta</label>
              <input
                type="text"
                value={formData.description}
                onChange={(event) => setFormData({ ...formData, description: event.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all"
                placeholder="Ex: Envia vendas demo para o n8n"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase text-gray-500 mb-2">{t('webhooks.form.endpoint_url', 'URL do endpoint')}</label>
              <input
                type="url"
                value={formData.url}
                onChange={(event) => setFormData({ ...formData, url: event.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all"
                placeholder="https://api.empresa.com/webhook"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 mb-2">Metodo</label>
                <select
                  value={formData.method}
                  onChange={(event) => setFormData({ ...formData, method: event.target.value as WebhookConfig['method'] })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all"
                >
                  <option value="POST" className="bg-[#0A0A15] text-white">POST</option>
                  <option value="PUT" className="bg-[#0A0A15] text-white">PUT</option>
                  <option value="PATCH" className="bg-[#0A0A15] text-white">PATCH</option>
                  <option value="GET" className="bg-[#0A0A15] text-white">GET</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 mb-2">Assinatura opcional</label>
                <input
                  type="text"
                  value={formData.secret}
                  onChange={(event) => setFormData({ ...formData, secret: event.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all"
                  placeholder="whsec_demo"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-[10px] font-black uppercase text-gray-500">Eventos</label>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, active: !formData.active })}
                  className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] transition-colors ${formData.active ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-white/5 text-gray-400 border border-white/10'}`}
                >
                  {formData.active ? 'Ativo' : 'Pausado'}
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {eventOptions.map((option) => {
                  const selected = formData.events.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggleEvent(option.id)}
                      className={`w-full rounded-2xl border px-4 py-4 text-left transition-all ${selected
                        ? 'border-primary/50 bg-primary/10 shadow-lg shadow-primary/10'
                        : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                        }`}
                    >
                      <p className="break-words text-xs font-black uppercase tracking-[0.18em] text-white">{option.id}</p>
                      <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">{option.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8">
              <Button variant="ghost" onClick={() => setIsModalOpen(false)} type="button">
                {t('common.cancel', 'Cancelar')}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Salvando...' : t('webhooks.form.save', 'Salvar webhook')}
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      <Modal isOpen={!!viewLog} onClose={() => setViewLog(null)}>
        {viewLog && (
          <div className="p-8">
            <h2 className="text-2xl font-portal-display text-white italic mb-6">{t('webhooks.inspect_trace', 'Inspecionar rastro')}</h2>
            <div className="bg-black/40 p-6 rounded-2xl border border-white/5">
              <pre className="text-xs font-mono text-primary-light overflow-x-auto">
                {tryFormatJson(viewLog.payload)}
              </pre>
            </div>
            <div className="mt-8 flex justify-end">
              <Button onClick={() => setViewLog(null)}>{t('common.close', 'Fechar')}</Button>
            </div>
          </div>
        )}
      </Modal>
    </Layout>
  );
};
