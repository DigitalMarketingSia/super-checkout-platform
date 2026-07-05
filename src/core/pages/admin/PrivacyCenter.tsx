import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  PrivacyGovernanceSnapshot,
  PrivacyDashboardSnapshot,
  PrivacyRequest,
  PrivacyRequestChannel,
  PrivacyRequestStatus,
  PrivacyRequestType,
} from '../../types';

const resolveDateLocale = (language: string) => {
  if (language.startsWith('es')) return 'es-ES';
  if (language.startsWith('en')) return 'en-US';
  return 'pt-BR';
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

type RetentionReviewSnapshot = {
  manual_review_required?: boolean;
  retention_blocked?: boolean;
  total_orders?: number;
  total_payments?: number;
  liquidated_orders?: number;
  pending_orders?: number;
  failed_or_abandoned_orders?: number;
  reviewed_at?: string;
  matrix_reference?: string;
};

type SlaSnapshot = {
  acknowledge_by?: string;
  response_due_at?: string;
  resolved_at?: string;
  final_status?: string;
  acknowledgement_business_days?: number;
  response_target_calendar_days?: number;
};

type RevocationExecutionSnapshot = {
  customer_payment_profiles_disabled?: number;
  skipped?: boolean;
  reason?: string | null;
  executed_at?: string;
};

type CorrectionRequestSnapshot = {
  target_email?: string | null;
  target_name?: string | null;
  target_phone?: string | null;
  target_document?: string | null;
  requested_fields?: string[];
  captured_at?: string;
};

type CorrectionExecutionSnapshot = {
  requested_fields?: string[];
  auto_applied_fields?: string[];
  manual_follow_up_fields?: string[];
  profiles_updated?: number;
  auth_metadata_updated?: number;
  licenses_updated?: number;
  customer_payment_profiles_updated?: number;
  skipped?: boolean;
  reason?: string | null;
  executed_at?: string;
};

type ObjectionExecutionSnapshot = {
  customer_payment_profiles_disabled?: number;
  linked_optional_processing_restricted?: boolean;
  anonymous_consent_linkable?: boolean;
  manual_follow_up_fields?: string[];
  skipped?: boolean;
  reason?: string | null;
  executed_at?: string;
};

type ExportExecutionSnapshot = {
  generated_at?: string;
  included_sections?: string[];
  counts?: Record<string, number>;
  export_notes_count?: number;
};

export const PrivacyCenter = () => {
  const { t, i18n } = useTranslation('admin');
  const [dashboard, setDashboard] = useState<PrivacyDashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingRequestId, setExportingRequestId] = useState<string | null>(null);
  const [runningCleanup, setRunningCleanup] = useState<string | null>(null);
  const [requestForm, setRequestForm] = useState({
    requestType: 'access' as PrivacyRequestType,
    requestChannel: 'admin_panel' as PrivacyRequestChannel,
    subjectEmail: '',
    subjectName: '',
    subjectPhone: '',
    subjectDocument: '',
    correctionTargetEmail: '',
    correctionTargetName: '',
    correctionTargetPhone: '',
    correctionTargetDocument: '',
    notes: '',
  });
  const [requestDrafts, setRequestDrafts] = useState<Record<string, { status: PrivacyRequestStatus; resolutionNotes: string }>>({});
  const [policyDrafts, setPolicyDrafts] = useState<Record<string, {
    retentionDays: number;
    runMode: 'delete' | 'anonymize';
    active: boolean;
    notes: string;
  }>>({});

  const dateLocale = resolveDateLocale(i18n.language);

  const requestTypeLabels: Record<PrivacyRequestType, string> = {
    access: t('privacy_center.request_types.access'),
    correction: t('privacy_center.request_types.correction'),
    deletion: t('privacy_center.request_types.deletion'),
    anonymization: t('privacy_center.request_types.anonymization'),
    objection: t('privacy_center.request_types.objection'),
    portability: t('privacy_center.request_types.portability'),
    revocation: t('privacy_center.request_types.revocation'),
  };

  const statusLabels: Record<PrivacyRequestStatus, string> = {
    open: t('privacy_center.statuses.open'),
    in_review: t('privacy_center.statuses.in_review'),
    fulfilled: t('privacy_center.statuses.fulfilled'),
    rejected: t('privacy_center.statuses.rejected'),
  };
  const runModeLabels: Record<'delete' | 'anonymize', string> = {
    delete: t('privacy_center.retention.run_modes.delete'),
    anonymize: t('privacy_center.retention.run_modes.anonymize'),
  };
  const requestChannelLabels: Record<PrivacyRequestChannel, string> = {
    privacy_email: t('privacy_center.request_channels.privacy_email'),
    support_email: t('privacy_center.request_channels.support_email'),
    checkout_form: t('privacy_center.request_channels.checkout_form'),
    member_portal: t('privacy_center.request_channels.member_portal'),
    admin_panel: t('privacy_center.request_channels.admin_panel'),
    anpd: t('privacy_center.request_channels.anpd'),
    consumer_authority: t('privacy_center.request_channels.consumer_authority'),
    other: t('privacy_center.request_channels.other'),
  };
  const correctionFieldLabels: Record<string, string> = {
    email: t('privacy_center.queue.correction_field_labels.email'),
    name: t('privacy_center.queue.correction_field_labels.name'),
    phone: t('privacy_center.queue.correction_field_labels.phone'),
    document: t('privacy_center.queue.correction_field_labels.document'),
    email_auth_identity: t('privacy_center.queue.correction_field_labels.email_auth_identity'),
    phone_external_or_financial_records: t('privacy_center.queue.correction_field_labels.phone_external_or_financial_records'),
    document_external_or_financial_records: t('privacy_center.queue.correction_field_labels.document_external_or_financial_records'),
    auth_metadata_sync: t('privacy_center.queue.correction_field_labels.auth_metadata_sync'),
    anonymous_consent_preferences_by_visitor_key: t('privacy_center.queue.correction_field_labels.anonymous_consent_preferences_by_visitor_key'),
  };

  const getRetentionReview = (request: PrivacyRequest): RetentionReviewSnapshot | null => {
    const review = request.metadata?.retention_review;
    return review && typeof review === 'object' ? review as RetentionReviewSnapshot : null;
  };
  const getSlaSnapshot = (request: PrivacyRequest): SlaSnapshot | null => {
    const sla = request.metadata?.sla;
    return sla && typeof sla === 'object' ? sla as SlaSnapshot : null;
  };
  const getRevocationExecution = (request: PrivacyRequest): RevocationExecutionSnapshot | null => {
    const execution = request.metadata?.revocation_execution;
    return execution && typeof execution === 'object' ? execution as RevocationExecutionSnapshot : null;
  };
  const getCorrectionRequest = (request: PrivacyRequest): CorrectionRequestSnapshot | null => {
    const correctionRequest = request.metadata?.correction_request;
    return correctionRequest && typeof correctionRequest === 'object' ? correctionRequest as CorrectionRequestSnapshot : null;
  };
  const getCorrectionExecution = (request: PrivacyRequest): CorrectionExecutionSnapshot | null => {
    const execution = request.metadata?.correction_execution;
    return execution && typeof execution === 'object' ? execution as CorrectionExecutionSnapshot : null;
  };
  const getObjectionExecution = (request: PrivacyRequest): ObjectionExecutionSnapshot | null => {
    const execution = request.metadata?.objection_execution;
    return execution && typeof execution === 'object' ? execution as ObjectionExecutionSnapshot : null;
  };
  const getExportExecution = (request: PrivacyRequest): ExportExecutionSnapshot | null => {
    const execution = request.metadata?.export_execution;
    return execution && typeof execution === 'object' ? execution as ExportExecutionSnapshot : null;
  };
  const getGovernanceChannelSourceLabel = (governance?: PrivacyGovernanceSnapshot | null) => {
    if (!governance) return t('privacy_center.governance.channel_sources.not_configured');
    return t(`privacy_center.governance.channel_sources.${governance.official_channel_source}`);
  };
  const getSlaState = (request: PrivacyRequest) => {
    if (request.status === 'fulfilled' || request.status === 'rejected') {
      return 'closed' as const;
    }

    const sla = getSlaSnapshot(request);
    if (!sla?.response_due_at) {
      return 'unknown' as const;
    }

    const dueAt = new Date(sla.response_due_at);
    if (Number.isNaN(dueAt.getTime())) {
      return 'unknown' as const;
    }

    const now = new Date();
    const nowDate = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const dueDate = Date.UTC(dueAt.getFullYear(), dueAt.getMonth(), dueAt.getDate());

    if (dueDate < nowDate) return 'overdue' as const;
    if (dueDate === nowDate) return 'due_today' as const;
    return 'within_sla' as const;
  };
  const getSlaToneClasses = (state: ReturnType<typeof getSlaState>) => {
    if (state === 'overdue') return 'border-red-500/30 bg-red-500/10 text-red-100';
    if (state === 'due_today') return 'border-amber-500/30 bg-amber-500/10 text-amber-100';
    if (state === 'within_sla') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100';
    return 'border-white/10 bg-white/5 text-gray-200';
  };
  const getSlaStatusLabel = (state: ReturnType<typeof getSlaState>) => t(`privacy_center.queue.sla_states.${state}`);

  const formatDateTime = (value?: string | null) => {
    if (!value) return t('privacy_center.not_informed');
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return t('privacy_center.not_informed');
    return date.toLocaleString(dateLocale);
  };
  const renderFieldLabels = (values?: string[]) => {
    if (!Array.isArray(values) || values.length === 0) {
      return t('privacy_center.not_informed');
    }

    return values
      .map((value) => correctionFieldLabels[value] || value)
      .join(' • ');
  };

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
              runMode: policy.run_mode,
              active: policy.active,
              notes: policy.notes || '',
            },
          ]),
        ),
      );
    } catch (error: any) {
      toast.error(error?.message || t('privacy_center.toasts.load_error'));
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
      overdueRequests: requests.filter((request) => getSlaState(request) === 'overdue').length,
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
        requestChannel: requestForm.requestChannel,
        subjectEmail: requestForm.subjectEmail,
        subjectName: requestForm.subjectName,
        subjectPhone: requestForm.subjectPhone,
        subjectDocument: requestForm.subjectDocument,
        correctionTargetEmail: requestForm.correctionTargetEmail,
        correctionTargetName: requestForm.correctionTargetName,
        correctionTargetPhone: requestForm.correctionTargetPhone,
        correctionTargetDocument: requestForm.correctionTargetDocument,
        notes: requestForm.notes,
      });
      toast.success(t('privacy_center.toasts.request_created'));
      setRequestForm({
        requestType: 'access',
        requestChannel: 'admin_panel',
        subjectEmail: '',
        subjectName: '',
        subjectPhone: '',
        subjectDocument: '',
        correctionTargetEmail: '',
        correctionTargetName: '',
        correctionTargetPhone: '',
        correctionTargetDocument: '',
        notes: '',
      });
      await refresh();
    } catch (error: any) {
      toast.error(error?.message || t('privacy_center.toasts.request_create_error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = async () => {
    if (!requestForm.subjectEmail.trim()) {
      toast.error(t('privacy_center.toasts.subject_email_required'));
      return;
    }

    setExporting(true);
    try {
      const payload = await privacyOpsService.exportSubject(requestForm.subjectEmail);
      const safeEmail = requestForm.subjectEmail.toLowerCase().replace(/[^a-z0-9@._-]+/g, '-');
      downloadJson(`privacy-export-${safeEmail}.json`, payload);
      toast.success(t('privacy_center.toasts.export_success'));
    } catch (error: any) {
      toast.error(error?.message || t('privacy_center.toasts.export_error'));
    } finally {
      setExporting(false);
    }
  };

  const handleRequestExport = async (request: PrivacyRequest) => {
    setExportingRequestId(request.id);
    try {
      const payload = await privacyOpsService.exportSubject(request.subject_email);
      const safeEmail = request.subject_email.toLowerCase().replace(/[^a-z0-9@._-]+/g, '-');
      downloadJson(`privacy-export-${safeEmail}.json`, payload);
      toast.success(t('privacy_center.toasts.export_success'));
    } catch (error: any) {
      toast.error(error?.message || t('privacy_center.toasts.export_error'));
    } finally {
      setExportingRequestId(null);
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
      toast.success(t('privacy_center.toasts.request_updated'));
      await refresh();
    } catch (error: any) {
      toast.error(error?.message || t('privacy_center.toasts.request_update_error'));
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
        runMode: draft.runMode,
        active: draft.active,
        notes: draft.notes,
      });
      toast.success(t('privacy_center.toasts.policy_updated', { table: policy.table_name }));
      await refresh();
    } catch (error: any) {
      toast.error(error?.message || t('privacy_center.toasts.policy_update_error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCleanup = async (tableName?: string) => {
    setRunningCleanup(tableName || 'all');
    try {
      const result = await privacyOpsService.runCleanup(tableName);
      const totalRows = (result.results || []).reduce((sum, run) => sum + Number(run.rows_affected || 0), 0);
      toast.success(
        tableName
          ? t('privacy_center.toasts.cleanup_success_table', { table: tableName, count: totalRows })
          : t('privacy_center.toasts.cleanup_success_all', { count: totalRows }),
      );
      await refresh();
    } catch (error: any) {
      toast.error(error?.message || t('privacy_center.toasts.cleanup_error'));
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
                <h1 className="text-4xl font-portal-display text-white uppercase tracking-tight">{t('privacy_center.title')}</h1>
                <p className="text-[10px] uppercase tracking-[0.28em] font-black text-gray-500">{t('privacy_center.badge')}</p>
              </div>
            </div>
            <p className="text-sm text-gray-400 max-w-3xl">
              {t('privacy_center.subtitle')}
            </p>
          </div>

          <Button
            onClick={() => void refresh()}
            className="px-6 py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-white border border-white/10 font-black uppercase tracking-widest text-[10px] flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {t('privacy_center.refresh_panel')}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <div className="rounded-[2rem] border border-white/5 bg-[#0A0A15]/60 p-6">
            <p className="text-[10px] uppercase tracking-[0.25em] font-black text-gray-500">{t('privacy_center.summary.open_requests')}</p>
            <p className="mt-3 text-3xl font-black text-white">{summary.openRequests}</p>
          </div>
          <div className="rounded-[2rem] border border-white/5 bg-[#0A0A15]/60 p-6">
            <p className="text-[10px] uppercase tracking-[0.25em] font-black text-gray-500">{t('privacy_center.summary.overdue_requests')}</p>
            <p className="mt-3 text-3xl font-black text-white">{summary.overdueRequests}</p>
          </div>
          <div className="rounded-[2rem] border border-white/5 bg-[#0A0A15]/60 p-6">
            <p className="text-[10px] uppercase tracking-[0.25em] font-black text-gray-500">{t('privacy_center.summary.total_records')}</p>
            <p className="mt-3 text-3xl font-black text-white">{summary.totalRequests}</p>
          </div>
          <div className="rounded-[2rem] border border-white/5 bg-[#0A0A15]/60 p-6">
            <p className="text-[10px] uppercase tracking-[0.25em] font-black text-gray-500">{t('privacy_center.summary.active_policies')}</p>
            <p className="mt-3 text-3xl font-black text-white">{summary.activePolicies}</p>
          </div>
          <div className="rounded-[2rem] border border-white/5 bg-[#0A0A15]/60 p-6">
            <p className="text-[10px] uppercase tracking-[0.25em] font-black text-gray-500">{t('privacy_center.summary.last_cleanup')}</p>
            <p className="mt-3 text-sm font-bold text-white">{formatDateTime(summary.lastCleanupAt)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1.4fr] gap-6">
          <section className="rounded-[2rem] border border-white/5 bg-[#0A0A15]/60 p-6 space-y-5">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-primary" />
              <div>
                <h2 className="text-lg font-bold text-white">{t('privacy_center.subject_rights.title')}</h2>
                <p className="text-xs text-gray-500">{t('privacy_center.subject_rights.subtitle')}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.24em] font-black text-gray-500">{t('privacy_center.governance.title')}</p>
                  <p className="text-xs text-gray-500 mt-1">{t('privacy_center.governance.subtitle')}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.24em] font-black text-gray-500">{t('privacy_center.governance.official_channel_label')}</p>
                  <p className="mt-2 font-bold text-white break-all">{dashboard?.governance?.official_channel_email || t('privacy_center.not_informed')}</p>
                </div>
                <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.24em] font-black text-gray-500">{t('privacy_center.governance.channel_source_label')}</p>
                  <p className="mt-2 font-bold text-white">{getGovernanceChannelSourceLabel(dashboard?.governance)}</p>
                </div>
                <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.24em] font-black text-gray-500">{t('privacy_center.governance.sla_label')}</p>
                  <p className="mt-2 font-bold text-white">
                    {t('privacy_center.governance.sla_value', {
                      acknowledgement: dashboard?.governance?.acknowledgement_business_days || 2,
                      response: dashboard?.governance?.response_target_calendar_days || 15,
                    })}
                  </p>
                </div>
              </div>

              {!dashboard?.governance?.official_channel_configured && (
                <p className="text-xs text-amber-300">
                  {t('privacy_center.governance.unconfigured_warning')}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="space-y-2">
                <span className="text-[10px] uppercase tracking-[0.24em] font-black text-gray-500">{t('privacy_center.form.request_type')}</span>
                <select
                  value={requestForm.requestType}
                  onChange={(event) => {
                    const nextType = event.target.value as PrivacyRequestType;
                    setRequestForm((current) => ({
                      ...current,
                      requestType: nextType,
                      correctionTargetEmail: nextType === 'correction' ? current.correctionTargetEmail : '',
                      correctionTargetName: nextType === 'correction' ? current.correctionTargetName : '',
                      correctionTargetPhone: nextType === 'correction' ? current.correctionTargetPhone : '',
                      correctionTargetDocument: nextType === 'correction' ? current.correctionTargetDocument : '',
                    }));
                  }}
                  className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-sm text-white"
                >
                  {Object.entries(requestTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-[10px] uppercase tracking-[0.24em] font-black text-gray-500">{t('privacy_center.form.request_channel')}</span>
                <select
                  value={requestForm.requestChannel}
                  onChange={(event) => setRequestForm((current) => ({ ...current, requestChannel: event.target.value as PrivacyRequestChannel }))}
                  className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-sm text-white"
                >
                  {Object.entries(requestChannelLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-[10px] uppercase tracking-[0.24em] font-black text-gray-500">{t('privacy_center.form.subject_email')}</span>
                <input
                  value={requestForm.subjectEmail}
                  onChange={(event) => setRequestForm((current) => ({ ...current, subjectEmail: event.target.value }))}
                  className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-sm text-white"
                  placeholder={t('privacy_center.placeholders.subject_email')}
                />
              </label>

              <label className="space-y-2">
                <span className="text-[10px] uppercase tracking-[0.24em] font-black text-gray-500">{t('privacy_center.form.subject_name')}</span>
                <input
                  value={requestForm.subjectName}
                  onChange={(event) => setRequestForm((current) => ({ ...current, subjectName: event.target.value }))}
                  className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-sm text-white"
                  placeholder={t('privacy_center.placeholders.subject_name')}
                />
              </label>

              <label className="space-y-2">
                <span className="text-[10px] uppercase tracking-[0.24em] font-black text-gray-500">{t('privacy_center.form.subject_phone')}</span>
                <input
                  value={requestForm.subjectPhone}
                  onChange={(event) => setRequestForm((current) => ({ ...current, subjectPhone: event.target.value }))}
                  className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-sm text-white"
                  placeholder={t('privacy_center.placeholders.optional')}
                />
              </label>

              <label className="space-y-2 sm:col-span-2">
                <span className="text-[10px] uppercase tracking-[0.24em] font-black text-gray-500">{t('privacy_center.form.subject_document')}</span>
                <input
                  value={requestForm.subjectDocument}
                  onChange={(event) => setRequestForm((current) => ({ ...current, subjectDocument: event.target.value }))}
                  className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-sm text-white"
                  placeholder={t('privacy_center.placeholders.optional')}
                />
              </label>

              {requestForm.requestType === 'correction' && (
                <div className="sm:col-span-2 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 space-y-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.24em] font-black text-sky-200">
                      {t('privacy_center.form.correction_targets_title')}
                    </p>
                    <p className="mt-1 text-xs text-sky-100/80">
                      {t('privacy_center.form.correction_targets_desc')}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="space-y-2">
                      <span className="text-[10px] uppercase tracking-[0.24em] font-black text-sky-100/70">{t('privacy_center.form.correction_target_email')}</span>
                      <input
                        value={requestForm.correctionTargetEmail}
                        onChange={(event) => setRequestForm((current) => ({ ...current, correctionTargetEmail: event.target.value }))}
                        className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-sm text-white"
                        placeholder={t('privacy_center.placeholders.optional')}
                      />
                    </label>

                    <label className="space-y-2">
                      <span className="text-[10px] uppercase tracking-[0.24em] font-black text-sky-100/70">{t('privacy_center.form.correction_target_name')}</span>
                      <input
                        value={requestForm.correctionTargetName}
                        onChange={(event) => setRequestForm((current) => ({ ...current, correctionTargetName: event.target.value }))}
                        className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-sm text-white"
                        placeholder={t('privacy_center.placeholders.optional')}
                      />
                    </label>

                    <label className="space-y-2">
                      <span className="text-[10px] uppercase tracking-[0.24em] font-black text-sky-100/70">{t('privacy_center.form.correction_target_phone')}</span>
                      <input
                        value={requestForm.correctionTargetPhone}
                        onChange={(event) => setRequestForm((current) => ({ ...current, correctionTargetPhone: event.target.value }))}
                        className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-sm text-white"
                        placeholder={t('privacy_center.placeholders.optional')}
                      />
                    </label>

                    <label className="space-y-2">
                      <span className="text-[10px] uppercase tracking-[0.24em] font-black text-sky-100/70">{t('privacy_center.form.correction_target_document')}</span>
                      <input
                        value={requestForm.correctionTargetDocument}
                        onChange={(event) => setRequestForm((current) => ({ ...current, correctionTargetDocument: event.target.value }))}
                        className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-sm text-white"
                        placeholder={t('privacy_center.placeholders.optional')}
                      />
                    </label>
                  </div>
                </div>
              )}

              <label className="space-y-2 sm:col-span-2">
                <span className="text-[10px] uppercase tracking-[0.24em] font-black text-gray-500">{t('privacy_center.form.internal_notes')}</span>
                <textarea
                  value={requestForm.notes}
                  onChange={(event) => setRequestForm((current) => ({ ...current, notes: event.target.value }))}
                  className="min-h-[120px] w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-sm text-white"
                  placeholder={t('privacy_center.placeholders.internal_notes')}
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
                {t('privacy_center.actions.register_request')}
              </Button>
              <Button
                onClick={() => void handleExport()}
                disabled={exporting}
                className="px-6 py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-white border border-white/10 font-black uppercase tracking-widest text-[10px] flex items-center gap-2"
              >
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {t('privacy_center.actions.export_subject')}
              </Button>
            </div>

            {!dashboard?.scope_account_id && (
              <p className="text-xs text-amber-300">
                {t('privacy_center.scope_warning')}
              </p>
            )}

            {(requestForm.requestType === 'deletion' || requestForm.requestType === 'anonymization') && (
              <p className="text-xs text-amber-300">
                {t('privacy_center.form.retention_review_hint')}
              </p>
            )}
          </section>

          <section className="rounded-[2rem] border border-white/5 bg-[#0A0A15]/60 p-6 space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Clock3 className="w-5 h-5 text-primary" />
                <div>
                  <h2 className="text-lg font-bold text-white">{t('privacy_center.queue.title')}</h2>
                  <p className="text-xs text-gray-500">{t('privacy_center.queue.subtitle')}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4 max-h-[720px] overflow-y-auto pr-1">
              {(dashboard?.requests || []).map((request) => {
                const draft = requestDrafts[request.id] || {
                  status: request.status,
                  resolutionNotes: request.resolution_notes || '',
                };
                const retentionReview = getRetentionReview(request);
                const slaSnapshot = getSlaSnapshot(request);
                const slaState = getSlaState(request);
                const revocationExecution = getRevocationExecution(request);
                const correctionRequest = getCorrectionRequest(request);
                const correctionExecution = getCorrectionExecution(request);
                const objectionExecution = getObjectionExecution(request);
                const exportExecution = getExportExecution(request);
                const hasRetentionReview = Boolean(retentionReview?.manual_review_required);
                const retentionBlocked = Boolean(retentionReview?.retention_blocked);
                const requestChannelLabel = requestChannelLabels[request.request_channel as PrivacyRequestChannel] || request.request_channel;

                return (
                  <div key={request.id} className="rounded-2xl border border-white/5 bg-black/20 p-4 space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.24em] text-primary">
                          {requestTypeLabels[request.request_type]}
                        </p>
                        <h3 className="text-lg font-bold text-white mt-1">{request.subject_email}</h3>
                        <p className="text-xs text-gray-500 mt-1">
                          {t('privacy_center.queue.created_at', {
                            date: formatDateTime(request.created_at),
                            name: request.subject_name ? ` • ${request.subject_name}` : '',
                          })}
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
                          {Object.entries(statusLabels).map(([value, label]) => (
                            <option
                              key={value}
                              value={value}
                              disabled={retentionBlocked && value === 'fulfilled'}
                            >
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {hasRetentionReview && (
                      <div className={`rounded-xl border px-4 py-3 text-sm ${retentionBlocked ? 'border-amber-500/30 bg-amber-500/10 text-amber-100' : 'border-white/10 bg-white/5 text-gray-200'}`}>
                        <p className="font-bold">
                          {retentionBlocked
                            ? t('privacy_center.queue.retention_blocked_title')
                            : t('privacy_center.queue.retention_review_title')}
                        </p>
                        <p className="mt-1 text-xs leading-5">
                          {t('privacy_center.queue.retention_summary', {
                            orders: retentionReview?.total_orders || 0,
                            payments: retentionReview?.total_payments || 0,
                            liquidated: retentionReview?.liquidated_orders || 0,
                            pending: retentionReview?.pending_orders || 0,
                            failed: retentionReview?.failed_or_abandoned_orders || 0,
                          })}
                        </p>
                        <p className="mt-2 text-xs leading-5">
                          {retentionBlocked
                            ? t('privacy_center.queue.retention_blocked_desc')
                            : t('privacy_center.queue.retention_review_desc')}
                        </p>
                      </div>
                    )}

                    {request.request_type === 'revocation' && revocationExecution && (
                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                        <p className="font-bold">{t('privacy_center.queue.revocation_applied_title')}</p>
                        <p className="mt-1 text-xs leading-5">
                          {t('privacy_center.queue.revocation_applied_desc', {
                            count: revocationExecution.customer_payment_profiles_disabled || 0,
                          })}
                        </p>
                      </div>
                    )}

                    {request.request_type === 'correction' && correctionRequest && (
                      <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
                        <p className="font-bold">{t('privacy_center.queue.correction_requested_title')}</p>
                        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs leading-5">
                          {correctionRequest.target_email && (
                            <div><span className="text-sky-100/60">{t('privacy_center.queue.correction_target_email_label')}</span> {correctionRequest.target_email}</div>
                          )}
                          {correctionRequest.target_name && (
                            <div><span className="text-sky-100/60">{t('privacy_center.queue.correction_target_name_label')}</span> {correctionRequest.target_name}</div>
                          )}
                          {correctionRequest.target_phone && (
                            <div><span className="text-sky-100/60">{t('privacy_center.queue.correction_target_phone_label')}</span> {correctionRequest.target_phone}</div>
                          )}
                          {correctionRequest.target_document && (
                            <div><span className="text-sky-100/60">{t('privacy_center.queue.correction_target_document_label')}</span> {correctionRequest.target_document}</div>
                          )}
                        </div>
                      </div>
                    )}

                    {request.request_type === 'correction' && correctionExecution && (
                      <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
                        <p className="font-bold">{t('privacy_center.queue.correction_applied_title')}</p>
                        <p className="mt-1 text-xs leading-5">
                          {t('privacy_center.queue.correction_applied_desc', {
                            profiles: correctionExecution.profiles_updated || 0,
                            licenses: correctionExecution.licenses_updated || 0,
                            paymentProfiles: correctionExecution.customer_payment_profiles_updated || 0,
                            authMetadata: correctionExecution.auth_metadata_updated || 0,
                          })}
                        </p>
                        <p className="mt-2 text-xs leading-5">
                          {t('privacy_center.queue.correction_manual_follow_up', {
                            fields: renderFieldLabels(correctionExecution.manual_follow_up_fields),
                          })}
                        </p>
                      </div>
                    )}

                    {request.request_type === 'objection' && objectionExecution && (
                      <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">
                        <p className="font-bold">{t('privacy_center.queue.objection_applied_title')}</p>
                        <p className="mt-1 text-xs leading-5">
                          {t('privacy_center.queue.objection_applied_desc', {
                            count: objectionExecution.customer_payment_profiles_disabled || 0,
                          })}
                        </p>
                        <p className="mt-2 text-xs leading-5">
                          {t('privacy_center.queue.objection_manual_follow_up', {
                            fields: renderFieldLabels(objectionExecution.manual_follow_up_fields),
                          })}
                        </p>
                      </div>
                    )}

                    {(request.request_type === 'access' || request.request_type === 'portability') && exportExecution && (
                      <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
                        <p className="font-bold">{t('privacy_center.queue.export_applied_title')}</p>
                        <p className="mt-1 text-xs leading-5">
                          {t('privacy_center.queue.export_applied_desc', {
                            date: formatDateTime(exportExecution.generated_at),
                            sections: Array.isArray(exportExecution.included_sections) ? exportExecution.included_sections.length : 0,
                          })}
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-300">
                      <div><span className="text-gray-500">{t('privacy_center.queue.channel_label')}</span> {requestChannelLabel}</div>
                      <div><span className="text-gray-500">{t('privacy_center.queue.sla_due_label')}</span> {slaSnapshot?.response_due_at ? formatDateTime(slaSnapshot.response_due_at) : t('privacy_center.not_informed')}</div>
                      <div><span className="text-gray-500">{t('privacy_center.queue.phone_label')}</span> {request.subject_phone || t('privacy_center.not_informed')}</div>
                      <div><span className="text-gray-500">{t('privacy_center.queue.document_label')}</span> {request.subject_document || t('privacy_center.not_informed')}</div>
                      <div className="md:col-span-2"><span className="text-gray-500">{t('privacy_center.queue.notes_label')}</span> {request.notes || t('privacy_center.no_additional_context')}</div>
                    </div>

                    <div className={`rounded-xl border px-4 py-3 text-sm ${getSlaToneClasses(slaState)}`}>
                      <p className="font-bold">{t('privacy_center.queue.sla_status_label', { status: getSlaStatusLabel(slaState) })}</p>
                      <p className="mt-1 text-xs leading-5">
                        {t('privacy_center.queue.sla_policy_hint', {
                          acknowledgement: slaSnapshot?.acknowledgement_business_days || dashboard?.governance?.acknowledgement_business_days || 2,
                          response: slaSnapshot?.response_target_calendar_days || dashboard?.governance?.response_target_calendar_days || 15,
                        })}
                      </p>
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
                      placeholder={t('privacy_center.placeholders.resolution_notes')}
                    />

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-gray-500">
                        {t('privacy_center.queue.current_status', { status: statusLabels[request.status] })}
                        {request.fulfilled_at ? t('privacy_center.queue.fulfilled_at', { date: formatDateTime(request.fulfilled_at) }) : ''}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        {(request.request_type === 'access' || request.request_type === 'portability') && (
                          <Button
                            onClick={() => void handleRequestExport(request)}
                            disabled={exportingRequestId === request.id}
                            className="px-5 py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-100 border border-sky-500/20 font-black uppercase tracking-widest text-[10px] flex items-center gap-2"
                          >
                            {exportingRequestId === request.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            {t('privacy_center.actions.export_request')}
                          </Button>
                        )}
                        <Button
                          onClick={() => void handleUpdateRequest(request)}
                          disabled={submitting}
                          className="px-5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white border border-white/10 font-black uppercase tracking-widest text-[10px] flex items-center gap-2"
                        >
                          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          {t('common.save')}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {!loading && (dashboard?.requests || []).length === 0 && (
                <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-gray-500">
                  {t('privacy_center.queue.empty')}
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
                <h2 className="text-lg font-bold text-white">{t('privacy_center.retention.title')}</h2>
                <p className="text-xs text-gray-500">{t('privacy_center.retention.subtitle')}</p>
              </div>
            </div>

            <Button
              onClick={() => void handleCleanup()}
              disabled={runningCleanup !== null}
              className="px-6 py-3 rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/20 font-black uppercase tracking-widest text-[10px] flex items-center gap-2"
            >
              {runningCleanup === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {t('privacy_center.actions.run_global_cleanup')}
            </Button>
          </div>

          <div className="space-y-4">
            {(dashboard?.policies || []).map((policy) => {
              const draft = policyDrafts[policy.id] || {
                retentionDays: policy.retention_days,
                runMode: policy.run_mode,
                active: policy.active,
                notes: policy.notes || '',
              };

              return (
                <div key={policy.id} className="rounded-2xl border border-white/5 bg-black/20 p-4 grid grid-cols-1 xl:grid-cols-[1.1fr_140px_180px_150px_1fr_auto] gap-4 items-start">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.24em] text-primary">{policy.table_name}</p>
                    <p className="text-sm text-gray-400 mt-2">{policy.notes || t('privacy_center.retention.default_policy_notes')}</p>
                  </div>

                  <label className="space-y-2">
                    <span className="text-[10px] uppercase tracking-[0.24em] font-black text-gray-500">{t('privacy_center.retention.days_label')}</span>
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
                    <span className="text-[10px] uppercase tracking-[0.24em] font-black text-gray-500">{t('privacy_center.retention.mode_label')}</span>
                    <select
                      value={draft.runMode}
                      onChange={(event) => setPolicyDrafts((current) => ({
                        ...current,
                        [policy.id]: {
                          ...draft,
                          runMode: event.target.value === 'anonymize' ? 'anonymize' : 'delete',
                        },
                      }))}
                      className="w-full rounded-xl bg-[#101018] border border-white/10 px-4 py-3 text-sm text-white"
                    >
                      <option value="delete">{runModeLabels.delete}</option>
                      <option value="anonymize">{runModeLabels.anonymize}</option>
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="text-[10px] uppercase tracking-[0.24em] font-black text-gray-500">{t('privacy_center.retention.active_label')}</span>
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
                      <span>{draft.active ? t('privacy_center.yes') : t('privacy_center.no')}</span>
                    </label>
                  </label>

                  <label className="space-y-2">
                    <span className="text-[10px] uppercase tracking-[0.24em] font-black text-gray-500">{t('privacy_center.retention.notes_label')}</span>
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
                      {t('common.save')}
                    </Button>
                    <Button
                      onClick={() => void handleCleanup(policy.table_name)}
                      disabled={runningCleanup !== null}
                      className="px-5 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/20 font-black uppercase tracking-widest text-[10px] flex items-center gap-2"
                    >
                      {runningCleanup === policy.table_name ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      {t('privacy_center.actions.clean')}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-4 border-t border-white/5 space-y-3">
            <h3 className="text-sm font-bold text-white">{t('privacy_center.history.title')}</h3>
            <div className="space-y-2">
              {(dashboard?.runs || []).slice(0, 10).map((run) => (
                <div key={run.id} className="rounded-xl border border-white/5 bg-black/20 px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-2 text-sm">
                  <div>
                    <span className="font-bold text-white">{run.table_name}</span>
                    <span className="text-gray-500">{t('privacy_center.history.cutoff', { date: formatDateTime(run.cutoff_at) })}</span>
                  </div>
                  <div className="text-gray-400">
                    {t('privacy_center.history.rows_affected', { count: run.rows_affected })} • {t('privacy_center.history.mode', { mode: runModeLabels[run.run_mode] || run.run_mode })} • {formatDateTime(run.created_at)}
                  </div>
                </div>
              ))}
              {!loading && (dashboard?.runs || []).length === 0 && (
                <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-gray-500">
                  {t('privacy_center.history.empty')}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
};
