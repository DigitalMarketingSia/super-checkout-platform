import React, { useState, useEffect } from 'react';
import { Layout } from '../../components/Layout';
import { Button } from '../../components/ui/Button';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Settings as SettingsIcon,
  Shield,
  ShieldCheck,
  Search,
  Github,
  Zap,
  Info,
  ChevronRight,
  AlertCircle,
  RefreshCw,
  History,
  Clock,
  Database,
  ArrowRight,
  Save,
  Activity,
  Cpu,
  Unplug
} from 'lucide-react';
import { SystemManager } from '../../services/systemManager';
import { SystemInfo, SystemFeature, SystemUpdateLog } from '../../types';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmModal } from '../../components/ui/Modal';
import { useFeatures } from '../../hooks/useFeatures';
import { APP_VERSION, SCHEMA_VERSION } from '../../config/version';

export const SystemUpdates = () => {
    const { t } = useTranslation('admin');
    const [loading, setLoading] = useState(true);
    const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
    const { rawFeatures: features, loading: featuresLoading, hasFeature, refresh: refreshFeatures } = useFeatures();
    
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
                toast.success(t('system_updates.status.already_latest', 'Sistema já está na versão mais recente.'));
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
        const result = await SystemManager.syncSystemFiles();
        if (result.success) {
            toast.success(result.message || `Sincronização concluída! ${result.filesUpdated} arquivos atualizados.`);
            fetchData();
        } else {
            toast.error(result.message || 'Falha na sincronização.');
        }
        setSyncingFiles(false);
        setShowSyncConfirm(false);
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
                toast.success('Integridade do schema validada!');
            } else {
                toast.error('Detectadas inconsistências no schema.');
            }
        } catch (err) {
            toast.error('Falha na auditoria.');
        } finally {
            setIsAuditing(false);
        }
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
                                System Integrity
                            </h1>
                        </div>
                        <p className="text-gray-400 font-medium flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(249,115,22,0.6)]"></span>
                            Monitoramento de versões, auditoria de schema e sincronização técnica via GitHub.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            onClick={handleCheckUpdate}
                            disabled={checkingUpdate}
                            className="bg-white/5 hover:bg-white/10 text-white border border-white/5 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95"
                        >
                            <RefreshCw className={`w-4 h-4 ${checkingUpdate ? 'animate-spin' : ''}`} />
                            {checkingUpdate ? 'Verificando...' : 'Check Pulse'}
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
                            <Shield className="w-4 h-4 text-primary" /> Stack Versions
                        </h3>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                                <span className="text-xs font-bold text-gray-400">Core Bundle</span>
                                <span className="text-lg font-black text-white font-mono italic">v{APP_VERSION}</span>
                            </div>
                            <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                                <span className="text-xs font-bold text-gray-400">Database Schema</span>
                                <span className="text-lg font-black text-white font-mono italic">v{systemInfo?.db_version || '1.0.0'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Schema Audit Card */}
                    <div className={`bg-[#0A0A15]/60 border rounded-[2rem] p-8 backdrop-blur-xl relative overflow-hidden group transition-all duration-500 ${auditResult?.is_healthy === false ? 'border-red-500/20' : 'border-white/5'}`}>
                        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                            <ShieldCheck className="w-24 h-24" />
                        </div>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                <Database className="w-4 h-4 text-primary" /> Schema Health
                            </h3>
                            <button 
                                onClick={handleRunAudit}
                                disabled={isAuditing}
                                className="p-2 bg-white/5 hover:bg-primary/20 rounded-xl border border-white/5 text-primary transition-all active:scale-95"
                            >
                                {isAuditing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                            </button>
                        </div>
                        
                        {auditResult ? (
                            <div className={`p-5 rounded-2xl border animate-in slide-in-from-top-4 ${auditResult.is_healthy ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                                <div className="flex items-center justify-between">
                                    <span className={`text-xs font-black uppercase italic ${auditResult.is_healthy ? 'text-green-500' : 'text-red-500'}`}>
                                        {auditResult.is_healthy ? 'Synchronized' : 'Drift Detected'}
                                    </span>
                                    <span className="text-[9px] font-mono text-gray-500">{new Date(auditResult.checked_at).toLocaleTimeString()}</span>
                                </div>
                                {!auditResult.is_healthy && (
                                    <div className="mt-3 space-y-1">
                                        {auditResult.drifts.slice(0, 2).map((d, i) => (
                                            <div key={i} className="text-[10px] text-red-400/80 font-medium truncate">
                                                • {d.type === 'table_missing' ? `Tabela ausente: ${d.name}` : `Coluna em falta: ${d.column}`}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="h-20 flex flex-col items-center justify-center border border-dashed border-white/5 rounded-2xl opacity-40">
                                <span className="text-[10px] font-black uppercase text-gray-500">Aguardando Auditoria</span>
                            </div>
                        )}
                    </div>

                    {/* Update Available Card */}
                    <div className={`bg-[#0A0A15]/60 border rounded-[2rem] p-8 backdrop-blur-xl relative overflow-hidden group transition-all duration-500 ${updateAvailable ? 'border-blue-500/30 shadow-lg shadow-blue-500/5' : 'border-white/5'}`}>
                        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Zap className="w-24 h-24 text-blue-500" />
                        </div>
                        <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <RefreshCw className="w-4 h-4 text-blue-500" /> Pipeline Status
                        </h3>
                        <div className="space-y-4">
                            <div className={`p-5 rounded-2xl border flex items-center justify-between ${updateAvailable ? 'bg-blue-500/10 border-blue-500/20 shadow-inner' : 'bg-white/5 border-white/5 opacity-50'}`}>
                                <div className="flex items-center gap-3">
                                    {updateAvailable ? <AlertCircle className="w-5 h-5 text-blue-400 animate-pulse" /> : <CheckCircle2 className="w-5 h-5 text-gray-600" />}
                                    <div className="flex flex-col">
                                        <span className={`text-xs font-black uppercase italic ${updateAvailable ? 'text-blue-400' : 'text-gray-400'}`}>
                                            {updateAvailable ? 'Updates Found' : 'System Locked'}
                                        </span>
                                        <span className="text-[9px] text-gray-500">v{SCHEMA_VERSION} Readiness</span>
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
                                        Módulos & Recursos
                                    </h3>
                                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Ativação Remota Licenciada</p>
                                </div>
                                <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 border border-primary/20 rounded-full">
                                    <span className="text-[8px] font-black text-primary uppercase tracking-widest animate-pulse">Live Pulse Sync</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {featuresLoading ? (
                                    <div className="col-span-2 py-12 flex flex-col items-center opacity-40">
                                        <RefreshCw className="w-8 h-8 animate-spin mb-4" />
                                        <span className="text-[10px] font-black uppercase tracking-widest italic">Fetching Remote Features...</span>
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
                                                    {feature.is_enabled ? 'Active' : 'Locked'}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* Snapshot History */}
                        <div className="bg-[#0F0F13]/60 border border-white/5 rounded-[2.5rem] p-8 backdrop-blur-xl">
                            <div className="flex items-center justify-between mb-8 px-2">
                                <div className="space-y-1">
                                    <h3 className="text-xl font-black text-white italic tracking-tighter uppercase flex items-center gap-3">
                                        <History className="w-6 h-6 text-primary" />
                                        Snapshot History
                                    </h3>
                                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Logs de Sincronização e Backups</p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {updateHistory.length === 0 ? (
                                    <div className="py-12 flex flex-col items-center opacity-20 border border-dashed border-white/10 rounded-3xl">
                                        <Clock className="w-8 h-8 mb-4" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">Nenhum snapshot registrado</span>
                                    </div>
                                ) : (
                                    updateHistory.map((log) => (
                                        <div key={log.id} className="p-6 bg-white/[0.02] border border-white/5 rounded-3xl hover:bg-white/[0.04] transition-all group overflow-hidden relative">
                                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-10 h-10 rounded-2xl border flex items-center justify-center ${log.status === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
                                                        {log.status === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] font-black text-gray-500 font-mono tracking-widest uppercase italic">{new Date(log.executed_at).toLocaleString()}</span>
                                                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter ${log.status === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                                                {log.status === 'success' ? 'Deployed' : 'Fail'}
                                                            </span>
                                                        </div>
                                                        <span className="text-sm font-black text-white tracking-tight mt-1 truncate max-w-[300px]">
                                                            {log.backup_branch ? `Backup Snapshot: ${log.backup_branch}` : 'System Revalidation'}
                                                        </span>
                                                    </div>
                                                </div>
                                                
                                                <div className="flex items-center gap-3">
                                                    <div className="hidden md:flex flex-col items-end opacity-40">
                                                        <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Commit Hash</span>
                                                        <span className="text-[10px] font-mono text-white">{log.commit_hash?.slice(0, 8) || 'Manual'}</span>
                                                    </div>
                                                    {log.status === 'success' && log.backup_branch && (
                                                        <button 
                                                            onClick={() => setShowRollbackConfirm(log.backup_branch!)}
                                                            className="px-6 py-2.5 bg-red-500/5 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
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
                                    GitHub Hub
                                </h3>
                                {systemInfo?.github_installation_id ? (
                                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full text-green-500 text-[10px] font-black uppercase tracking-widest italic animate-in fade-in zoom-in duration-700">
                                        <ShieldCheck className="w-3 h-3" /> System Connected
                                    </div>
                                ) : (
                                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 border border-primary/20 rounded-full text-primary text-[10px] font-black uppercase tracking-widest italic">
                                        <Unplug className="w-3 h-3" /> Integration Offline
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
                                        Sync Now
                                    </button>
                                ) : (
                                    <div className="space-y-5">
                                        <p className="text-sm text-gray-500 font-medium leading-relaxed">
                                            Conecte sua conta do GitHub para habilitar a implantação automatizada de patches e atualizações de segurança.
                                        </p>
                                        <a 
                                            href="https://github.com/apps/super-checkout-app/installations/new" 
                                            target="_blank" 
                                            rel="noreferrer"
                                            className="w-full bg-white text-black py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl transition-all hover:bg-gray-100 italic"
                                        >
                                            <Github className="w-5 h-5" /> Install GitHub App
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
                                    Backup automático ativado. Snapshots de banco e código são criados antes de qualquer atualização.
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
                title={<div className="flex items-center gap-2 italic uppercase font-black"><RefreshCw className="w-5 h-5 text-primary" /> Sincronizar Hub</div>}
                message="Isso irá substituir os arquivos locais pelos arquivos oficiais do repositório configurado. Deseja iniciar a implantação?"
                confirmText="Confirmar Sincronização"
                cancelText="Cancelar"
                loading={syncingFiles}
            />

            <ConfirmModal
                isOpen={!!showRollbackConfirm}
                onClose={() => setShowRollbackConfirm(null)}
                onConfirm={() => showRollbackConfirm && handleRollback(showRollbackConfirm)}
                title={<div className="flex items-center gap-2 italic uppercase font-black text-red-500"><History className="w-5 h-5" /> Reverter Snapshot</div>}
                message={
                    <div className="space-y-4">
                        <p className="text-sm font-medium text-gray-300">Tem certeza que deseja reverter o sistema para este estado anterior? Esta ação não pode ser desfeita automaticamente.</p>
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                            <span className="text-[10px] font-black text-red-500 uppercase tracking-widest flex items-center gap-2 mb-2">
                                <AlertTriangle className="w-4 h-4" /> Hard Reset Warning
                            </span>
                            <p className="text-[11px] text-red-400/80 leading-relaxed">Apenas arquivos de código serão revertidos. Mudanças estruturais no banco de dados devem ser tratadas manualmente via SQL Audit.</p>
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
