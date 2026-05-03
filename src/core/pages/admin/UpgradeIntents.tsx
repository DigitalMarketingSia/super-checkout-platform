import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Copy,
  ExternalLink,
  Filter,
  Link2,
  RefreshCw,
  Search,
  ShieldCheck,
  TimerOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { Layout } from '../../components/Layout';
import { Button } from '../../components/ui/Button';
import { buildPlatformUrl, platformUrls } from '../../config/platformUrls';
import { licenseService, UpgradeIntentRow } from '../../services/licenseService';

const statusMeta: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  attention: { label: 'Atencao', className: 'text-red-300 bg-red-500/10 border-red-500/20', icon: AlertCircle },
  created: { label: 'Criado', className: 'text-sky-300 bg-sky-500/10 border-sky-500/20', icon: Clock },
  opened: { label: 'Aberto', className: 'text-blue-300 bg-blue-500/10 border-blue-500/20', icon: Link2 },
  paid: { label: 'Pago', className: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20', icon: CheckCircle },
  consumed: { label: 'Consumido', className: 'text-green-300 bg-green-500/10 border-green-500/20', icon: ShieldCheck },
  expired: { label: 'Expirado', className: 'text-amber-300 bg-amber-500/10 border-amber-500/20', icon: TimerOff },
  canceled: { label: 'Cancelado', className: 'text-zinc-300 bg-zinc-500/10 border-zinc-500/20', icon: AlertCircle },
  failed: { label: 'Falhou', className: 'text-red-300 bg-red-500/10 border-red-500/20', icon: AlertCircle },
};

const statusOptions = ['all', 'attention', 'created', 'opened', 'paid', 'consumed', 'expired', 'failed'];

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function shortToken(token?: string | null) {
  if (!token) return '-';
  return `${token.slice(0, 8)}...${token.slice(-6)}`;
}

function getIntentState(intent: UpgradeIntentRow) {
  const status = String(intent.status || 'created').toLowerCase();
  if (needsManualReview(intent)) return 'attention';
  if (intent.consumed_at || status === 'consumed') return 'consumed';
  if (intent.paid_order_id || intent.paid_at || status === 'paid') return 'paid';
  return status;
}

function needsManualReview(intent: UpgradeIntentRow) {
  const status = String(intent.status || '').toLowerCase();
  if (intent.failure_reason) return true;
  if (status === 'failed') return true;
  if (intent.paid_order_id && !intent.consumed_at && status !== 'consumed') return true;
  if (status === 'expired' && intent.paid_order_id) return true;
  return false;
}

function buildCheckoutLink(intent: UpgradeIntentRow) {
  if (!intent.checkout_id || !intent.token) return '';
  return buildPlatformUrl(platformUrls.portal, `/c/${intent.checkout_id}`, {
    upgrade_intent: intent.token,
  });
}

export const UpgradeIntents = () => {
  const [intents, setIntents] = useState<UpgradeIntentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');

  const loadIntents = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await licenseService.listUpgradeIntents({
        status: status === 'attention' ? 'all' : status,
        search,
        limit: 100,
      });
      setIntents(data);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar upgrade intents.');
      setIntents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(loadIntents, 250);
    return () => window.clearTimeout(timer);
  }, [status, search]);

  const stats = useMemo(() => {
    return intents.reduce(
      (acc, intent) => {
        const state = getIntentState(intent);
        acc.total += 1;
        if (state === 'attention') acc.attention += 1;
        if (state === 'consumed') acc.consumed += 1;
        if (state === 'expired') acc.expired += 1;
        if (state === 'created' || state === 'opened') acc.open += 1;
        return acc;
      },
      { total: 0, attention: 0, consumed: 0, expired: 0, open: 0 },
    );
  }, [intents]);

  const visibleIntents = useMemo(() => {
    if (status !== 'attention') return intents;
    return intents.filter(needsManualReview);
  }, [intents, status]);

  const copyText = async (value: string, label: string) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copiado.`);
  };

  const copyReconciliationPacket = async (intent: UpgradeIntentRow) => {
    const packet = {
      token: intent.token,
      status: intent.status,
      paid_order_id: intent.paid_order_id,
      paid_at: intent.paid_at,
      failure_reason: intent.failure_reason,
      target_user_id: intent.target_user_id,
      target_account_id: intent.target_account_id,
      target_license_key: intent.target_license_key,
      target_plan_slug: intent.target_plan_slug,
      payer_email_snapshot: intent.payer_email_snapshot,
      checkout_id: intent.checkout_id,
      source_surface: intent.source_surface,
      source_context: intent.source_context,
    };

    await copyText(JSON.stringify(packet, null, 2), 'Pacote de conciliacao');
  };

  return (
    <Layout maxWidth="max-w-full">
      <div className="space-y-6">
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-5">
          <div>
            <div className="flex items-center gap-3 text-primary text-[10px] font-black uppercase tracking-[0.28em] mb-3">
              <ShieldCheck className="w-4 h-4" />
              Upgrade Intent Registry
            </div>
            <h1 className="text-3xl xl:text-5xl font-portal-display text-white italic tracking-tighter uppercase">
              Intents de Upgrade
            </h1>
          </div>

          <Button onClick={loadIntents} isLoading={loading} className="h-11 px-5">
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </Button>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
          {[
            ['Total', stats.total],
            ['Abertos', stats.open],
            ['Consumidos', stats.consumed],
            ['Atencao', stats.attention],
            ['Expirados', stats.expired],
          ].map(([label, value]) => (
            <div key={label} className="border border-white/10 bg-white/[0.03] rounded-lg p-4">
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.22em]">{label}</p>
              <p className="text-2xl font-black text-white mt-1">{value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por token, e-mail, pedido, licenca ou plano"
              className="w-full h-12 bg-black/40 border border-white/10 rounded-lg pl-11 pr-4 text-sm text-white placeholder:text-gray-600 outline-none focus:border-primary/50"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto">
            <Filter className="w-4 h-4 text-gray-600 shrink-0" />
            {statusOptions.map((option) => (
              <button
                key={option}
                onClick={() => setStatus(option)}
                className={`h-10 px-4 rounded-lg border text-[10px] font-black uppercase tracking-[0.18em] transition-colors ${
                  status === option
                    ? 'bg-primary/20 text-white border-primary/40'
                    : 'bg-white/[0.03] text-gray-500 border-white/10 hover:text-white'
                }`}
              >
                {option === 'all' ? 'Todos' : statusMeta[option]?.label || option}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="border border-red-500/20 bg-red-500/10 text-red-200 rounded-lg p-4 text-sm">
            {error}
          </div>
        )}

        <div className="border border-white/10 rounded-lg overflow-hidden bg-black/20">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left">
              <thead className="bg-white/[0.03] border-b border-white/10">
                <tr>
                  {['Status', 'Token', 'Plano', 'Pagador', 'Pedido', 'Origem', 'Criado', 'Expira', 'Acoes'].map((head) => (
                    <th key={head} className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-500 text-sm">
                      Carregando intents...
                    </td>
                  </tr>
                ) : visibleIntents.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-500 text-sm">
                      Nenhum intent encontrado.
                    </td>
                  </tr>
                ) : (
                  visibleIntents.map((intent) => {
                    const state = getIntentState(intent);
                    const meta = statusMeta[state] || statusMeta.created;
                    const Icon = meta.icon;
                    const checkoutLink = buildCheckoutLink(intent);
                    const reviewRequired = needsManualReview(intent);

                    return (
                      <tr key={intent.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-[0.18em] ${meta.className}`}>
                            <Icon className="w-3 h-3" />
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <button
                            onClick={() => copyText(intent.token, 'Token')}
                            className="font-mono text-xs text-white hover:text-primary flex items-center gap-2"
                          >
                            {shortToken(intent.token)}
                            <Copy className="w-3 h-3" />
                          </button>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-300">{intent.target_plan_slug || '-'}</td>
                        <td className="px-4 py-4 text-sm text-gray-300">{intent.payer_email_snapshot || '-'}</td>
                        <td className="px-4 py-4">
                          {intent.paid_order_id ? (
                            <button
                              onClick={() => copyText(intent.paid_order_id || '', 'Pedido')}
                              className="font-mono text-xs text-emerald-300 hover:text-emerald-200 flex items-center gap-2"
                            >
                              {intent.paid_order_id.slice(0, 8)}
                              <Copy className="w-3 h-3" />
                            </button>
                          ) : (
                            <span className="text-gray-600">-</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-300">{intent.source_surface || '-'}</td>
                        <td className="px-4 py-4 text-xs text-gray-400">{formatDate(intent.created_at)}</td>
                        <td className="px-4 py-4 text-xs text-gray-400">{formatDate(intent.expires_at)}</td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            {checkoutLink && (
                              <button
                                onClick={() => copyText(checkoutLink, 'Link')}
                                className="w-9 h-9 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 flex items-center justify-center"
                                title="Copiar link do checkout"
                              >
                                <Link2 className="w-4 h-4" />
                              </button>
                            )}
                            {reviewRequired && (
                              <button
                                onClick={() => copyReconciliationPacket(intent)}
                                className="w-9 h-9 rounded-lg border border-red-500/20 text-red-300 hover:text-white hover:bg-red-500/10 flex items-center justify-center"
                                title="Copiar pacote de conciliacao"
                              >
                                <AlertCircle className="w-4 h-4" />
                              </button>
                            )}
                            {checkoutLink && (
                              <a
                                href={checkoutLink}
                                target="_blank"
                                rel="noreferrer"
                                className="w-9 h-9 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 flex items-center justify-center"
                                title="Abrir link"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
};
