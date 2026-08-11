import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Copy,
  Loader2,
  Play,
  RefreshCw,
  ShieldAlert,
  UserRoundCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { centralSupabase } from '../../../services/centralClient';

type ServiceOrder = {
  id: string;
  product_name: string;
  service_type: string;
  status: string;
  client_approval_status: string;
  created_at: string;
  updated_at?: string | null;
  price: number;
  currency: string;
  scope: 'owner' | 'beneficiary' | 'partner' | 'seller' | 'provider' | 'lead' | null;
  provider_name?: string | null;
  provider_user_id?: string | null;
  beneficiary_name?: string | null;
  beneficiary_email?: string | null;
  beneficiary_license_ready?: boolean;
  approval_token_expires_at?: string | null;
  installation_access_issued_at?: string | null;
  installation_access_expires_at?: string | null;
  target_installation_id?: string | null;
  installation_ready?: boolean;
};

type Provider = { id: string; name: string; email: string };
type InstallationAccess = { url: string; expiresAt: string };

const statusLabels: Record<string, string> = {
  paid: 'Aguardando preparação',
  awaiting_client_approval: 'Aguardando aprovação do cliente',
  approved: 'Aprovado pelo cliente',
  assigned: 'Prestador atribuído',
  in_progress: 'Em andamento',
  completed: 'Concluído',
  rejected: 'Recusado pelo cliente',
  cancelled: 'Cancelado',
  revoked: 'Consentimento revogado',
};

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency || 'BRL' }).format(value || 0);
  } catch {
    return `${currency || 'BRL'} ${Number(value || 0).toFixed(2)}`;
  }
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return '—';
  }
}

async function invokeServiceOrders(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await centralSupabase.functions.invoke('service-orders', {
    body: { action, ...payload },
  });

  if (error) {
    let message = 'Não foi possível processar a ordem de serviço.';
    try {
      const response = (error as any).context;
      const details = response ? await response.json() : null;
      message = details?.error || message;
    } catch {
      // Keep the controlled error message above.
    }
    throw new Error(message);
  }
  if (!data || data.error) throw new Error(data?.error || 'Não foi possível processar a ordem de serviço.');
  return data;
}

export const BlockServiceOrders: React.FC<{ isPlatformOwner: boolean; hasPartnerAccess: boolean }> = ({
  isPlatformOwner,
  hasPartnerAccess,
}) => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerSelection, setProviderSelection] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null);
  const [installationAccessByOrder, setInstallationAccessByOrder] = useState<Record<string, InstallationAccess>>({});

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersResult, providersResult] = await Promise.all([
        invokeServiceOrders('list'),
        isPlatformOwner ? invokeServiceOrders('list_providers') : Promise.resolve({ providers: [] }),
      ]);
      setOrders(Array.isArray(ordersResult.orders) ? ordersResult.orders : []);
      setProviders(Array.isArray(providersResult.providers) ? providersResult.providers : []);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível carregar os serviços.');
    } finally {
      setLoading(false);
    }
  }, [isPlatformOwner]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const summary = useMemo(() => ({
    waiting: orders.filter((order) => ['paid', 'awaiting_client_approval', 'approved'].includes(order.status)).length,
    active: orders.filter((order) => ['assigned', 'in_progress'].includes(order.status)).length,
    complete: orders.filter((order) => order.status === 'completed').length,
  }), [orders]);

  const runOrderAction = async (order: ServiceOrder, action: string, extra: Record<string, unknown> = {}) => {
    setBusyOrderId(order.id);
    try {
      const result = await invokeServiceOrders(action, { order_id: order.id, ...extra });
      if (result.install_url) {
        setInstallationAccessByOrder((current) => ({
          ...current,
          [order.id]: { url: String(result.install_url), expiresAt: String(result.expires_at || '') },
        }));
      }
      if (result.approval_url) {
        setApprovalUrl(String(result.approval_url));
        toast.success(action === 'request_new_approval'
          ? 'Novo link de aprovação criado sem nova cobrança. Copie e envie ao cliente.'
          : 'Link de aprovação criado. Copie e envie ao cliente.');
      } else {
        toast.success('Ordem de serviço atualizada.');
      }
      if (action === 'start') {
        try {
          const access = await invokeServiceOrders('issue_installation_access', { order_id: order.id });
          if (!access.install_url) throw new Error('Secure installation access was not returned.');
          setInstallationAccessByOrder((current) => ({
            ...current,
            [order.id]: { url: String(access.install_url), expiresAt: String(access.expires_at || '') },
          }));
          toast.success('Servico iniciado e acesso seguro de instalacao gerado.');
        } catch (accessError: any) {
          toast.warning(accessError?.message || 'Servico iniciado. Gere o acesso de instalacao antes de continuar.');
        }
      }
      await loadOrders();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível atualizar a ordem.');
    } finally {
      setBusyOrderId(null);
    }
  };

  const copyApprovalUrl = async () => {
    if (!approvalUrl) return;
    try {
      await navigator.clipboard.writeText(approvalUrl);
      toast.success('Link de aprovação copiado.');
    } catch {
      toast.error('Não foi possível copiar o link.');
    }
  };

  const copyInstallationUrl = async (orderId: string) => {
    const access = installationAccessByOrder[orderId];
    if (!access) return;
    try {
      await navigator.clipboard.writeText(access.url);
      toast.success('Link seguro de instalacao copiado.');
    } catch {
      toast.error('Nao foi possivel copiar o link de instalacao.');
    }
  };

  const isOperator = (order: ServiceOrder) => order.scope && order.scope !== 'beneficiary';

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.32em] text-primary">Operação protegida</p>
          <h2 className="mt-2 text-3xl font-display font-black uppercase italic tracking-tighter text-white">Serviços de instalação</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-400">
            {isPlatformOwner
              ? 'Fila global de solicitações, aprovações e execução.'
              : hasPartnerAccess
                ? 'Você vê somente os próprios indicados, vendas e serviços atribuídos.'
                : 'Acompanhe e controle somente as solicitações vinculadas à sua conta.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadOrders()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-300 transition-colors hover:bg-white/10 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      {approvalUrl && (
        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-tight text-emerald-200">Link de aprovação pronto</p>
              <p className="mt-1 text-xs text-emerald-100/70">Ele expira em 30 minutos e só pode ser usado uma vez.</p>
            </div>
            <button type="button" onClick={() => void copyApprovalUrl()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-emerald-950 transition hover:bg-emerald-200">
              <Copy className="h-4 w-4" /> Copiar link
            </button>
          </div>
          <input readOnly value={approvalUrl} className="mt-4 w-full rounded-xl border border-emerald-300/20 bg-black/25 px-3 py-2 text-xs text-emerald-50 outline-none" />
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: 'Aguardando ação', value: summary.waiting, icon: Clock3, tone: 'text-amber-300 border-amber-300/15 bg-amber-300/5' },
          { label: 'Em execução', value: summary.active, icon: ClipboardCheck, tone: 'text-blue-300 border-blue-300/15 bg-blue-300/5' },
          { label: 'Concluídos', value: summary.complete, icon: CheckCircle2, tone: 'text-emerald-300 border-emerald-300/15 bg-emerald-300/5' },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className={`rounded-2xl border p-5 ${tone}`}>
            <div className="flex items-center justify-between"><span className="text-[10px] font-black uppercase tracking-[0.2em]">{label}</span><Icon className="h-5 w-5" /></div>
            <p className="mt-4 text-4xl font-display font-black text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03]">
        {loading ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-gray-400">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <span className="text-[10px] font-black uppercase tracking-[0.25em]">Carregando serviços</span>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-4 px-6 text-center">
            <ClipboardCheck className="h-10 w-10 text-gray-600" />
            <div><p className="font-display font-black uppercase italic text-white">Nenhuma solicitação por enquanto</p><p className="mt-2 text-sm text-gray-500">Quando houver uma compra de serviço, ela aparecerá aqui.</p></div>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {orders.map((order) => {
              const busy = busyOrderId === order.id;
              const operator = isOperator(order);
              const canReviewApproval = order.scope === 'beneficiary' && order.status === 'awaiting_client_approval';
              const canCancelRequest = order.scope === 'beneficiary' && ['paid', 'awaiting_client_approval'].includes(order.status);
              const canRevoke = order.scope === 'beneficiary' && ['approved', 'assigned', 'in_progress'].includes(order.status);
              const approvalExpired = order.status === 'awaiting_client_approval'
                && order.client_approval_status === 'pending'
                && new Date(order.approval_token_expires_at || 0).getTime() <= Date.now();
              const canRequestNewApproval = operator
                && ((order.status === 'rejected' && order.client_approval_status === 'rejected')
                  || (order.status === 'cancelled' && order.client_approval_status === 'pending')
                  || approvalExpired);
              const canAssign = operator && order.status === 'approved' && (isPlatformOwner || hasPartnerAccess);
              const canStart = operator && order.status === 'assigned' && (isPlatformOwner || order.scope === 'provider');
              const canIssueInstallationAccess = operator && order.status === 'in_progress' && !order.installation_ready && (isPlatformOwner || order.scope === 'provider');
              const canComplete = operator && order.status === 'in_progress' && Boolean(order.installation_ready) && (isPlatformOwner || order.scope === 'provider');
              const canCancel = operator && ['paid', 'awaiting_client_approval', 'approved', 'assigned'].includes(order.status);
              const installationAccess = installationAccessByOrder[order.id];

              return (
                <article key={order.id} className="p-5 sm:p-7">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-display font-black uppercase italic tracking-tight text-white">{order.product_name}</h3>
                        <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-primary">{statusLabels[order.status] || order.status}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500">
                        <span>Solicitado em {formatDate(order.created_at)}</span>
                        <span>{formatMoney(order.price, order.currency)}</span>
                        {order.provider_name && <span>Prestador: {order.provider_name}</span>}
                        {operator && order.beneficiary_email && <span>Cliente: {order.beneficiary_name || order.beneficiary_email} · {order.beneficiary_email}</span>}
                      </div>
                      {operator && order.status === 'paid' && !order.beneficiary_license_ready && (
                        <p className="mt-3 inline-flex items-center gap-2 text-xs text-amber-300"><ShieldAlert className="h-4 w-4" /> O cliente precisa ativar uma licença no Portal antes da aprovação.</p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 xl:max-w-xl xl:justify-end">
                      {operator && order.status === 'paid' && (
                        <button disabled={busy} onClick={() => void runOrderAction(order, 'request_approval')} className="action-button bg-primary text-white hover:bg-primary/80">
                          <UserRoundCheck className="h-4 w-4" /> Solicitar aprovação
                        </button>
                      )}
                      {canRequestNewApproval && (
                        <button disabled={busy} onClick={() => void runOrderAction(order, 'request_new_approval')} className="action-button bg-primary text-white hover:bg-primary/80">
                          <UserRoundCheck className="h-4 w-4" /> Solicitar nova aprovação
                        </button>
                      )}
                      {canReviewApproval && (
                        <button disabled={busy} onClick={() => navigate(`/service-approval/${encodeURIComponent(order.id)}`)} className="action-button bg-primary text-white hover:bg-primary/80">
                          <UserRoundCheck className="h-4 w-4" /> Revisar aprovação
                        </button>
                      )}
                      {canAssign && isPlatformOwner && (
                        <select value={providerSelection[order.id] || ''} onChange={(event) => setProviderSelection((current) => ({ ...current, [order.id]: event.target.value }))} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none">
                          <option value="">Atribuir a mim</option>
                          {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
                        </select>
                      )}
                      {canAssign && (
                        <button disabled={busy} onClick={() => void runOrderAction(order, 'assign', isPlatformOwner && providerSelection[order.id] ? { provider_user_id: providerSelection[order.id] } : {})} className="action-button bg-blue-400 text-blue-950 hover:bg-blue-300">
                          <ClipboardCheck className="h-4 w-4" /> {isPlatformOwner ? 'Atribuir' : 'Assumir serviço'}
                        </button>
                      )}
                      {canStart && <button disabled={busy} onClick={() => void runOrderAction(order, 'start')} className="action-button bg-amber-300 text-amber-950 hover:bg-amber-200"><Play className="h-4 w-4" /> Iniciar</button>}
                      {canIssueInstallationAccess && <button disabled={busy} onClick={() => void runOrderAction(order, 'issue_installation_access')} className="action-button bg-violet-300 text-violet-950 hover:bg-violet-200"><Copy className="h-4 w-4" /> {order.installation_access_issued_at ? 'Gerar novo acesso' : 'Gerar acesso de instalacao'}</button>}
                      {canComplete && <button disabled={busy} onClick={() => void runOrderAction(order, 'complete')} className="action-button bg-emerald-300 text-emerald-950 hover:bg-emerald-200"><CheckCircle2 className="h-4 w-4" /> Concluir</button>}
                      {canCancel && <button disabled={busy} onClick={() => void runOrderAction(order, 'cancel')} className="action-button bg-white/5 text-gray-300 hover:bg-white/10">Cancelar</button>}
                      {canCancelRequest && <button disabled={busy} onClick={() => void runOrderAction(order, 'revoke_client_consent')} className="action-button bg-red-400/15 text-red-200 hover:bg-red-400/25"><ShieldAlert className="h-4 w-4" /> Cancelar solicitação</button>}
                      {canRevoke && <button disabled={busy} onClick={() => void runOrderAction(order, 'revoke_client_consent')} className="action-button bg-red-400/15 text-red-200 hover:bg-red-400/25"><ShieldAlert className="h-4 w-4" /> Revogar consentimento</button>}
                    </div>
                  </div>
                  {operator && order.status === 'in_progress' && !order.installation_ready && (
                    <p className="mt-4 inline-flex items-center gap-2 text-xs text-amber-300"><ShieldAlert className="h-4 w-4" /> Conclua a instalacao segura antes de encerrar este servico.</p>
                  )}
                  {operator && order.installation_ready && (
                    <p className="mt-4 inline-flex items-center gap-2 text-xs text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Instalacao vinculada com seguranca a esta ordem.</p>
                  )}
                  {installationAccess && (
                    <div className="mt-5 rounded-2xl border border-violet-300/25 bg-violet-300/10 p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className="text-xs font-black uppercase tracking-widest text-violet-100">Acesso seguro de instalacao pronto</p>
                          <p className="mt-1 text-xs text-violet-100/70">Expira em {formatDate(installationAccess.expiresAt)} e e exclusivo desta ordem.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => void copyInstallationUrl(order.id)} className="action-button bg-violet-200 text-violet-950 hover:bg-violet-100"><Copy className="h-4 w-4" /> Copiar link</button>
                          <a href={installationAccess.url} target="_blank" rel="noreferrer" className="action-button bg-white/10 text-white hover:bg-white/15"><Play className="h-4 w-4" /> Abrir instalador</a>
                        </div>
                      </div>
                      <input readOnly value={installationAccess.url} className="mt-3 w-full rounded-xl border border-violet-300/20 bg-black/25 px-3 py-2 text-xs text-violet-50 outline-none" />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      <style>{`.action-button{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;border-radius:.75rem;padding:.65rem .8rem;font-size:.62rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase;transition:all .2s}.action-button:disabled{cursor:not-allowed;opacity:.5}`}</style>
    </div>
  );
};
