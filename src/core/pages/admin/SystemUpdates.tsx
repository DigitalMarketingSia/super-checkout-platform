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
  ArrowRight,
  Activity,
  Cpu,
  Unplug
} from 'lucide-react';
import { SystemManager } from '../../services/systemManager';
import { SystemInfo, SystemUpdateLog } from '../../types';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmModal } from '../../components/ui/Modal';
import { useFeatures } from '../../hooks/useFeatures';
import { APP_VERSION, SCHEMA_VERSION } from '../../config/version';
import { GITHUB_UPDATE_CONFIG } from '../../config/github';

export const SystemUpdates = () => {
    const { t } = useTranslation('admin');
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
            
            if (info) {
                setInstallationId(info.github_installation_id || '');
                setRepository(info.github_repository || '');
            }
        } finally {
            setLoading(false);
        }
    };

    const checkUrlParams = async () => {
        const params = new URLSearchParams(window.location.search);
        const instId = params.get('installation_id');
        const setupAction = params.get('setup_action');

        if (instId && setupAction === 'install') {
            setInstallationId(instId);
            toast.loading('Finalizando integração com GitHub...');
            
            const success = await SystemManager.updateGitHubIntegration(instId, repository);
            if (success) {
                toast.success('GitHub conectado com sucesso!');
                window.history.replaceState({}, document.title, window.location.pathname);
                fetchData();
            }
        }
    };

    const handleCheckUpdate = async () => {
        setCheckingUpdate(true);
        try {
            const required = await SystemManager.checkMigrationsRequired();
            if (required) {
                setUpdateAvailable(true);
                toast.info(`Atualizações de banco de dados (até v${SCHEMA_VERSION}) disponíveis.`);
            } else {
                setUpdateAvailable(false);
                toast.success(`Banco de dados sincronizado com o schema v${SCHEMA_VERSION}.`);
            }
        } finally {
            setCheckingUpdate(false);
        }
    };

    const handleUpdateGithub = async (e: React.FormEvent) => {
        e.preventDefault();
        setUpdatingGithub(true);
        const success = await SystemManager.updateGitHubIntegration(installationId, repository);
        if (success) {
            toast.success(t('system_updates.github.success', 'Integração GitHub atualizada!'));
            fetchData();
        } else {
            toast.error(t('system_updates.github.error', 'Erro ao atualizar integração.'));
        }
        setUpdatingGithub(false);
    };

    const handleTestConnection = async () => {
        setTestingConnection(true);
        const result = await SystemManager.testGitHubConnection();
        if (result.success) {
            toast.success(result.message || 'Conexão testada com sucesso!');
        } else {
            toast.error(result.message || 'Falha no teste de conexão.');
        }
        setTestingConnection(false);
    };

    const handleSyncFiles = async () => {
        setSyncingFiles(true);
        try {
            const result = await SystemManager.syncSystemFiles();
            if (result.success) {
                if ((result.filesUpdated || 0) > 0) {
                    toast.success(`${result.filesUpdated} arquivos sincronizados. Aguarde o deploy da Vercel e recarregue a página.`);
                } else {
                    toast.success(result.message || 'Nenhum arquivo novo encontrado no repositório oficial.');
                }
                if (result.historyLogged === false) {
                    toast.warning('Sincronização concluída, mas o histórico local não pôde ser gravado.');
                }
                fetchData();
            } else {
                toast.error(result.message || 'Falha na sincronização.');
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
            toast.success(result.message || 'Sistema revertido com sucesso!');
            fetchData();
        } else {
            toast.error(result.message || 'Falha no rollback.');
        }
        setRollingBack(false);
        setShowRollbackConfirm(null);
    };

    const handleRunAudit = async () => {
        setIsAuditing(true);
        try {
            const result = await SystemManager.performSchemaAudit();
            setAuditResult(result);
            if (result.is_healthy) {
                toast.success('Estrutura principal do banco validada!');
            } else {
                toast.error('Foram encontradas inconsistências no banco.');
            }
        } catch (err: any) {
            setAuditResult({
                is_healthy: false,
                drifts: [{
                    type: 'schema_check_failed',
                    name: 'auditoria',
                    message: err?.message || 'Não foi possível executar a auditoria.'
                }],
                checked_at: new Date().toISOString()
            });
            toast.error(err?.message || 'Falha na auditoria.');
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
    const formatDrift = (drift: any) => {
        if (drift.type === 'table_missing') return `Tabela ausente: ${drift.name}`;
        if (drift.type === 'column_missing') return `Coluna ausente: ${drift.name}.${drift.column || '?'}`;
        return drift.message || `Verificar ${drift.name || 'schema'}`;
    };

    if (loading) {
        return (
            <Layout>
                <div className="flex flex-col items-center justify-center h-64 gap-4">
                    <RefreshCw className="w-10 h-10 text-primary/40 animate-spin" />
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest italic">Sincronizando Core...</span>
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
                                Atualizações do Sistema
                            </h1>
                        </div>
                        <p className="text-gray-400 font-medium flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(249,115,22,0.6)]"></span>
                            Versões instaladas, saúde do banco e sincronização de código via GitHub.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            onClick={handleCheckUpdate}
                            disabled={checkingUpdate}
                            className="bg-white/5 hover:bg-white/10 text-white border border-white/5 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95"
                        >
                            <RefreshCw className={`w-4 h-4 ${checkingUpdate ? 'animate-spin' : ''}`} />
                            {checkingUpdate ? 'Verificando...' : 'Verificar Banco'}
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
                            <Shield className="w-4 h-4 text-primary" /> Versões Instaladas
                        </h3>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                                <span className="text-xs font-bold text-gray-400">Código do Sistema</span>
                                <span className="text-lg font-black text-white font-mono italic">v{APP_VERSION}</span>
                            </div>
                            <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                                <span className="text-xs font-bold text-gray-400">Banco de Dados</span>
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
                                <Database className="w-4 h-4 text-primary" /> Auditoria do Banco
                            </h3>
                            <button 
                                onClick={handleRunAudit}
                                disabled={isAuditing}
                                title="Executar auditoria do banco"
                                className="relative z-20 shrink-0 px-3 py-2 bg-white/5 hover:bg-primary/20 rounded-xl border border-white/5 text-primary transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50"
                            >
                                {isAuditing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                <span className="text-[9px] font-black uppercase tracking-widest">Auditar</span>
                            </button>
                        </div>
                        <p className="text-[11px] text-gray-500 font-medium leading-relaxed mb-4 relative z-10">
                            Valida tabelas e colunas essenciais da instalação, como licença, conta, gateways, templates e logs de atualização.
                        </p>
                        
                        {auditResult ? (
                            <div className={`p-5 rounded-2xl border animate-in slide-in-from-top-4 relative z-10 ${auditResult.is_healthy ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                                <div className="flex items-center justify-between">
                                    <span className={`text-xs font-black uppercase italic ${auditResult.is_healthy ? 'text-green-500' : 'text-red-500'}`}>
                                        {auditResult.is_healthy ? 'Estrutura Validada' : 'Ajuste Necessário'}
                                    </span>
                                    <span className="text-[9px] font-mono text-gray-500">{new Date(auditResult.checked_at).toLocaleTimeString()}</span>
                                </div>
                                {auditResult.is_healthy && (
                                    <div className="mt-3 text-[10px] text-green-400/80 font-medium leading-relaxed">
                                        Banco compatível com o schema v{SCHEMA_VERSION}. Nenhum desvio crítico encontrado.
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
                                <span className="text-[10px] font-black uppercase text-gray-500">Auditoria ainda não executada</span>
                                <span className="text-[10px] text-gray-600 mt-2 leading-relaxed">Clique na lupa para conferir se o banco tem a estrutura mínima esperada.</span>
                            </div>
                        )}
                    </div>

                    {/* Update Available Card */}
                    <div className={`bg-[#0A0A15]/60 border rounded-[2rem] p-8 backdrop-blur-xl relative overflow-hidden group transition-all duration-500 ${updateAvailable ? 'border-blue-500/30 shadow-lg shadow-blue-500/5' : 'border-white/5'}`}>
                        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Zap className="w-24 h-24 text-blue-500" />
                        </div>
                        <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <RefreshCw className="w-4 h-4 text-blue-500" /> Status do Banco
                        </h3>
                        <div className="space-y-4">
                            <div className={`p-5 rounded-2xl border flex items-center justify-between ${updateAvailable ? 'bg-blue-500/10 border-blue-500/20 shadow-inner' : 'bg-white/5 border-white/5 opacity-50'}`}>
                                <div className="flex items-center gap-3">
                                    {updateAvailable ? <AlertCircle className="w-5 h-5 text-blue-400 animate-pulse" /> : <CheckCircle2 className="w-5 h-5 text-gray-600" />}
                                    <div className="flex flex-col">
                                        <span className={`text-xs font-black uppercase italic ${updateAvailable ? 'text-blue-400' : 'text-gray-400'}`}>
                                            {updateAvailable ? 'Atualização Disponível' : 'Banco Sincronizado'}
                                        </span>
                                        <span className="text-[9px] text-gray-500">Schema v{SCHEMA_VERSION} pronto</span>
                                    </div>
                                </div>
                                {updateAvailable && (
                                    <button 
                                        onClick={handleSyncFiles}
                                        className="p-2 bg-blue-500 text-white rounded-xl shadow-lg shadow-blue-500/20 active:scale-95 transition-transform"
                                    >
                                        <ArrowRight className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
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
                                        Recursos Licenciados
                                    </h3>
                                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Recursos ativos nesta instalação</p>
                                </div>
                                <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 border border-primary/20 rounded-full">
                                    <span className="text-[8px] font-black text-primary uppercase tracking-widest animate-pulse">Licença Sincronizada</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {featuresLoading ? (
                                    <div className="col-span-2 py-12 flex flex-col items-center opacity-40">
                                        <RefreshCw className="w-8 h-8 animate-spin mb-4" />
                                        <span className="text-[10px] font-black uppercase tracking-widest italic">Carregando recursos...</span>
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
                                                    {feature.is_enabled ? 'Ativo' : 'Bloqueado'}
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
                                        Histórico de Atualizações
                                    </h3>
                                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Sincronizações, commits e backups de código</p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {updateHistory.length === 0 ? (
                                    <div className="py-12 px-6 flex flex-col items-center opacity-40 border border-dashed border-white/10 rounded-3xl text-center">
                                        <Clock className="w-8 h-8 mb-4" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">Nenhuma sincronização registrada</span>
                                        <span className="text-[10px] text-gray-500 mt-3 max-w-md leading-relaxed">
                                            O histórico registra sincronizações feitas depois da correção v1.1.7. Execute Sincronizar Código novamente para criar o primeiro registro local.
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
                                                            <span className="text-[10px] font-black text-gray-500 font-mono tracking-widest uppercase italic">{new Date(log.executed_at).toLocaleString()}</span>
                                                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter ${log.status === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                                                {log.status === 'success' ? 'Sucesso' : 'Falha'}
                                                            </span>
                                                        </div>
                                                        <span className="text-sm font-black text-white tracking-tight mt-1 break-words">
                                                            {getBackupBranch(log) ? `Backup de código: ${getBackupBranch(log)}` : (log.message || 'Verificação registrada')}
                                                        </span>
                                                    </div>
                                                </div>
                                                
                                                <div className="flex flex-wrap items-center justify-start 2xl:justify-end gap-3">
                                                    <div className="flex flex-col items-start 2xl:items-end opacity-60 min-w-[72px]">
                                                        <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Commit</span>
                                                        <span className="text-[10px] font-mono text-white">{getCommitHash(log)?.slice(0, 8) || 'Manual'}</span>
                                                    </div>
                                                    {getFilesUpdated(log) !== null && (
                                                        <div className="flex flex-col items-start 2xl:items-end opacity-60 min-w-[58px]">
                                                            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Arquivos</span>
                                                            <span className="text-[10px] font-mono text-white">{getFilesUpdated(log)}</span>
                                                        </div>
                                                    )}
                                                    {log.status === 'success' && getBackupBranch(log) && (
                                                        <button 
                                                            onClick={() => setShowRollbackConfirm(getBackupBranch(log))}
                                                            className="shrink-0 px-5 py-2.5 bg-red-500/5 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                                        >
                                                            Rollback
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
                                    Atualização via GitHub
                                </h3>
                                {systemInfo?.github_installation_id ? (
                                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full text-green-500 text-[10px] font-black uppercase tracking-widest italic animate-in fade-in zoom-in duration-700">
                                        <ShieldCheck className="w-3 h-3" /> GitHub Conectado
                                    </div>
                                ) : (
                                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 border border-primary/20 rounded-full text-primary text-[10px] font-black uppercase tracking-widest italic">
                                        <Unplug className="w-3 h-3" /> GitHub Não Conectado
                                    </div>
                                )}
                            </div>

                            <div className="space-y-6">
                                {systemInfo?.github_installation_id ? (
                                    <button 
                                        onClick={() => setShowSyncConfirm(true)}
                                        disabled={syncingFiles}
                                        className="w-full bg-primary hover:bg-primary-hover text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-primary/20 transition-all active:scale-95 italic overflow-hidden relative group"
                                    >
                                        <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 skew-x-12" />
                                        <RefreshCw className={`w-4 h-4 ${syncingFiles ? 'animate-spin' : ''}`} />
                                        Sincronizar Código
                                    </button>
                                ) : (
                                    <div className="space-y-5">
                                        <p className="text-sm text-gray-500 font-medium leading-relaxed">
                                            Conecte o GitHub App ao repositório desta instalação para receber atualizações de código.
                                        </p>
                                        <a
                                            href={GITHUB_UPDATE_CONFIG.INSTALL_URL}
                                            target="_blank" 
                                            rel="noreferrer"
                                            className="w-full bg-white text-black py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl transition-all hover:bg-gray-100 italic"
                                        >
                                            <Github className="w-5 h-5" /> Conectar GitHub App
                                        </a>
                                    </div>
                                )}

                                <div className="pt-6 border-t border-white/5">
                                    <details className="group">
                                        <summary className="text-[10px] font-black text-gray-600 hover:text-white uppercase tracking-[0.2em] cursor-pointer list-none flex items-center gap-2 transition-colors">
                                            <SettingsIcon className="w-3.5 h-3.5" /> 
                                            Configurações Técnicas
                                            <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform ml-auto" />
                                        </summary>
                                        <form onSubmit={handleUpdateGithub} className="mt-6 space-y-4 animate-in fade-in slide-in-from-top-2">
                                            <div className="space-y-2">
                                                <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">Installation ID</label>
                                                <input
                                                    type="text"
                                                    value={installationId}
                                                    onChange={e => setInstallationId(e.target.value)}
                                                    className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white font-mono focus:border-primary/50 outline-none"
                                                    placeholder="ex: 11648..."
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">Repository Name</label>
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
                                                    Salvar
                                                </button>
                                                <button type="button" onClick={handleTestConnection} className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 p-3 rounded-xl text-xs font-black text-white transition-all">
                                                    Testar
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
                                    Segurança Operacional
                                </h3>
                                <p className="text-[11px] text-gray-400 leading-relaxed font-medium">
                                    Antes de sincronizar arquivos alterados, o sistema cria uma branch de backup do código. Alterações de banco seguem por migrations e auditoria separadas.
                                </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modals */}
            <ConfirmModal
                isOpen={showSyncConfirm}
                onClose={() => setShowSyncConfirm(false)}
                onConfirm={handleSyncFiles}
                title={<div className="flex items-center gap-2 italic uppercase font-black"><RefreshCw className="w-5 h-5 text-primary" /> Sincronizar Código</div>}
                message="Isso irá copiar os arquivos oficiais para o repositório desta instalação. Quando houver mudanças, uma branch de backup será criada antes do commit. Depois, aguarde o deploy da Vercel."
                confirmText="Confirmar Sync"
                cancelText="Cancelar"
                loading={syncingFiles}
            />

            <ConfirmModal
                isOpen={!!showRollbackConfirm}
                onClose={() => setShowRollbackConfirm(null)}
                onConfirm={() => showRollbackConfirm && handleRollback(showRollbackConfirm)}
                title={<div className="flex items-center gap-2 italic uppercase font-black text-red-500"><History className="w-5 h-5" /> Reverter Código</div>}
                message={
                    <div className="space-y-4">
                        <p className="text-sm font-medium text-gray-300">Tem certeza que deseja reverter o código para este backup? Esta ação cria um novo estado no repositório e deve ser seguida por deploy da Vercel.</p>
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                            <span className="text-[10px] font-black text-red-500 uppercase tracking-widest flex items-center gap-2 mb-2">
                                <AlertTriangle className="w-4 h-4" /> Aviso de Rollback
                            </span>
                            <p className="text-[11px] text-red-400/80 leading-relaxed">Apenas arquivos de código serão revertidos. Mudanças estruturais no banco de dados devem ser tratadas por migration ou SQL validado separadamente.</p>
                        </div>
                    </div>
                }
                confirmText="Executar Rollback"
                cancelText="Cancelar"
                loading={rollingBack}
            />
        </Layout>
    );
};
