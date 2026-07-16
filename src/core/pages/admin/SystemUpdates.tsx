import React, { useState, useEffect } from 'react';
import { Layout } from '../../components/Layout';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Settings as SettingsIcon,
  Shield,
  ShieldCheck,
  Search,
  Github,
  Zap,
  ChevronRight,
  AlertCircle,
  RefreshCw,
  History,
  Clock,
  Database,
  Activity,
  Cpu,
  Unplug,
  Copy
} from 'lucide-react';
import { SystemManager } from '../../services/systemManager';
import { SystemInfo, SystemUpdateLog } from '../../types';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmModal } from '../../components/ui/Modal';
import { useFeatures } from '../../hooks/useFeatures';
import { APP_VERSION, SCHEMA_VERSION } from '../../config/version';
import { GITHUB_UPDATE_CONFIG } from '../../config/github';

const GITHUB_INSTALLATION_DRAFT_KEY = 'sc_github_installation_id_draft';
const GITHUB_REPOSITORY_DRAFT_KEY = 'sc_github_repository_draft';

export const SystemUpdates = () => {
    const { t, i18n } = useTranslation('admin');
    const [loading, setLoading] = useState(true);
    const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
    const { rawFeatures: features, loading: featuresLoading } = useFeatures();
    
    // GitHub Form State
    const [installationId, setInstallationId] = useState('');
    const [repository, setRepository] = useState('');
    const [updatingGithub, setUpdatingGithub] = useState(false);
    const [testingConnection, setTestingConnection] = useState(false);
    const [syncingFiles, setSyncingFiles] = useState(false);
    const [rollingBack, setRollingBack] = useState(false);
    const [showSyncConfirm, setShowSyncConfirm] = useState(false);
    const [showRollbackConfirm, setShowRollbackConfirm] = useState<string | null>(null);
    
    // Audit & Update State
    const [auditResult, setAuditResult] = useState<{ is_healthy: boolean; drifts: any[]; checked_at: string } | null>(null);
    const [isAuditing, setIsAuditing] = useState(false);
    const [checkingUpdate, setCheckingUpdate] = useState(false);
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [updateHistory, setUpdateHistory] = useState<SystemUpdateLog[]>([]);
    const [applyingDatabaseUpdate, setApplyingDatabaseUpdate] = useState(false);
    const [databaseUpdateError, setDatabaseUpdateError] = useState<string | null>(null);
    const [showDatabaseConfirm, setShowDatabaseConfirm] = useState(false);
    const [copyingMigrationSql, setCopyingMigrationSql] = useState(false);
    const systemUpdateLocale = i18n.language.startsWith('es')
        ? 'es-ES'
        : i18n.language.startsWith('en')
            ? 'en-US'
            : 'pt-BR';

    const formatDateTime = (value?: string | null) => {
        if (!value) return '-';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return '-';
        return parsed.toLocaleString(systemUpdateLocale);
    };

    const formatTime = (value?: string | null) => {
        if (!value) return '-';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return '-';
        return parsed.toLocaleTimeString(systemUpdateLocale);
    };

    useEffect(() => {
        fetchData();
        checkUrlParams();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [info, history] = await Promise.all([
                SystemManager.getSystemInfo(),
                SystemManager.getUpdateHistory()
            ]);
            
            setSystemInfo(info);
            setUpdateHistory(history);
            setUpdateAvailable(Boolean(info?.pending_migration_count && info.pending_migration_count > 0));
            
            if (info) {
                const draftInstallationId = typeof window !== 'undefined'
                    ? window.localStorage.getItem(GITHUB_INSTALLATION_DRAFT_KEY) || ''
                    : '';
                const draftRepository = typeof window !== 'undefined'
                    ? window.localStorage.getItem(GITHUB_REPOSITORY_DRAFT_KEY) || ''
                    : '';

                setInstallationId(info.github_installation_id || draftInstallationId || '');
                setRepository(info.github_repository || draftRepository || '');
            }
        } finally {
            setLoading(false);
        }
    };

    const checkUrlParams = async () => {
        const params = new URLSearchParams(window.location.search);
        const instId = String(params.get('installation_id') || '').trim();
        const setupAction = params.get('setup_action');

        if (instId && setupAction === 'install') {
            setInstallationId(instId);
            if (typeof window !== 'undefined') {
                window.localStorage.setItem(GITHUB_INSTALLATION_DRAFT_KEY, instId);
            }

            const repositoryCandidate = String(
                params.get('repository')
                || (typeof window !== 'undefined' ? window.localStorage.getItem(GITHUB_REPOSITORY_DRAFT_KEY) : '')
                || repository
                || ''
            ).trim();

            if (!repositoryCandidate) {
                toast.info(t(
                    'system_updates.github.installation_saved_pending_repo',
                    'GitHub App autorizado. Agora informe o repositorio no formato owner/repo e clique em Salvar.'
                ));
                window.history.replaceState({}, document.title, window.location.pathname);
                return;
            }

            const loadingToastId = toast.loading(t('system_updates.toasts.finishing_github_integration'));
            const success = await SystemManager.updateGitHubIntegration(instId, repositoryCandidate);
            toast.dismiss(loadingToastId);

            if (success) {
                if (typeof window !== 'undefined') {
                    window.localStorage.setItem(GITHUB_REPOSITORY_DRAFT_KEY, repositoryCandidate);
                }
                setRepository(repositoryCandidate);
                toast.success(t('system_updates.toasts.github_connected'));
                window.history.replaceState({}, document.title, window.location.pathname);
                fetchData();
            } else {
                toast.error(t(
                    'system_updates.github.installation_finalize_failed',
                    'A autorizacao do GitHub voltou, mas a integracao nao foi salva. Confira owner/repo e clique em Salvar.'
                ));
            }
        }
    };

    const handleCheckUpdate = async () => {
        setCheckingUpdate(true);
        try {
            const info = await SystemManager.getSystemInfo();
            if (!info) {
                toast.error(t('system_updates.toasts.read_state_error'));
                return;
            }

            const pendingVersions = SystemManager.getPendingMigrationVersions(info);
            const required = pendingVersions.length > 0;
            setSystemInfo(info);
            if (required) {
                setUpdateAvailable(true);
                setDatabaseUpdateError(null);
                toast.info(t('system_updates.toasts.db_updates_available', { version: SCHEMA_VERSION }));
            } else {
                setUpdateAvailable(false);
                if (info.database_status === 'unverified') {
                    toast.error(t('system_updates.toasts.schema_unverified_before_migration'));
                    return;
                }
                toast.success(t('system_updates.toasts.db_synced', { version: SCHEMA_VERSION }));
            }
        } finally {
            setCheckingUpdate(false);
        }
    };

    const handleUpdateGithub = async (e: React.FormEvent) => {
        e.preventDefault();
        const normalizedInstallationId = installationId.trim();
        const normalizedRepository = repository.trim();

        if (!normalizedInstallationId || !normalizedRepository) {
            toast.error(t(
                'system_updates.github.missing_fields',
                'Preencha o Installation ID e o repositorio owner/repo antes de salvar.'
            ));
            return;
        }

        if (typeof window !== 'undefined') {
            window.localStorage.setItem(GITHUB_INSTALLATION_DRAFT_KEY, normalizedInstallationId);
            window.localStorage.setItem(GITHUB_REPOSITORY_DRAFT_KEY, normalizedRepository);
        }
        setUpdatingGithub(true);
        const success = await SystemManager.updateGitHubIntegration(normalizedInstallationId, normalizedRepository);
        if (success) {
            toast.success(t('system_updates.github.success', 'Integração GitHub atualizada!'));
            fetchData();
        } else {
            toast.error(t('system_updates.github.error', 'Erro ao atualizar integração.'));
        }
        setUpdatingGithub(false);
    };

    const handleTestConnection = async () => {
        const normalizedInstallationId = installationId.trim();
        const normalizedRepository = repository.trim();

        if (!normalizedInstallationId || !normalizedRepository) {
            toast.error(t(
                'system_updates.github.missing_fields',
                'Preencha o Installation ID e o repositorio owner/repo antes de salvar.'
            ));
            return;
        }

        setTestingConnection(true);
        try {
            const savedInstallationId = String(systemInfo?.github_installation_id || '').trim();
            const savedRepository = String(systemInfo?.github_repository || '').trim();

            if (savedInstallationId !== normalizedInstallationId || savedRepository !== normalizedRepository) {
                const saveSuccess = await SystemManager.updateGitHubIntegration(normalizedInstallationId, normalizedRepository);
                if (!saveSuccess) {
                    toast.error(t(
                        'system_updates.github.save_before_test_failed',
                        'Nao foi possivel salvar a configuracao do GitHub antes do teste.'
                    ));
                    return;
                }
                await fetchData();
            }

            if (typeof window !== 'undefined') {
                window.localStorage.setItem(GITHUB_INSTALLATION_DRAFT_KEY, normalizedInstallationId);
                window.localStorage.setItem(GITHUB_REPOSITORY_DRAFT_KEY, normalizedRepository);
            }

            const result = await SystemManager.testGitHubConnection();
            if (result.success) {
                toast.success(result.message || t('system_updates.github.test_success'));
            } else {
                toast.error(result.message || t('system_updates.github.test_error'));
            }
        } finally {
            setTestingConnection(false);
        }
    };

    const handleSyncFiles = async () => {
        setSyncingFiles(true);
        try {
            const result = await SystemManager.syncSystemFiles();
            if (result.success) {
                if ((result.filesUpdated || 0) > 0) {
                    toast.info(t('system_updates.toasts.sync_code_no_db_change'));
                    toast.success(t('system_updates.toasts.files_synced', { count: result.filesUpdated }));
                } else {
                    toast.success(result.message || t('system_updates.toasts.no_new_files_found'));
                    if (updateAvailable) {
                        toast.info(t('system_updates.toasts.code_synced_use_update_db'));
                    }
                }
                if (result.historyLogged === false) {
                    toast.warning(t('system_updates.toasts.history_not_recorded'));
                }
                fetchData();
            } else {
                toast.error(result.message || t('system_updates.toasts.sync_failed'));
            }
        } finally {
            setSyncingFiles(false);
            setShowSyncConfirm(false);
        }
    };

    const handleRollback = async (backupBranch: string) => {
        setRollingBack(true);
        const result = await SystemManager.rollbackSystemFiles(backupBranch);
        if (result.success) {
            toast.success(result.message || t('system_updates.toasts.rollback_success'));
            fetchData();
        } else {
            toast.error(result.message || t('system_updates.toasts.rollback_failed'));
        }
        setRollingBack(false);
        setShowRollbackConfirm(null);
    };

    const handleApplyDatabaseUpdate = async () => {
        setApplyingDatabaseUpdate(true);
        setDatabaseUpdateError(null);

        try {
            const result = await SystemManager.runPendingMigrations();

            if (!result.success) {
                const error = result.failedVersion
                    ? t('system_updates.toasts.migration_failed_with_version', {
                        version: result.failedVersion,
                        message: result.error || t('system_updates.toasts.apply_schema_failed'),
                    })
                    : (result.error || t('system_updates.toasts.apply_schema_failed'));

                setDatabaseUpdateError(error);
                toast.error(error);
                return;
            }

            setUpdateAvailable(false);
            toast.success(result.applied.length > 0
                ? t('system_updates.toasts.db_updated_versions', { versions: result.applied.join(', ') })
                : t('system_updates.toasts.db_already_schema', { version: SCHEMA_VERSION }));
            await fetchData();
        } finally {
            setApplyingDatabaseUpdate(false);
            setShowDatabaseConfirm(false);
        }
    };

    const handleCopyPendingMigrationSql = async () => {
        const versions = SystemManager.getPendingMigrationVersions(systemInfo);
        if (versions.length === 0) {
            toast.info(t('system_updates.toasts.db_already_schema', { version: SCHEMA_VERSION }));
            return;
        }

        setCopyingMigrationSql(true);
        try {
            const bundle = await SystemManager.getPendingMigrationSqlBundle(versions);
            await navigator.clipboard.writeText(bundle.sql);
            toast.success(t('system_updates.toasts.sql_copied', {
                versions: bundle.versions.map((version) => `v${version}`).join(', '),
            }));
        } catch (error: any) {
            const message = String(error?.message || t('system_updates.toasts.copy_sql_failed')).trim();
            toast.error(message);
        } finally {
            setCopyingMigrationSql(false);
        }
    };

    const handleRunAudit = async () => {
        setIsAuditing(true);
        try {
            const result = await SystemManager.performSchemaAudit();
            setAuditResult(result);
            if (result.is_healthy) {
                toast.success(t('system_updates.toasts.audit_valid'));
            } else {
                toast.error(t('system_updates.toasts.audit_inconsistencies'));
            }
        } catch (err: any) {
            setAuditResult({
                is_healthy: false,
                drifts: [{
                    type: 'schema_check_failed',
                    name: 'auditoria',
                    message: err?.message || t('system_updates.toasts.audit_failed')
                }],
                checked_at: new Date().toISOString()
            });
            toast.error(err?.message || t('system_updates.toasts.audit_failed'));
        } finally {
            setIsAuditing(false);
        }
    };

    const getLogMeta = (log: SystemUpdateLog) => log.files_affected || {};
    const getBackupBranch = (log: SystemUpdateLog) => log.backup_branch || getLogMeta(log).backup_branch || '';
    const getCommitHash = (log: SystemUpdateLog) => log.commit_hash || getLogMeta(log).commit_hash || '';
    const getFilesUpdated = (log: SystemUpdateLog) => {
        const value = log.files_updated ?? getLogMeta(log).files_updated;
        return typeof value === 'number' ? value : null;
    };
    const getActionLabel = (log: SystemUpdateLog) => {
        if (log.action === 'migration') return t('system_updates.history.action_database');
        if (log.action === 'rollback') return t('system_updates.history.action_rollback');
        return t('system_updates.history.action_code');
    };
    const formatDrift = (drift: any) => {
        if (drift.type === 'table_missing') return t('system_updates.health.drift_table_missing', { name: drift.name });
        if (drift.type === 'column_missing') return t('system_updates.health.drift_column_missing', { column: drift.column || '?', table: drift.name });
        if (drift.type === 'server_configuration_error') return drift.message || t('system_updates.health.server_configuration_error');
        if (drift.type === 'migration_pending') return drift.message || t('system_updates.health.migration_pending');
        if (drift.type === 'migration_state_unverified') return drift.message || t('system_updates.health.migration_state_unverified');
        if (drift.type === 'db_version_mismatch') {
            return t('system_updates.health.version_mismatch', {
                current: drift.current_version || '?',
                expected: drift.expected_version || '?',
            });
        }
        return drift.message || t('system_updates.health.verify_schema', { name: drift.name || 'schema' });
    };
    const pendingMigrations = SystemManager.getPendingMigrationVersions(systemInfo);
    const isDatabaseUnverified = systemInfo?.database_status === 'unverified';

    if (loading) {
        return (
            <Layout>
                <div className="flex flex-col items-center justify-center h-64 gap-4">
                    <RefreshCw className="w-10 h-10 text-primary/40 animate-spin" />
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest italic">{t('system_updates.loading_syncing_core')}</span>
                </div>
            </Layout>
        );
    }

    return (
        <Layout>
            <div className="flex flex-col gap-8 pb-32 animate-in fade-in duration-700">
                {/* Tactical Header */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-xl">
                                <Activity className="w-8 h-8 text-primary animate-pulse" />
                            </div>
                            <h1 className="text-4xl font-black text-white tracking-tighter italic uppercase">
                                {t('system_updates.title')}
                            </h1>
                        </div>
                        <p className="text-gray-400 font-medium flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(249,115,22,0.6)]"></span>
                            {t('system_updates.header_description')}
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            onClick={handleCheckUpdate}
                            disabled={checkingUpdate}
                            className="bg-white/5 hover:bg-white/10 text-white border border-white/5 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95"
                        >
                            <RefreshCw className={`w-4 h-4 ${checkingUpdate ? 'animate-spin' : ''}`} />
                            {checkingUpdate ? t('system_updates.actions.checking') : t('system_updates.actions.check_database')}
                        </button>
                    </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Version Card */}
                    <div className="bg-[#0A0A15]/60 border border-white/5 rounded-[2rem] p-8 backdrop-blur-xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Cpu className="w-24 h-24 rotate-12" />
                        </div>
                        <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <Shield className="w-4 h-4 text-primary" /> {t('system_updates.version_card.title')}
                        </h3>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                                <span className="text-xs font-bold text-gray-400">{t('system_updates.version_card.system_code')}</span>
                                <span className="text-lg font-black text-white font-mono italic">v{APP_VERSION}</span>
                            </div>
                            <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                                <span className="text-xs font-bold text-gray-400">{t('system_updates.version_card.database')}</span>
                                <span className="text-lg font-black text-white font-mono italic">v{systemInfo?.db_version || '1.0.0'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Schema Audit Card */}
                    <div className={`bg-[#0A0A15]/60 border rounded-[2rem] p-8 backdrop-blur-xl relative overflow-hidden group transition-all duration-500 ${auditResult?.is_healthy === false ? 'border-red-500/20' : 'border-white/5'}`}>
                        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
                            <ShieldCheck className="w-24 h-24" />
                        </div>
                        <div className="flex items-center justify-between gap-3 mb-6 relative z-10">
                            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                <Database className="w-4 h-4 text-primary" /> {t('system_updates.audit_card.title')}
                            </h3>
                            <button 
                                onClick={handleRunAudit}
                                disabled={isAuditing}
                                title={t('system_updates.audit_card.run_title')}
                                className="relative z-20 shrink-0 px-3 py-2 bg-white/5 hover:bg-primary/20 rounded-xl border border-white/5 text-primary transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50"
                            >
                                {isAuditing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                <span className="text-[9px] font-black uppercase tracking-widest">{t('system_updates.audit_card.run')}</span>
                            </button>
                        </div>
                        <p className="text-[11px] text-gray-500 font-medium leading-relaxed mb-4 relative z-10">
                            {t('system_updates.audit_card.description')}
                        </p>
                        
                        {auditResult ? (
                            <div className={`p-5 rounded-2xl border animate-in slide-in-from-top-4 relative z-10 ${auditResult.is_healthy ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                                <div className="flex items-center justify-between">
                                    <span className={`text-xs font-black uppercase italic ${auditResult.is_healthy ? 'text-green-500' : 'text-red-500'}`}>
                                        {auditResult.is_healthy ? t('system_updates.audit_card.validated') : t('system_updates.audit_card.adjustment_needed')}
                                    </span>
                                    <span className="text-[9px] font-mono text-gray-500">{formatTime(auditResult.checked_at)}</span>
                                </div>
                                {auditResult.is_healthy && (
                                    <div className="mt-3 text-[10px] text-green-400/80 font-medium leading-relaxed">
                                        {t('system_updates.audit_card.compatible_schema', { version: SCHEMA_VERSION })}
                                    </div>
                                )}
                                {!auditResult.is_healthy && (
                                    <div className="mt-3 space-y-1">
                                        {auditResult.drifts.slice(0, 3).map((d, i) => (
                                            <div key={i} className="text-[10px] text-red-400/80 font-medium leading-relaxed break-words">
                                                {formatDrift(d)}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="min-h-24 flex flex-col items-center justify-center border border-dashed border-white/5 rounded-2xl opacity-60 px-5 text-center relative z-10">
                                <span className="text-[10px] font-black uppercase text-gray-500">{t('system_updates.audit_card.not_run')}</span>
                                <span className="text-[10px] text-gray-600 mt-2 leading-relaxed">{t('system_updates.audit_card.not_run_desc')}</span>
                            </div>
                        )}
                    </div>

                    {/* Update Available Card */}
                    <div className={`bg-[#0A0A15]/60 border rounded-[2rem] p-8 backdrop-blur-xl relative overflow-hidden group transition-all duration-500 ${isDatabaseUnverified ? 'border-amber-500/30 shadow-lg shadow-amber-500/5' : updateAvailable ? 'border-blue-500/30 shadow-lg shadow-blue-500/5' : 'border-white/5'}`}>
                        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Zap className="w-24 h-24 text-blue-500" />
                        </div>
                        <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <RefreshCw className="w-4 h-4 text-blue-500" /> {t('system_updates.db_status_card.title')}
                        </h3>
                        <div className="space-y-4">
                            <div className={`p-5 rounded-2xl border flex flex-col gap-4 ${isDatabaseUnverified ? 'bg-amber-500/10 border-amber-500/20 shadow-inner' : updateAvailable ? 'bg-blue-500/10 border-blue-500/20 shadow-inner' : 'bg-white/5 border-white/5 opacity-70'}`}>
                                <div className="flex items-center gap-3">
                                    {isDatabaseUnverified ? <AlertTriangle className="w-5 h-5 text-amber-400" /> : updateAvailable ? <AlertCircle className="w-5 h-5 text-blue-400 animate-pulse" /> : <CheckCircle2 className="w-5 h-5 text-gray-600" />}
                                    <div className="flex flex-col">
                                        <span className={`text-xs font-black uppercase italic ${isDatabaseUnverified ? 'text-amber-400' : updateAvailable ? 'text-blue-400' : 'text-gray-400'}`}>
                                            {updateAvailable ? t('system_updates.db_status_card.update_available') : t('system_updates.db_status_card.synced')}
                                        </span>
                                        <span className="text-[9px] text-gray-500">{t('system_updates.db_status_card.schema_ready', { version: SCHEMA_VERSION })}</span>
                                    </div>
                                </div>
                                {isDatabaseUnverified && (
                                    <p className="text-[10px] text-amber-100/80 font-medium leading-relaxed">
                                        {t('system_updates.db_status_card.unverified_desc')}
                                    </p>
                                )}
                                {updateAvailable && (
                                    <p className="text-[10px] text-blue-100/70 font-medium leading-relaxed">
                                        {t('system_updates.db_status_card.pending_desc')}
                                    </p>
                                )}
                                {pendingMigrations.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {pendingMigrations.map((version) => (
                                            <span key={version} className="px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[9px] font-black uppercase tracking-widest text-blue-300">
                                                v{version}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {updateAvailable && (
                                    <div className="space-y-3">
                                        <button 
                                            onClick={() => setShowDatabaseConfirm(true)}
                                            disabled={applyingDatabaseUpdate}
                                            className="w-full px-4 py-3 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white rounded-xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest"
                                        >
                                            <Database className={`w-4 h-4 ${applyingDatabaseUpdate ? 'animate-pulse' : ''}`} />
                                            {applyingDatabaseUpdate ? t('system_updates.db_status_card.updating') : t('system_updates.db_status_card.update_database')}
                                        </button>
                                        <button
                                            onClick={handleCopyPendingMigrationSql}
                                            disabled={copyingMigrationSql}
                                            className="w-full px-4 py-3 bg-white/5 hover:bg-white/10 disabled:opacity-50 text-white border border-white/10 rounded-xl active:scale-95 transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest"
                                        >
                                            <Copy className={`w-4 h-4 ${copyingMigrationSql ? 'animate-pulse' : ''}`} />
                                            {copyingMigrationSql ? t('system_updates.db_status_card.copying_sql') : t('system_updates.db_status_card.copy_manual_sql')}
                                        </button>
                                        <p className="text-[10px] text-gray-500 leading-relaxed">
                                            {t('system_updates.db_status_card.copy_manual_sql_desc')}
                                        </p>
                                    </div>
                                )}
                            </div>
                            {databaseUpdateError && (
                                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-[10px] text-red-300 font-medium leading-relaxed break-words">
                                    {databaseUpdateError}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    <div className="lg:col-span-8 space-y-8">
                        {/* Features Matrix */}
                        <div className="bg-[#0F0F13]/60 border border-white/5 rounded-[2.5rem] p-8 backdrop-blur-xl">
                            <div className="flex items-center justify-between mb-8 px-2">
                                <div className="space-y-1">
                                    <h3 className="text-xl font-black text-white italic tracking-tighter uppercase flex items-center gap-3">
                                        <Zap className="w-6 h-6 text-yellow-400 fill-yellow-400/20" />
                                        {t('system_updates.features_panel.title')}
                                    </h3>
                                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">{t('system_updates.features_panel.subtitle')}</p>
                                </div>
                                <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 border border-primary/20 rounded-full">
                                    <span className="text-[8px] font-black text-primary uppercase tracking-widest animate-pulse">{t('system_updates.features_panel.license_synced')}</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {featuresLoading ? (
                                    <div className="col-span-2 py-12 flex flex-col items-center opacity-40">
                                        <RefreshCw className="w-8 h-8 animate-spin mb-4" />
                                        <span className="text-[10px] font-black uppercase tracking-widest italic">{t('system_updates.features_panel.loading')}</span>
                                    </div>
                                ) : (
                                    features.map((feature, idx) => {
                                        const cleanId = feature.feature_key.replace(/^module_/, '').replace(/_/g, ' ');
                                        const mainLabel = feature.settings?.label || cleanId;

                                        return (
                                            <div key={feature.id} className="p-5 bg-white/[0.03] border border-white/5 rounded-3xl flex items-center justify-between group hover:border-primary/20 hover:bg-white/[0.05] transition-all duration-500 overflow-hidden relative">
                                                <div className="flex items-center gap-4 relative z-10">
                                                    <div className={`p-3 rounded-2xl border transition-all ${feature.is_enabled ? 'bg-green-500/10 border-green-500/20 text-green-500 shadow-lg shadow-green-500/10' : 'bg-white/5 border-white/5 text-gray-600'}`}>
                                                        <Zap className={`w-5 h-5 ${feature.is_enabled ? 'fill-current' : ''}`} />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-black text-white group-hover:text-primary transition-colors capitalize italic tracking-tight">{mainLabel}</span>
                                                        <span className="text-[9px] text-gray-500 font-mono lowercase opacity-60">id: {feature.feature_key}</span>
                                                    </div>
                                                </div>
                                                <div className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border z-10 ${feature.is_enabled ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
                                                    {feature.is_enabled ? t('system_updates.features_panel.active') : t('system_updates.features_panel.blocked')}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* Update History */}
                        <div className="bg-[#0F0F13]/60 border border-white/5 rounded-[2.5rem] p-8 backdrop-blur-xl">
                            <div className="flex items-center justify-between mb-8 px-2">
                                <div className="space-y-1">
                                    <h3 className="text-xl font-black text-white italic tracking-tighter uppercase flex items-center gap-3">
                                        <History className="w-6 h-6 text-primary" />
                                        {t('system_updates.history.title')}
                                    </h3>
                                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">{t('system_updates.history.subtitle')}</p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {updateHistory.length === 0 ? (
                                    <div className="py-12 px-6 flex flex-col items-center opacity-40 border border-dashed border-white/10 rounded-3xl text-center">
                                        <Clock className="w-8 h-8 mb-4" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">{t('system_updates.history.empty')}</span>
                                        <span className="text-[10px] text-gray-500 mt-3 max-w-md leading-relaxed">
                                            {t('system_updates.history.empty_desc')}
                                        </span>
                                    </div>
                                ) : (
                                    updateHistory.map((log) => (
                                        <div key={log.id} className="p-6 bg-white/[0.02] border border-white/5 rounded-3xl hover:bg-white/[0.04] transition-all group relative">
                                            <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_auto] 2xl:items-center gap-5 relative z-10">
                                                <div className="flex items-start gap-4 min-w-0">
                                                    <div className={`w-10 h-10 rounded-2xl border flex flex-none items-center justify-center ${log.status === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
                                                        {log.status === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                                                    </div>
                                                    <div className="flex flex-col min-w-0">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="text-[10px] font-black text-gray-500 font-mono tracking-widest uppercase italic">{formatDateTime(log.executed_at)}</span>
                                                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter ${log.status === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                                                {log.status === 'success' ? t('system_updates.history.status_success') : t('system_updates.history.status_failure')}
                                                            </span>
                                                            <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter bg-white/5 text-gray-300">
                                                                {getActionLabel(log)}
                                                            </span>
                                                        </div>
                                                        <span className="text-sm font-black text-white tracking-tight mt-1 break-words">
                                                            {getBackupBranch(log) ? t('system_updates.history.code_backup', { branch: getBackupBranch(log) }) : (log.message || t('system_updates.history.verification_logged'))}
                                                        </span>
                                                    </div>
                                                </div>
                                                
                                                <div className="flex flex-wrap items-center justify-start 2xl:justify-end gap-3">
                                                    <div className="flex flex-col items-start 2xl:items-end opacity-60 min-w-[72px]">
                                                        <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{t('system_updates.history.commit')}</span>
                                                        <span className="text-[10px] font-mono text-white">{getCommitHash(log)?.slice(0, 8) || t('system_updates.history.manual')}</span>
                                                    </div>
                                                    {getFilesUpdated(log) !== null && (
                                                        <div className="flex flex-col items-start 2xl:items-end opacity-60 min-w-[58px]">
                                                            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{t('system_updates.history.files')}</span>
                                                            <span className="text-[10px] font-mono text-white">{getFilesUpdated(log)}</span>
                                                        </div>
                                                    )}
                                                    {log.status === 'success' && getBackupBranch(log) && (
                                                        <button 
                                                            onClick={() => setShowRollbackConfirm(getBackupBranch(log))}
                                                            className="shrink-0 px-5 py-2.5 bg-red-500/5 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                                        >
                                                            {t('system_updates.history.rollback')}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-4 space-y-6">
                        {/* GitHub Integration Widget */}
                        <div className={`bg-[#0A0A15]/80 border rounded-[2.5rem] p-8 backdrop-blur-3xl shadow-2xl relative overflow-hidden group ${systemInfo?.github_installation_id ? 'border-green-500/20 shadow-green-500/5' : 'border-primary/20 shadow-primary/5'}`}>
                            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                                <Github className="w-20 h-20" />
                            </div>
                            
                            <div className="mb-8 space-y-2">
                                <h3 className="text-xl font-black text-white italic tracking-tighter uppercase flex items-center gap-3">
                                    <Github className="w-6 h-6 text-primary" />
                                    {t('system_updates.github_widget.title')}
                                </h3>
                                {systemInfo?.github_installation_id ? (
                                    <>
                                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full text-green-500 text-[10px] font-black uppercase tracking-widest italic animate-in fade-in zoom-in duration-700">
                                        <ShieldCheck className="w-3 h-3" /> {t('system_updates.github_widget.connected')}
                                    </div>
                                    </>
                                ) : (
                                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 border border-primary/20 rounded-full text-primary text-[10px] font-black uppercase tracking-widest italic">
                                        <Unplug className="w-3 h-3" /> {t('system_updates.github_widget.not_connected')}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-6">
                                {systemInfo?.github_installation_id ? (
                                    <>
                                    <button 
                                        onClick={() => setShowSyncConfirm(true)}
                                        disabled={syncingFiles}
                                        className="w-full bg-primary hover:bg-primary-hover text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-primary/20 transition-all active:scale-95 italic overflow-hidden relative group"
                                    >
                                        <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 skew-x-12" />
                                        <RefreshCw className={`w-4 h-4 ${syncingFiles ? 'animate-spin' : ''}`} />
                                        {t('system_updates.github_widget.sync_code')}
                                    </button>
                                    <p className="text-[10px] text-gray-500 leading-relaxed">
                                        {t('system_updates.github_widget.sync_code_desc')}
                                    </p>
                                    </>
                                ) : (
                                    <div className="space-y-5">
                                        <p className="text-sm text-gray-500 font-medium leading-relaxed">
                                            {t('system_updates.github_widget.connect_desc')}
                                        </p>
                                        <a
                                            href={GITHUB_UPDATE_CONFIG.INSTALL_URL}
                                            onClick={() => {
                                                if (typeof window === 'undefined') return;
                                                if (installationId.trim()) {
                                                    window.localStorage.setItem(GITHUB_INSTALLATION_DRAFT_KEY, installationId.trim());
                                                }
                                                if (repository.trim()) {
                                                    window.localStorage.setItem(GITHUB_REPOSITORY_DRAFT_KEY, repository.trim());
                                                }
                                            }}
                                            target="_blank" 
                                            rel="noreferrer"
                                            className="w-full bg-white text-black py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl transition-all hover:bg-gray-100 italic"
                                        >
                                            <Github className="w-5 h-5" /> {t('system_updates.github_widget.connect_cta')}
                                        </a>
                                    </div>
                                )}

                                <div className="pt-6 border-t border-white/5">
                                    <details className="group">
                                        <summary className="text-[10px] font-black text-gray-600 hover:text-white uppercase tracking-[0.2em] cursor-pointer list-none flex items-center gap-2 transition-colors">
                                            <SettingsIcon className="w-3.5 h-3.5" /> 
                                            {t('system_updates.github_widget.technical_settings')}
                                            <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform ml-auto" />
                                        </summary>
                                        <form onSubmit={handleUpdateGithub} className="mt-6 space-y-4 animate-in fade-in slide-in-from-top-2">
                                            <div className="space-y-2">
                                                <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">{t('system_updates.github.installation_id')}</label>
                                                <input
                                                    type="text"
                                                    value={installationId}
                                                    onChange={e => setInstallationId(e.target.value)}
                                                    className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white font-mono focus:border-primary/50 outline-none"
                                                    placeholder="ex: 11648..."
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">{t('system_updates.github_widget.repository_name')}</label>
                                                <input
                                                    type="text"
                                                    value={repository}
                                                    onChange={e => setRepository(e.target.value)}
                                                    className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white font-mono focus:border-primary/50 outline-none"
                                                    placeholder="owner/repo"
                                                />
                                            </div>
                                            <div className="flex gap-2">
                                                <button type="submit" className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 p-3 rounded-xl text-xs font-black text-white transition-all">
                                                    {t('system_updates.github.save')}
                                                </button>
                                                <button type="button" onClick={handleTestConnection} className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 p-3 rounded-xl text-xs font-black text-white transition-all">
                                                    {testingConnection ? t('system_updates.actions.testing') : t('system_updates.github.test')}
                                                </button>
                                            </div>
                                        </form>
                                    </details>
                                </div>
                            </div>
                        </div>

                        {/* Backup Shield */}
                        <div className="bg-red-500/5 border border-red-500/20 rounded-[2.5rem] p-8 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-8 opacity-10">
                                    <Shield className="w-16 h-16 text-red-500" />
                                </div>
                                <h3 className="text-sm font-black text-red-500 flex items-center gap-3 uppercase italic tracking-tighter mb-3">
                                    <AlertTriangle className="w-4 h-4" />
                                    {t('system_updates.backup_shield.title')}
                                </h3>
                                <p className="text-[11px] text-gray-400 leading-relaxed font-medium">
                                    {t('system_updates.backup_shield.description')}
                                </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modals */}
            <ConfirmModal
                isOpen={showDatabaseConfirm}
                onClose={() => setShowDatabaseConfirm(false)}
                onConfirm={handleApplyDatabaseUpdate}
                title={<div className="flex items-center gap-2 italic uppercase font-black"><Database className="w-5 h-5 text-blue-400" /> {t('system_updates.dialogs.update_db_title')}</div>}
                message={t('system_updates.dialogs.update_db_message')}
                confirmText={t('system_updates.dialogs.apply_schema')}
                cancelText={t('common.cancel', 'Cancelar')}
                loading={applyingDatabaseUpdate}
            />

            <ConfirmModal
                isOpen={showSyncConfirm}
                onClose={() => setShowSyncConfirm(false)}
                onConfirm={handleSyncFiles}
                title={<div className="flex items-center gap-2 italic uppercase font-black"><RefreshCw className="w-5 h-5 text-primary" /> {t('system_updates.dialogs.sync_code_title')}</div>}
                message={t('system_updates.dialogs.sync_code_message')}
                confirmText={t('system_updates.dialogs.confirm_sync')}
                cancelText={t('common.cancel', 'Cancelar')}
                loading={syncingFiles}
            />

            <ConfirmModal
                isOpen={!!showRollbackConfirm}
                onClose={() => setShowRollbackConfirm(null)}
                onConfirm={() => showRollbackConfirm && handleRollback(showRollbackConfirm)}
                title={<div className="flex items-center gap-2 italic uppercase font-black text-red-500"><History className="w-5 h-5" /> {t('system_updates.dialogs.rollback_title')}</div>}
                message={
                    <div className="space-y-4">
                        <p className="text-sm font-medium text-gray-300">{t('system_updates.dialogs.rollback_message')}</p>
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                            <span className="text-[10px] font-black text-red-500 uppercase tracking-widest flex items-center gap-2 mb-2">
                                <AlertTriangle className="w-4 h-4" /> {t('system_updates.dialogs.rollback_warning_title')}
                            </span>
                            <p className="text-[11px] text-red-400/80 leading-relaxed">{t('system_updates.dialogs.rollback_warning_message')}</p>
                        </div>
                    </div>
                }
                confirmText={t('system_updates.dialogs.execute_rollback')}
                cancelText={t('common.cancel', 'Cancelar')}
                loading={rollingBack}
            />
        </Layout>
    );
};
