import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { centralSupabase } from '../../services/centralClient';

type ApprovalOrder = {
  id: string;
  product_name: string;
  service_type: string;
  price: number;
  currency: string;
  expires_at: string;
};

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency || 'BRL' }).format(value || 0);
  } catch {
    return `${currency || 'BRL'} ${Number(value || 0).toFixed(2)}`;
  }
}

async function invokeApproval(action: 'inspect_approval' | 'decide_approval' | 'inspect_approval_session' | 'decide_approval_session', body: Record<string, unknown>) {
  const { data, error } = await centralSupabase.functions.invoke('service-orders', { body: { action, ...body } });
  if (error) {
    try {
      const details = await (error as any).context?.json();
      throw new Error(details?.error || 'Solicitação indisponível.');
    } catch (nestedError) {
      if (nestedError instanceof Error) throw nestedError;
      throw new Error('Solicitação indisponível.');
    }
  }
  if (!data || data.error) throw new Error(data?.error || 'Solicitação indisponível.');
  return data;
}

export const ServiceApproval: React.FC = () => {
  const { orderId = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const [order, setOrder] = useState<ApprovalOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [approved, setApproved] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!orderId) {
        if (active) {
          setMessage('Este link de aprovação está incompleto.');
          setLoading(false);
        }
        return;
      }
      try {
        const result = await invokeApproval(token ? 'inspect_approval' : 'inspect_approval_session', {
          order_id: orderId,
          ...(token ? { token } : {}),
        });
        if (active) setOrder(result.order || null);
      } catch (error: any) {
        if (active) setMessage(error?.message || 'Este link expirou ou já foi utilizado.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [orderId, token]);

  const decide = async (decision: 'approve' | 'reject') => {
    if (!order || submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await invokeApproval(token ? 'decide_approval' : 'decide_approval_session', {
        order_id: order.id,
        ...(token ? { token } : {}),
        decision,
      });
      setApproved(decision === 'approve');
      setMessage(decision === 'approve'
        ? 'A instalação foi autorizada. Você poderá acompanhar o andamento no Portal.'
        : 'A solicitação foi recusada. Nenhum acesso será liberado ao prestador.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível registrar sua decisão.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#05050A] px-5 py-10 text-white sm:px-8">
      <div className="mx-auto flex min-h-[80vh] max-w-xl items-center">
        <section className="w-full overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] p-7 shadow-2xl shadow-black/40 sm:p-10">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-primary"><ShieldCheck className="h-6 w-6" /></div>
            <div><p className="text-[10px] font-black uppercase tracking-[0.28em] text-primary">Super Checkout</p><h1 className="font-display text-2xl font-black uppercase italic tracking-tight">Aprovação de serviço</h1></div>
          </div>

          {loading ? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-gray-400"><Loader2 className="h-7 w-7 animate-spin text-primary" /><span className="text-[10px] font-black uppercase tracking-widest">Validando link seguro</span></div>
          ) : message && !order ? (
            <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-5 text-sm leading-relaxed text-red-100">{message}</div>
          ) : order ? (
            <div className="space-y-6">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">Solicitação</p>
                <h2 className="mt-2 text-xl font-display font-black uppercase italic text-white">{order.product_name}</h2>
                <p className="mt-3 text-sm leading-relaxed text-gray-400">Ao aprovar, você autoriza o prestador designado a executar a instalação exclusivamente na sua licença. Este consentimento pode ser revogado no Portal.</p>
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500"><span>{formatMoney(order.price, order.currency)}</span><span>Expira em {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(order.expires_at))}</span></div>
              </div>

              {message && (
                <div className={`rounded-2xl border p-5 text-sm leading-relaxed ${approved === false ? 'border-red-400/20 bg-red-400/10 text-red-100' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'}`}>
                  {approved === true ? <CheckCircle2 className="mb-3 h-6 w-6" /> : approved === false ? <XCircle className="mb-3 h-6 w-6" /> : null}
                  {message}
                </div>
              )}

              {approved === null ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <button type="button" disabled={submitting} onClick={() => void decide('reject')} className="rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-4 text-[11px] font-black uppercase tracking-widest text-red-100 transition hover:bg-red-400/20 disabled:opacity-50">Recusar</button>
                  <button type="button" disabled={submitting} onClick={() => void decide('approve')} className="rounded-xl bg-primary px-4 py-4 text-[11px] font-black uppercase tracking-widest text-white transition hover:bg-primary/80 disabled:opacity-50">{submitting ? 'Registrando...' : 'Autorizar serviço'}</button>
                </div>
              ) : (
        <button type="button" onClick={() => navigate('/activate/setup?tab=services')} className="w-full rounded-xl bg-white px-4 py-4 text-[11px] font-black uppercase tracking-widest text-black transition hover:bg-gray-200">Abrir Portal</button>
              )}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
};
