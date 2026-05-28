import React, { useEffect, useMemo, useState } from 'react';
import {
  Clock3,
  Database,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Layout } from '../../components/Layout';
import { Button } from '../../components/ui/Button';
import { privacyOpsService } from '../../services/privacyOpsService';
import type {
  DataRetentionPolicy,
  PrivacyDashboardSnapshot,
  PrivacyRequest,
  PrivacyRequestStatus,
  PrivacyRequestType,
} from '../../types';

const REQUEST_TYPE_LABELS: Record<PrivacyRequestType, string> = {
  access: 'Acesso',
  correction: 'Correcao',
  deletion: 'Exclusao',
  anonymization: 'Anonimizacao',
  objection: 'Oposicao',
  portability: 'Portabilidade',
  revocation: 'Revogacao',
};

const STATUS_LABELS: Record<PrivacyRequestStatus, string> = {
  open: 'Aberta',
  in_review: 'Em analise',
  fulfilled: 'Concluida',
  rejected: 'Recusada',
};

const formatDateTime = (value?: string | null) => {
  if (!value) return 'nao informado';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'nao informado';
  return date.toLocaleString('pt-BR');
};

const downloadJson = (fileName: string, payload: unknown) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const PrivacyCenter = () => {
  const [dashboard, setDashboard] = useState<PrivacyDashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [runningCleanup, setRunningCleanup] = useState<string | null>(null);
  const [requestForm, setRequestForm] = useState({
    requestType: 'access' as PrivacyRequestType,
    subjectEmail: '',
    subjectName: '',
    subjectPhone: '',
    subjectDocument: '',
    notes: '',
  });
  const [requestDrafts, setRequestDrafts] = useState<Record<string, { status: PrivacyRequestStatus; resolutionNotes: string }>>({});
  const [policyDrafts, setPolicyDrafts] = useState<Record<string, { retentionDays: number; active: boolean; notes: string }>>({});

  const refresh = async () => {
    setLoading(true);
    try {
      const nextDashboard = await privacyOpsService.getDashboard();
      setDashboard(nextDashboard);
      setRequestDrafts(
        Object.fromEntries(
          nextDashboard.requests.map((request) => [
            request.id,
            {
              status: request.status,
              resolutionNotes: request.resolution_notes || '',
            },
          ]),
        ),
      );
      setPolicyDrafts(
        Object.fromEntries(
          nextDashboard.policies.map((policy) => [
            policy.id,
            {
              retentionDays: policy.retention_days,
              active: policy.active,
              notes: policy.notes || '',
            },
          ]),
        ),
      );
    } catch (error: any) {
      toast.error(error?.message || 'Falha ao carregar o centro de privacidade.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const summary = useMemo(() => {
    const requests = dashboard?.requests || [];
    const policies = dashboard?.policies || [];
    const runs = dashboard?.runs || [];
    return {
      openRequests: requests.filter((request) => request.status === 'open' || request.status === 'in_review').length,
      totalRequests: requests.length,
      activePolicies: policies.filter((policy) => policy.active).length,
      lastCleanupAt: runs[0]?.created_at || null,
    };
  }, [dashboard]);

  const handleCreateRequest = async () => {
    setSubmitting(true);
    try {
      await privacyOpsService.createRequest({
        accountId: dashboard?.scope_account_id || null,
        requestType: requestForm.requestType,
        subjectEmail: requestForm.subjectEmail,
        subjectName: requestForm.subjectName,
        subjectPhone: requestForm.subjectPhone,
        subjectDocument: requestForm.subjectDocument,
        notes: requestForm.notes,
      });
      toast.success('Solicitacao registrada.');
      setRequestForm({
        requestType: 'access',
        subjectEmail: '',
        subjectName: '',
        subjectPhone: '',
        subjectDocument: '',
        notes: '',
      });
      await refresh();
    } catch (error: any) {
      toast.error(error?.message || 'Nao foi possivel registrar a solicitacao.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = async () => {
    if (!requestForm.subjectEmail.trim()) {
      toast.error('Informe o e-mail do titular para exportar.');
      return;
    }

    setExporting(true);
    try {
      const payload = await privacyOpsService.exportSubject(requestForm.subjectEmail);
      const safeEmail = requestForm.subjectEmail.toLowerCase().replace(/[^a-z0-9@._-]+/g, '-');
      downloadJson(`privacy-export-${safeEmail}.json`, payload);
      toast.success('Exportacao concluida.');
    } catch (error: any) {
      toast.error(error?.message || 'Nao foi possivel exportar os dados do titular.');
    } finally {
      setExporting(false);
    }
  };

  const handleUpdateRequest = async (request: PrivacyRequest) => {
    const draft = requestDrafts[request.id];
    if (!draft) return;

    setSubmitting(true);
    try {
      await privacyOpsService.updateRequest({
        id: request.id,
        status: draft.status,
        resolutionNotes: draft.resolutionNotes,
      });
      toast.success('Solicitacao atualizada.');
      await refresh();
    } catch (error: any) {
      toast.error(error?.message || 'Falha ao atualizar a solicitacao.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdatePolicy = async (policy: DataRetentionPolicy) => {
    const draft = policyDrafts[policy.id];
    if (!draft) return;

    setSubmitting(true);
    try {
      await privacyOpsService.updatePolicy({
        id: policy.id,
        retentionDays: draft.retentionDays,
        active: draft.active,
        notes: draft.notes,
      });
      toast.success(`Politica ${policy.table_name} atualizada.`);
      await refresh();
    } catch (error: any) {
      toast.error(error?.message || 'Falha ao salvar politica de retencao.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCleanup = async (tableName?: string) => {
    setRunningCleanup(tableName || 'all');
    try {
      const result = await privacyOpsService.runCleanup(tableName);
      const totalRows = (result.results || []).reduce((sum, run) => sum + Number(run.rows_affected || 0), 0);
      toast.success(tableName
        ? `Cleanup executado em ${tableName}. ${totalRows} linha(s) afetada(s).`
        : `Cleanup executado. ${totalRows} linha(s) afetada(s).`);
      await refresh();
    } catch (error: any) {
      toast.error(error?.message || 'Falha ao executar cleanup.');
    } finally {
      setRunningCleanup(null);
    }
  };

  return (
    <Layout>
      <div className="space-y-8 pb-24">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-4xl font-portal-display text-white uppercase tracking-tight">Privacidade</h1>
                <p className="text-[10px] uppercase tracking-[0.28em] font-black text-gray-500">LGPD operacional</p>
              </div>
            </div>
            <p className="text-sm text-gray-400 max-w-3xl">
              Registre direitos do titular, exporte dados consolidados e execute retencao com trilha auditavel.
            </p>
          </div>

          <Button
            onClick={() => void refresh()}
            className="px-6 py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-white border border-white/10 font-black uppercase tracking-widest text-[10px] flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar painel
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-[2rem] border border-white/5 bg-[#0A0A15]/60 p-6">
            <p className="text-[10px] uppercase tracking-[0.25em] font-black text-gray-500">Solicitacoes abertas</p>
            <p className="mt-3 text-3xl font-black text-white">{summary.openRequests}</p>
          </div>
          <div className="rounded-[2rem] border border-white/5 bg-[#0A0A15]/60 p-6">
            <p className="text-[10px] uppercase tracking-[0.25em] font-black text-gray-500">Total registrado</p>
            <p className="mt-3 text-3xl font-black text-white">{summary.totalRequests}</p>
          </div>
          <div className="rounded-[2rem] border border-white/5 bg-[#0A0A15]/60 p-6">
            <p className="text-[10px] uppercase tracking-[0.25em] font-black text-gray-500">Politicas ativas</p>
            <p className="mt-3 text-3xl font-black text-white">{summary.activePolicies}</p>
          </div>
          <div className="rounded-[2rem] border border-white/5 bg-[#0A0A15]/60 p-6">
            <p className="text-[10px] uppercase tracking-[0.25em] font-black text-gray-500">Ultimo cleanup</p>
            <p className="mt-3 text-sm font-bold text-white">{formatDateTime(summary.lastCleanupAt)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1.4fr] gap-6">
          <section className="rounded-[2rem] border border-white/5 bg-[#0A0A15]/60 p-6 space-y-5">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-primary" />
              <div>
                <h2 className="text-lg font-bold text-white">Direitos do titular</h2>
                <p className="text-xs text-gray-500">Registro interno, exportacao e acompanhamento</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="space-y-2">
                <span className="text-[10px] uppercase tracking-[0.24em] font-black text-gray-500">Tipo</span>
                <select
                  value={requestForm.requestType}
                  onChange={(event) => setRequestForm((current) => ({ ...current, requestType: event.target.value as PrivacyRequestType }))}
                  className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-sm text-white"
                >
                  {Object.entries(REQUEST_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-[10px] uppercase tracking-[0.24em] font-black text-gray-500">E-mail do titular</span>
                <input
                  value={requestForm.subjectEmail}
                  onChange={(event) => setRequestForm((current) => ({ ...current, subjectEmail: event.target.value }))}
                  className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-sm text-white"
                  placeholder="cliente@exemplo.com"
                />
              </label>

              <label className="space-y-2">
                <span className="text-[10px] uppercase tracking-[0.24em] font-black text-gray-500">Nome</span>
                <input
                  value={requestForm.subjectName}
                  onChange={(event) => setRequestForm((current) => ({ ...current, subjectName: event.target.value }))}
                  className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-sm text-white"
                  placeholder="Nome do titular"
                />
              </label>

              <label className="space-y-2">
                <span className="text-[10px] uppercase tracking-[0.24em] font-black text-gray-500">Telefone</span>
                <input
                  value={requestForm.subjectPhone}
                  onChange={(event) => setRequestForm((current) => ({ ...current, subjectPhone: event.target.value }))}
                  className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-sm text-white"
                  placeholder="Opcional"
                />
              </label>

              <label className="space-y-2 sm:col-span-2">
                <span className="text-[10px] uppercase tracking-[0.24em] font-black text-gray-500">Documento</span>
                <input
                  value={requestForm.subjectDocument}
                  onChange={(event) => setRequestForm((current) => ({ ...current, subjectDocument: event.target.value }))}
                  className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-sm text-white"
                  placeholder="Opcional"
                />
              </label>

              <label className="space-y-2 sm:col-span-2">
                <span className="text-[10px] uppercase tracking-[0.24em] font-black text-gray-500">Notas internas</span>
                <textarea
                  value={requestForm.notes}
                  onChange={(event) => setRequestForm((current) => ({ ...current, notes: event.target.value }))}
                  className="min-h-[120px] w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-sm text-white"
                  placeholder="Contexto, canal de contato e evidencias recebidas."
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => void handleCreateRequest()}
                disabled={submitting || !dashboard?.scope_account_id}
                className="px-6 py-3 rounded-2xl bg-primary text-white border-none font-black uppercase tracking-widest text-[10px] flex items-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Registrar solicitacao
              </Button>
              <Button
                onClick={() => void handleExport()}
                disabled={exporting}
                className="px-6 py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-white border border-white/10 font-black uppercase tracking-widest text-[10px] flex items-center gap-2"
              >
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Exportar titular
              </Button>
            </div>

            {!dashboard?.scope_account_id && (
              <p className="text-xs text-amber-300">
                O painel nao conseguiu resolver uma conta unica para vincular novas solicitacoes. Revise a sessao ou a configuracao da instalacao.
              </p>
            )}
          </section>

          <section className="rounded-[2rem] border border-white/5 bg-[#0A0A15]/60 p-6 space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Clock3 className="w-5 h-5 text-primary" />
                <div>
                  <h2 className="text-lg font-bold text-white">Fila de atendimento</h2>
                  <p className="text-xs text-gray-500">Solicitacoes recentes do titular</p>
                </div>
              </div>
            </div>

            <div className="space-y-4 max-h-[720px] overflow-y-auto pr-1">
              {(dashboard?.requests || []).map((request) => {
                const draft = requestDrafts[request.id] || {
                  status: request.status,
                  resolutionNotes: request.resolution_notes || '',
                };

                return (
                  <div key={request.id} className="rounded-2xl border border-white/5 bg-black/20 p-4 space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.24em] text-primary">
                          {REQUEST_TYPE_LABELS[request.request_type]}
                        </p>
                        <h3 className="text-lg font-bold text-white mt-1">{request.subject_email}</h3>
                        <p className="text-xs text-gray-500 mt-1">
                          Criada em {formatDateTime(request.created_at)}{request.subject_name ? ` • ${request.subject_name}` : ''}
                        </p>
                      </div>

                      <div className="min-w-[180px]">
                        <select
                          value={draft.status}
                          onChange={(event) => setRequestDrafts((current) => ({
                            ...current,
                            [request.id]: {
                              ...draft,
                              status: event.target.value as PrivacyRequestStatus,
                            },
                          }))}
                          className="w-full rounded-xl bg-[#101018] border border-white/10 px-4 py-3 text-sm text-white"
                        >
                          {Object.entries(STATUS_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-300">
                      <div><span className="text-gray-500">Telefone:</span> {request.subject_phone || 'nao informado'}</div>
                      <div><span className="text-gray-500">Documento:</span> {request.subject_document || 'nao informado'}</div>
                      <div className="md:col-span-2"><span className="text-gray-500">Notas:</span> {request.notes || 'sem contexto adicional'}</div>
                    </div>

                    <textarea
                      value={draft.resolutionNotes}
                      onChange={(event) => setRequestDrafts((current) => ({
                        ...current,
                        [request.id]: {
                          ...draft,
                          resolutionNotes: event.target.value,
                        },
                      }))}
                      className="min-h-[110px] w-full rounded-xl bg-[#101018] border border-white/10 px-4 py-3 text-sm text-white"
                      placeholder="Documente decisao, resposta enviada e evidencias."
                    />

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-gray-500">
                        Status atual: <span className="text-white font-bold">{STATUS_LABELS[request.status]}</span>
                        {request.fulfilled_at ? ` • concluida em ${formatDateTime(request.fulfilled_at)}` : ''}
                      </p>
                      <Button
                        onClick={() => void handleUpdateRequest(request)}
                        disabled={submitting}
                        className="px-5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white border border-white/10 font-black uppercase tracking-widest text-[10px] flex items-center gap-2"
                      >
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Salvar
                      </Button>
                    </div>
                  </div>
                );
              })}

              {!loading && (dashboard?.requests || []).length === 0 && (
                <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-gray-500">
                  Nenhuma solicitacao registrada nesta instalacao.
                </div>
              )}
            </div>
          </section>
        </div>

        <section className="rounded-[2rem] border border-white/5 bg-[#0A0A15]/60 p-6 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div className="flex items-center gap-3">
              <Database className="w-5 h-5 text-primary" />
              <div>
                <h2 className="text-lg font-bold text-white">Retencao e purge</h2>
                <p className="text-xs text-gray-500">Politicas operacionais com execucao manual e registro server-side</p>
              </div>
            </div>

            <Button
              onClick={() => void handleCleanup()}
              disabled={runningCleanup !== null}
              className="px-6 py-3 rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/20 font-black uppercase tracking-widest text-[10px] flex items-center gap-2"
            >
              {runningCleanup === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Executar cleanup geral
            </Button>
          </div>

          <div className="space-y-4">
            {(dashboard?.policies || []).map((policy) => {
              const draft = policyDrafts[policy.id] || {
                retentionDays: policy.retention_days,
                active: policy.active,
                notes: policy.notes || '',
              };

              return (
                <div key={policy.id} className="rounded-2xl border border-white/5 bg-black/20 p-4 grid grid-cols-1 xl:grid-cols-[1.2fr_160px_160px_1fr_auto] gap-4 items-start">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.24em] text-primary">{policy.table_name}</p>
                    <p className="text-sm text-gray-400 mt-2">{policy.notes || 'Sem observacao operacional.'}</p>
                  </div>

                  <label className="space-y-2">
                    <span className="text-[10px] uppercase tracking-[0.24em] font-black text-gray-500">Dias</span>
                    <input
                      type="number"
                      min={1}
                      value={draft.retentionDays}
                      onChange={(event) => setPolicyDrafts((current) => ({
                        ...current,
                        [policy.id]: {
                          ...draft,
                          retentionDays: Number(event.target.value || 0),
                        },
                      }))}
                      className="w-full rounded-xl bg-[#101018] border border-white/10 px-4 py-3 text-sm text-white"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-[10px] uppercase tracking-[0.24em] font-black text-gray-500">Ativa</span>
                    <label className="flex items-center gap-3 rounded-xl bg-[#101018] border border-white/10 px-4 py-3 text-sm text-white">
                      <input
                        type="checkbox"
                        checked={draft.active}
                        onChange={(event) => setPolicyDrafts((current) => ({
                          ...current,
                          [policy.id]: {
                            ...draft,
                            active: event.target.checked,
                          },
                        }))}
                      />
                      <span>{draft.active ? 'Sim' : 'Nao'}</span>
                    </label>
                  </label>

                  <label className="space-y-2">
                    <span className="text-[10px] uppercase tracking-[0.24em] font-black text-gray-500">Notas</span>
                    <input
                      value={draft.notes}
                      onChange={(event) => setPolicyDrafts((current) => ({
                        ...current,
                        [policy.id]: {
                          ...draft,
                          notes: event.target.value,
                        },
                      }))}
                      className="w-full rounded-xl bg-[#101018] border border-white/10 px-4 py-3 text-sm text-white"
                    />
                  </label>

                  <div className="flex flex-col gap-2">
                    <Button
                      onClick={() => void handleUpdatePolicy(policy)}
                      disabled={submitting}
                      className="px-5 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white border border-white/10 font-black uppercase tracking-widest text-[10px]"
                    >
                      Salvar
                    </Button>
                    <Button
                      onClick={() => void handleCleanup(policy.table_name)}
                      disabled={runningCleanup !== null}
                      className="px-5 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/20 font-black uppercase tracking-widest text-[10px] flex items-center gap-2"
                    >
                      {runningCleanup === policy.table_name ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      Limpar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-4 border-t border-white/5 space-y-3">
            <h3 className="text-sm font-bold text-white">Historico recente</h3>
            <div className="space-y-2">
              {(dashboard?.runs || []).slice(0, 10).map((run) => (
                <div key={run.id} className="rounded-xl border border-white/5 bg-black/20 px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-2 text-sm">
                  <div>
                    <span className="font-bold text-white">{run.table_name}</span>
                    <span className="text-gray-500"> • cutoff {formatDateTime(run.cutoff_at)}</span>
                  </div>
                  <div className="text-gray-400">
                    {run.rows_affected} linha(s) • {formatDateTime(run.created_at)}
                  </div>
                </div>
              ))}
              {!loading && (dashboard?.runs || []).length === 0 && (
                <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-gray-500">
                  Nenhum cleanup registrado ainda.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
};
