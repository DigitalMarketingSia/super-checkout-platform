import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Copy,
  Filter,
  KeyRound,
  Loader2,
  MessageCircleMore,
  Play,
  RefreshCw,
  Search,
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
  support_request?: {
    id: string;
    status: 'open' | 'acknowledged' | 'resolved' | string;
    message: string;
    created_at: string;
    updated_at?: string | null;
    acknowledged_at?: string | null;
    resolved_at?: string | null;
  } | null;
  email_delivery?: {
    total: number;
    sent: number;
    pending: number;
    sending: number;
    failed: number;
    cancelled: number;
    next_retry_at?: string | null;
    last_sent_at?: string | null;
  };
};

type Provider = { id: string; name: string; email: string };
type InstallationAccess = { url: string; expiresAt: string };
type ServiceFilter = 'all' | 'waiting' | 'active' | 'completed' | 'support' | 'cancelled';

const statusLabels: Record<string, string> = {
  paid: 'Aguardando preparação',
  awaiting_client_approval: 'Aguardando aprovação do cliente',
  approved: 'Aprovado pelo cliente',
  assigned: 'Prestador atribuído',
  in_progress: 'Em andamento',
  completed: 'Concluído',
  rejected: 'Recusado pelo cliente',
  cancelled: 'Cancelado',
  revoked: 'Instalação cancelada',
};

const supportStatusLabels: Record<string, string> = {
  open: 'Atendimento solicitado',
  acknowledged: 'Em atendimento',
  resolved: 'Atendimento concluído',
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

function getEmailDeliveryLabel(delivery?: ServiceOrder['email_delivery']) {
  if (!delivery?.total) return null;
  if (delivery.failed > 0) return { label: 'Falha de e-mail — reprocessamento disponível', tone: 'text-red-300' };
  if (delivery.sending > 0) return { label: 'E-mail em envio', tone: 'text-blue-300' };
  if (delivery.pending > 0) return { label: 'E-mail aguardando envio', tone: 'text-amber-300' };
  if (delivery.sent > 0) return { label: 'E-mail enviado', tone: 'text-emerald-300' };
  return { label: 'E-mail cancelado', tone: 'text-gray-400' };
}

async function invokeServiceOrdersDirect(action: string, payload: Record<string, unknown> = {}) {
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
      // Keep controlled error message.
    }
    throw new Error(message);
  }
  if (!data || data.error) throw new Error(data?.error || 'Não foi possível processar a ordem de serviço.');
  return data;
}

async function invokeServiceOrders(action: string, payload: Record<string, unknown> = {}) {
  const { data: sessionData, error: sessionError } = await centralSupabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (sessionError || !accessToken) {
    throw new Error('Sua sessão do Portal expirou. Entre novamente para acessar os serviços.');
  }

  let response: Response;
  try {
    response = await fetch('/api/central/service-orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch {
    throw new Error('Não foi possível conectar ao serviço de ordens nesta instalação local.');
  }

  // Preserve compatibility with deployed installations while the BFF rolls out.
  if (response.status === 404) {
    return invokeServiceOrdersDirect(action, payload);
  }

  const rawBody = await response.text();
  let data: any = null;
  try {
    data = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    // The proxy should return JSON; keep the HTTP status visible if it does not.
  }

  if (!response.ok || !data || data.error) {
    const code = typeof data?.code === 'string' ? ` (${data.code})` : '';
    const message = data?.error || `A Central respondeu com erro ${response.status || 'de rede'} ao processar a ordem`;
    throw new Error(`${message}${code}`);
  }

  return data;
}

export const BlockServiceOrders: React.FC<{ isPlatformOwner: boolean; hasPartnerAccess: boolean; focusOrderId?: string | null }> = ({
  isPlatformOwner,
  hasPartnerAccess,
  focusOrderId,
}) => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerSelection, setProviderSelection] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null);
  const [installationAccessByOrder, setInstallationAccessByOrder] = useState<Record<string, InstallationAccess>>({});
  const [consentRevocationOrder, setConsentRevocationOrder] = useState<ServiceOrder | null>(null);
  const [supportRequestOrder, setSupportRequestOrder] = useState<ServiceOrder | null>(null);
  const [supportMessage, setSupportMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<ServiceFilter>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'price'>('recent');
  const [page, setPage] = useState(1);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const pageSize = 6;

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

  const filteredOrders = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const filtered = orders.filter((order) => {
      if (activeFilter === 'waiting' && !['paid', 'awaiting_client_approval', 'approved'].includes(order.status)) return false;
      if (activeFilter === 'active' && !['assigned', 'in_progress'].includes(order.status)) return false;
      if (activeFilter === 'completed' && order.status !== 'completed') return false;
      if (activeFilter === 'cancelled' && !['rejected', 'cancelled', 'revoked'].includes(order.status)) return false;
      if (activeFilter === 'support' && (!order.support_request || order.support_request.status === 'resolved')) return false;
      if (!query) return true;
      const haystack = [
        order.product_name,
        order.beneficiary_name,
        order.beneficiary_email,
        order.provider_name,
        statusLabels[order.status],
        order.id,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });

    return filtered.sort((left, right) => {
      if (sortBy === 'price') return Number(right.price || 0) - Number(left.price || 0);
      const leftDate = new Date(left.updated_at || left.created_at).getTime();
      const rightDate = new Date(right.updated_at || right.created_at).getTime();
      return sortBy === 'recent' ? rightDate - leftDate : leftDate - rightDate;
    });
  }, [activeFilter, orders, searchTerm, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const paginatedOrders = filteredOrders.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [activeFilter, searchTerm, sortBy]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setExpandedOrderId(null);
  }, [activeFilter, searchTerm, sortBy, page]);

  useEffect(() => {
    if (focusOrderId && orders.some((order) => order.id === focusOrderId)) {
      setExpandedOrderId(focusOrderId);
    }
  }, [focusOrderId, orders]);

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
      } else if (action === 'request_support') {
        toast.success(result.created === false
          ? 'Já existe um pedido de atendimento em aberto para esta solicitação.'
          : 'Pedido de atendimento enviado ao prestador responsável.');
      } else if (action === 'acknowledge_support') {
        toast.success('Atendimento assumido. O cliente foi avisado no Portal.');
      } else if (action === 'resolve_support') {
        toast.success('Atendimento marcado como concluído.');
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

  const confirmConsentRevocation = async () => {
    const order = consentRevocationOrder;
    if (!order) return;
    setConsentRevocationOrder(null);
    await runOrderAction(order, 'revoke_client_consent');
  };

  const submitSupportRequest = async () => {
    const order = supportRequestOrder;
    const message = supportMessage.trim();
    if (!order) return;
    if (message.length < 10) {
      toast.error('Descreva o que você precisa em pelo menos 10 caracteres.');
      return;
    }
    setSupportRequestOrder(null);
    setSupportMessage('');
    await runOrderAction(order, 'request_support', { message });
  };

  const isOperator = (order: ServiceOrder) => order.scope && order.scope !== 'beneficiary';

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-1 text-[9px] font-black uppercase tracking-[0.28em] text-gray-600">Portal / Operações</p>
          <h2 className="text-3xl font-portal-display leading-none text-white">Serviços de instalação</h2>
          <p className="mt-2 max-w-2xl text-[9px] font-medium uppercase tracking-[0.1em] text-gray-600">
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
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/5 bg-[#111116] px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400 transition-colors hover:border-white/10 hover:bg-[#15151e] hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      {approvalUrl && (
        <div className="rounded-2xl border border-emerald-400/20 bg-[#111116] p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-tight text-emerald-200">Link de aprovação pronto</p>
              <p className="mt-1 text-xs text-emerald-100/70">Ele expira em 30 minutos e só pode ser usado uma vez.</p>
            </div>
            <button type="button" onClick={() => void copyApprovalUrl()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-emerald-300 transition hover:bg-emerald-400/15">
              <Copy className="h-4 w-4" /> Copiar link
            </button>
          </div>
          <input readOnly value={approvalUrl} className="mt-4 w-full rounded-xl border border-white/5 bg-[#07070F] px-3 py-2 text-xs text-emerald-100 outline-none" />
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {[
          { label: 'Aguardando ação', value: summary.waiting, icon: Clock3, tone: 'text-amber-300', iconTone: 'bg-amber-400/10 text-amber-300 border-amber-300/20', wash: 'from-amber-400/[0.12] via-amber-400/[0.03] to-transparent', hint: 'Pendências para liberar' },
          { label: 'Em execução', value: summary.active, icon: ClipboardCheck, tone: 'text-[#A78BFA]', iconTone: 'bg-[#8A2BE2]/10 text-[#C77DFF] border-[#8A2BE2]/25', wash: 'from-[#8A2BE2]/[0.14] via-[#8A2BE2]/[0.03] to-transparent', hint: 'Instalações em andamento' },
          { label: 'Concluídos', value: summary.complete, icon: CheckCircle2, tone: 'text-emerald-300', iconTone: 'bg-emerald-400/10 text-emerald-300 border-emerald-300/20', wash: 'from-emerald-400/[0.13] via-emerald-400/[0.03] to-transparent', hint: 'Serviços finalizados' },
        ].map(({ label, value, icon: Icon, tone, iconTone, wash, hint }) => (
          <div key={label} className="group relative min-h-[142px] overflow-hidden rounded-[2rem] border border-white/[0.06] bg-[#0B0B12]/80 p-4 backdrop-blur-sm transition hover:border-white/10 hover:bg-[#111116] sm:p-5">
            <div className={`pointer-events-none absolute inset-y-0 left-0 z-0 w-1/2 bg-gradient-to-r ${wash} opacity-80`} />
            <div className="relative z-10 flex h-full flex-col justify-between">
              <div className="flex items-center gap-2.5"><div className={`flex h-8 w-8 items-center justify-center rounded-lg border ${iconTone}`}><Icon className="h-4 w-4" /></div><span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">{label}</span></div>
              <div><p className="text-[10px] font-bold uppercase tracking-wider text-gray-600">{hint}</p><p className={`mt-2 text-3xl font-portal-display leading-none ${tone}`}>{value}</p></div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/5 bg-[#111116] p-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <label className="relative flex min-w-0 flex-1 items-center">
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-gray-500" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar servico, cliente, prestador ou ID..."
              aria-label="Buscar servicos"
              className="h-10 w-full rounded-xl border border-white/5 bg-[#07070F] pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-[#10B981]/40 focus:ring-1 focus:ring-[#10B981]/20"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-gray-500"><Filter className="h-3.5 w-3.5" /> Filtrar</div>
            {([
              ['all', 'Todos'],
              ['waiting', 'Aguardando'],
              ['active', 'Em execucao'],
              ['completed', 'Concluidos'],
              ['support', 'Atendimento'],
              ['cancelled', 'Cancelados'],
            ] as [ServiceFilter, string][]).map(([filter, label]) => (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={`rounded-xl px-3 py-2 text-[10px] font-bold transition ${activeFilter === filter ? 'border border-[#10B981]/30 bg-[#10B981]/15 text-[#10B981] shadow-[0_0_15px_rgba(16,185,129,0.12)]' : 'border border-transparent bg-transparent text-gray-500 hover:border-white/5 hover:bg-white/5 hover:text-white'}`}
              >
                {label}
              </button>
            ))}
            <label className="relative flex items-center">
              <ArrowUpDown className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-gray-500" />
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)} aria-label="Ordenar servicos" className="h-9 appearance-none rounded-xl border border-white/5 bg-[#07070F] pl-8 pr-3 text-[10px] font-bold uppercase tracking-wider text-gray-400 outline-none focus:border-[#10B981]/40">
                <option value="recent">Mais recentes</option>
                <option value="oldest">Mais antigos</option>
                <option value="price">Maior valor</option>
              </select>
            </label>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3 text-[10px] font-bold uppercase tracking-widest text-gray-600">
          <span>{filteredOrders.length} de {orders.length} servico{orders.length === 1 ? '' : 's'}</span>
          {searchTerm || activeFilter !== 'all' ? <span className="text-primary">Filtro ativo</span> : <span>Visao geral</span>}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl">
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
        ) : filteredOrders.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-4 px-6 text-center">
            <Search className="h-10 w-10 text-gray-600" />
            <div><p className="font-display font-black uppercase italic text-white">Nenhum servico encontrado</p><p className="mt-2 text-sm text-gray-500">Ajuste a busca ou remova os filtros para ver outras solicitacoes.</p></div>
            <button type="button" onClick={() => { setSearchTerm(''); setActiveFilter('all'); }} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-300 transition hover:bg-white/10">Limpar filtros</button>
          </div>
        ) : (
          <div className="space-y-3">
            {paginatedOrders.map((order) => {
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
                  || (order.status === 'cancelled' && ['pending', 'revoked'].includes(order.client_approval_status))
                  || approvalExpired);
              const canAssign = operator && order.status === 'approved' && (isPlatformOwner || hasPartnerAccess);
              const canStart = operator && order.status === 'assigned' && (isPlatformOwner || order.scope === 'provider');
              const canIssueInstallationAccess = operator && order.status === 'in_progress' && !order.installation_ready && (isPlatformOwner || order.scope === 'provider');
              const canComplete = operator && order.status === 'in_progress' && Boolean(order.installation_ready) && (isPlatformOwner || order.scope === 'provider');
              const canCancel = operator && ['paid', 'awaiting_client_approval', 'approved', 'assigned'].includes(order.status);
              const needsBeneficiaryLicense = order.status === 'paid' && order.beneficiary_license_ready === false;
              const canActivateFreeLicense = order.scope === 'beneficiary' && needsBeneficiaryLicense;
              const installationAccess = installationAccessByOrder[order.id];
              const emailDeliveryLabel = getEmailDeliveryLabel(order.email_delivery);
              const canRetryFailedEmails = isPlatformOwner && Boolean(order.email_delivery?.failed);
              const supportRequest = order.support_request || null;
              const canRequestSupport = order.scope === 'beneficiary' && (!supportRequest || supportRequest.status === 'resolved');
              const canAcknowledgeSupport = operator && supportRequest?.status === 'open';
              const canResolveSupport = operator && ['open', 'acknowledged'].includes(supportRequest?.status || '');
              const expanded = expandedOrderId === order.id;
              const statusVisual = order.status === 'completed'
                ? { border: 'border-l-emerald-400', accent: 'text-emerald-300', dot: 'bg-emerald-400', badge: 'bg-emerald-400/10 border-emerald-300/20 text-emerald-300', wash: 'from-emerald-400/[0.13] via-emerald-400/[0.03] to-transparent' }
                : ['paid', 'awaiting_client_approval', 'approved'].includes(order.status)
                  ? { border: 'border-l-amber-400', accent: 'text-amber-300', dot: 'bg-amber-400', badge: 'bg-amber-400/10 border-amber-300/20 text-amber-300', wash: 'from-amber-400/[0.12] via-amber-400/[0.03] to-transparent' }
                  : ['assigned', 'in_progress'].includes(order.status)
                    ? { border: 'border-l-[#8A2BE2]', accent: 'text-[#C77DFF]', dot: 'bg-[#8A2BE2]', badge: 'bg-[#8A2BE2]/10 border-[#8A2BE2]/25 text-[#C77DFF]', wash: 'from-[#8A2BE2]/[0.14] via-[#8A2BE2]/[0.03] to-transparent' }
                  : ['rejected', 'cancelled', 'revoked'].includes(order.status)
                      ? { border: 'border-l-red-400', accent: 'text-red-300', dot: 'bg-red-400', badge: 'bg-red-400/10 border-red-300/20 text-red-300', wash: 'from-red-400/[0.10] via-red-400/[0.02] to-transparent' }
                      : { border: 'border-l-gray-600', accent: 'text-gray-300', dot: 'bg-gray-500', badge: 'bg-white/5 border-white/10 text-gray-300', wash: 'from-white/[0.06] via-white/[0.015] to-transparent' };

              return (
                <article key={order.id} className={`group relative overflow-hidden rounded-[2rem] border border-white/[0.06] border-l-2 bg-[#0B0B12]/80 p-4 backdrop-blur-sm transition hover:border-white/10 hover:bg-[#111116] sm:p-5 ${statusVisual.border}`}>
                  <div className={`pointer-events-none absolute inset-y-0 left-0 z-0 w-1/2 bg-gradient-to-r ${statusVisual.wash} opacity-80`} />
                  <button type="button" onClick={() => setExpandedOrderId((current) => current === order.id ? null : order.id)} className="relative z-10 flex w-full items-center gap-4 text-left" aria-expanded={expanded}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-base font-display font-black uppercase italic tracking-tight text-white sm:text-lg">{order.product_name}</h3>
                        <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-widest ${statusVisual.badge}`}><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusVisual.dot}`} /><span className="truncate">{statusLabels[order.status] || order.status}</span></span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-medium uppercase tracking-wider text-gray-600">
                        <span>{formatDate(order.created_at)}</span>
                        {order.provider_name && <span>{order.provider_name}</span>}
                        {operator && order.beneficiary_email && <span>{order.beneficiary_name || order.beneficiary_email}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className={`text-sm font-black sm:text-base ${statusVisual.accent}`}>{formatMoney(order.price, order.currency)}</span>
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/5 bg-white/[0.03] text-gray-500 transition group-hover:text-white"><ChevronDown className={`h-4 w-4 transition-transform duration-300 ${expanded ? 'rotate-180 text-white' : ''}`} /></span>
                    </div>
                  </button>

                  {expanded && (
                  <div className="relative z-10 mt-4 animate-in fade-in slide-in-from-top-1 border-t border-white/5 pt-4 duration-200">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      {operator && needsBeneficiaryLicense && (
                        <p className="mt-3 inline-flex items-center gap-2 text-xs text-amber-300"><ShieldAlert className="h-4 w-4" /> Aguardando o cliente ativar a licença gratuita antes da aprovação.</p>
                      )}
                      {canActivateFreeLicense && (
                        <p className="mt-3 inline-flex items-center gap-2 text-xs text-amber-200"><KeyRound className="h-4 w-4" /> Ative sua licença gratuita para que o parceiro possa solicitar sua aprovação. Isso não instala o sistema nem exige upgrade.</p>
                      )}
                      {!operator && order.status === 'paid' && !canActivateFreeLicense && (
                        <p className="mt-3 inline-flex items-center gap-2 text-xs text-amber-200"><Clock3 className="h-4 w-4" /> O prestador está preparando sua autorização. Você será avisado quando puder autorizar.</p>
                      )}
                      {emailDeliveryLabel && (
                        <p className={`mt-3 inline-flex items-center gap-2 text-xs ${emailDeliveryLabel.tone}`}>
                          <RefreshCw className="h-4 w-4" /> {emailDeliveryLabel.label}
                        </p>
                      )}
                      {supportRequest && (
                        <div className="mt-4 max-w-2xl rounded-xl border border-white/5 bg-[#07070F] p-3 text-xs text-sky-100/90">
                          <div className="flex items-center gap-2 font-bold text-sky-200"><MessageCircleMore className="h-4 w-4" /> {supportStatusLabels[supportRequest.status] || 'Atendimento atualizado'}</div>
                          <p className="mt-2 leading-relaxed text-sky-100/75">{supportRequest.message}</p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 border-t border-white/5 pt-3 xl:max-w-xl xl:justify-end xl:border-t-0 xl:pt-0">
                      {canActivateFreeLicense && (
                        <button type="button" onClick={() => navigate('/activate/setup?tab=license')} className="action-button bg-amber-300 text-amber-950 hover:bg-amber-200">
                          <KeyRound className="h-4 w-4" /> Ativar licença gratuita
                        </button>
                      )}
                      {operator && order.status === 'paid' && !needsBeneficiaryLicense && (
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
                      {canRequestSupport && (
                        <button disabled={busy} onClick={() => { setSupportMessage(''); setSupportRequestOrder(order); }} className="action-button bg-sky-300/15 text-sky-100 hover:bg-sky-300/25">
                          <MessageCircleMore className="h-4 w-4" /> Preciso de ajuda
                        </button>
                      )}
                      {canAcknowledgeSupport && (
                        <button disabled={busy} onClick={() => void runOrderAction(order, 'acknowledge_support')} className="action-button bg-sky-300 text-sky-950 hover:bg-sky-200">
                          <MessageCircleMore className="h-4 w-4" /> Assumir atendimento
                        </button>
                      )}
                      {canResolveSupport && (
                        <button disabled={busy} onClick={() => void runOrderAction(order, 'resolve_support')} className="action-button bg-white/10 text-sky-100 hover:bg-white/15">
                          <CheckCircle2 className="h-4 w-4" /> Concluir atendimento
                        </button>
                      )}
                      {canAssign && isPlatformOwner && (
                        <select value={providerSelection[order.id] || ''} onChange={(event) => setProviderSelection((current) => ({ ...current, [order.id]: event.target.value }))} className="rounded-xl border border-white/5 bg-[#07070F] px-3 py-2 text-xs text-gray-300 outline-none focus:border-[#8A2BE2]/40">
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
                      {canRetryFailedEmails && <button disabled={busy} onClick={() => void runOrderAction(order, 'retry_failed_emails')} className="action-button bg-amber-300 text-amber-950 hover:bg-amber-200"><RefreshCw className="h-4 w-4" /> Reprocessar e-mails</button>}
                      {canCancel && <button disabled={busy} onClick={() => void runOrderAction(order, 'cancel')} className="action-button bg-white/5 text-gray-300 hover:bg-white/10">Cancelar</button>}
                      {canCancelRequest && <button disabled={busy} onClick={() => setConsentRevocationOrder(order)} className="action-button bg-red-400/15 text-red-200 hover:bg-red-400/25"><ShieldAlert className="h-4 w-4" /> Cancelar solicitação</button>}
                      {canRevoke && <button disabled={busy} onClick={() => setConsentRevocationOrder(order)} className="action-button bg-red-400/15 text-red-200 hover:bg-red-400/25"><ShieldAlert className="h-4 w-4" /> Cancelar instalação</button>}
                    </div>
                  </div>
                  {operator && order.status === 'in_progress' && !order.installation_ready && (
                    <p className="mt-4 inline-flex items-center gap-2 text-xs text-amber-300"><ShieldAlert className="h-4 w-4" /> Conclua a instalacao segura antes de encerrar este servico.</p>
                  )}
                  {operator && order.installation_ready && (
                    <p className="mt-4 inline-flex items-center gap-2 text-xs text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Instalacao vinculada com seguranca a esta ordem.</p>
                  )}
                  {installationAccess && (
                    <div className="mt-5 rounded-2xl border border-[#8A2BE2]/20 bg-[#07070F] p-4">
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
                      <input readOnly value={installationAccess.url} className="mt-3 w-full rounded-xl border border-white/5 bg-[#05050A] px-3 py-2 text-xs text-violet-100 outline-none" />
                    </div>
                  )}
                  </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {!loading && filteredOrders.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-white/10 pt-3 text-[10px] font-bold uppercase tracking-widest text-gray-500 sm:flex-row sm:items-center sm:justify-between">
          <span>Mostrando {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filteredOrders.length)} de {filteredOrders.length}</span>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} aria-label="Página anterior" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/5 bg-[#07070F] text-gray-500 transition hover:border-white/10 hover:bg-[#15151e] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
            <span className="min-w-20 text-center text-gray-300">Pagina {page} / {totalPages}</span>
            <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages} aria-label="Proxima pagina" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/5 bg-[#07070F] text-gray-500 transition hover:border-white/10 hover:bg-[#15151e] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {supportRequestOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="support-request-title" className="w-full max-w-lg rounded-[2rem] border border-sky-300/20 bg-[#11111a] p-6 shadow-2xl shadow-black/60 sm:p-7">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-300/10 text-sky-200"><MessageCircleMore className="h-6 w-6" /></div>
            <h3 id="support-request-title" className="mt-5 text-xl font-display font-black uppercase italic text-white">Solicitar atendimento</h3>
            <p className="mt-3 text-sm leading-relaxed text-gray-300">Descreva sua dúvida sobre este serviço. O pedido será enviado ao prestador responsável e ficará registrado no Portal.</p>
            <textarea
              value={supportMessage}
              onChange={(event) => setSupportMessage(event.target.value.slice(0, 1200))}
              minLength={10}
              maxLength={1200}
              rows={5}
              placeholder="Ex.: Tenho uma dúvida sobre os próximos passos da instalação."
              className="mt-5 w-full resize-y rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-sky-300/50"
            />
            <p className="mt-2 text-right text-[10px] font-bold text-gray-500">{supportMessage.trim().length}/1200</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => { setSupportRequestOrder(null); setSupportMessage(''); }} className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-200 transition hover:bg-white/10">Voltar</button>
              <button type="button" onClick={() => void submitSupportRequest()} className="rounded-xl bg-sky-300 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-sky-950 transition hover:bg-sky-200">Enviar pedido</button>
            </div>
          </section>
        </div>
      )}

      {consentRevocationOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="cancel-installation-title" className="w-full max-w-md rounded-[2rem] border border-red-400/20 bg-[#11111a] p-6 shadow-2xl shadow-black/60 sm:p-7">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-400/10 text-red-200"><ShieldAlert className="h-6 w-6" /></div>
            <h3 id="cancel-installation-title" className="mt-5 text-xl font-display font-black uppercase italic text-white">Confirmar cancelamento da instalação</h3>
            <p className="mt-3 text-sm leading-relaxed text-gray-300">
              {['paid', 'awaiting_client_approval'].includes(consentRevocationOrder.status)
                ? 'Tem certeza que deseja cancelar esta instalação? Ela não será iniciada. O pagamento não será reembolsado automaticamente, e o proprietário poderá enviar uma nova aprovação depois, sem nova cobrança.'
                : 'Tem certeza que deseja cancelar esta instalação? Isso cancela sua autorização e interrompe o acesso operacional pendente. O pagamento não será reembolsado automaticamente, e a instalação só poderá continuar após uma nova aprovação.'}
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => setConsentRevocationOrder(null)} className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-200 transition hover:bg-white/10">Voltar</button>
              <button type="button" onClick={() => void confirmConsentRevocation()} className="rounded-xl bg-red-400 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-red-950 transition hover:bg-red-300">Sim, cancelar instalação</button>
            </div>
          </section>
        </div>
      )}

      <style>{`.action-button{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;min-height:34px;border:1px solid rgba(255,255,255,.05);border-radius:.75rem;padding:.55rem .75rem;background-color:#07070F!important;color:#A1A7B3!important;font-size:.6rem;font-weight:900;letter-spacing:.06em;text-transform:uppercase;transition:all .2s}.action-button:hover{border-color:rgba(255,255,255,.12);background-color:#15151e!important;color:#fff!important}.action-button[class*="bg-primary"],.action-button[class*="bg-blue-"]{border-color:#8A2BE2!important;background-color:rgba(138,43,226,.16)!important;color:#C77DFF!important}.action-button[class*="bg-sky-"],.action-button[class*="bg-emerald-"]{border-color:rgba(16,185,129,.25)!important;background-color:rgba(16,185,129,.12)!important;color:#6EE7B7!important}.action-button[class*="bg-amber-"],.action-button[class*="bg-violet-"]{border-color:rgba(138,43,226,.25)!important;background-color:rgba(138,43,226,.12)!important;color:#C77DFF!important}.action-button[class*="bg-red-"]{border-color:rgba(248,113,113,.22)!important;background-color:rgba(248,113,113,.1)!important;color:#FDA4AF!important}.action-button:disabled{cursor:not-allowed;opacity:.5}`}</style>
    </div>
  );
};
