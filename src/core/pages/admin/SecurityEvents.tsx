import React, { useEffect, useMemo, useState } from 'react';
import { 
    Activity, 
    AlertTriangle, 
    CheckCircle, 
    Clock, 
    RefreshCw, 
    ShieldAlert, 
    Terminal, 
    Search, 
    Filter, 
    Globe, 
    Lock, 
    User, 
    ChevronRight,
    SearchCode,
    Cpu,
    Zap
} from 'lucide-react';
import { Layout } from '../../components/Layout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { supabase } from '../../services/supabase';
import { getApiUrl } from '../../utils/apiUtils';

type SecurityEvent = {
  id: string;
  event_type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'FATAL';
  ip_address: string | null;
  user_id: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
};

const severityConfig: Record<SecurityEvent['severity'], { color: string; bg: string; border: string; glow: string }> = {
  INFO: { 
    color: 'text-blue-400', 
    bg: 'bg-blue-500/10', 
    border: 'border-blue-500/20',
    glow: 'shadow-[0_0_15px_rgba(59,130,246,0.3)]'
  },
  WARNING: { 
    color: 'text-amber-400', 
    bg: 'bg-amber-500/10', 
    border: 'border-amber-500/20',
    glow: 'shadow-[0_0_15px_rgba(245,158,11,0.3)]'
  },
  CRITICAL: { 
    color: 'text-red-400', 
    bg: 'bg-red-500/10', 
    border: 'border-red-500/20',
    glow: 'shadow-[0_0_15px_rgba(239,68,68,0.3)]'
  },
  FATAL: { 
    color: 'text-purple-400', 
    bg: 'bg-purple-500/10', 
    border: 'border-purple-500/20',
    glow: 'shadow-[0_0_15px_rgba(138,43,226,0.3)]'
  },
};

const eventLabels: Record<string, string> = {
  login_success: 'Login realizado',
  login_2fa_required: 'Login aguardando 2FA',
  login_failed: 'Falha de login',
  login_rate_limited: 'Login bloqueado por limite',
  login_progressive_blocked: 'Bloqueio progressivo aplicado',
  login_progressive_notification_sent: 'Alerta de login enviado',
  login_progressive_notification_failed: 'Falha ao enviar alerta de login',
  login_progressive_notification_skipped: 'Alerta de login não enviado',
  two_factor_login_failed: 'Falha no 2FA do login',
  two_factor_enable_failed: 'Falha ao ativar 2FA',
  two_factor_disable_failed: 'Falha ao desativar 2FA',
  two_factor_verified: '2FA validado',
  two_factor_setup_started: '2FA preparada',
  password_reset_requested: 'Reset de senha solicitado',
  password_reset_request_blocked: 'Reset de senha bloqueado',
  password_reset_request_failed: 'Falha no reset de senha',
  password_reset_request_invalid: 'Reset de senha inválido',
  password_changed: 'Senha alterada',
  email_changed: 'E-mail alterado',
  gateway_credentials_changed: 'Credenciais de gateway alteradas',
  gateway_credentials_change_failed: 'Falha ao alterar gateway',
  two_factor_enabled: '2FA ativado',
  two_factor_disabled: '2FA desativado',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value));
}

function summarizeMetadata(metadata: Record<string, any> | null) {
  if (!metadata) return null;
  const safeKeys = [
    'target',
    'email',
    'reason',
    'failed_attempts',
    'block_duration_sec',
    'blocked_until',
    'source',
    'installation_id'
  ];
  
  const entries = safeKeys
    .filter((key) => metadata[key] !== undefined && metadata[key] !== null)
    .map((key) => ({ key, value: String(metadata[key]) }));
    
  if (entries.length === 0) return null;
  return entries;
}

export const SecurityEvents = () => {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'ALL' | SecurityEvent['severity']>('ALL');

  const loadEvents = async () => {
    setLoading(true);
    setError(null);

    try {
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch(getApiUrl('/api/admin?action=security-events&limit=100'), {
          headers: {
            Authorization: `Bearer ${session?.access_token || ''}`,
          },
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          setError(payload.error || 'Erro ao carregar eventos.');
          setEvents([]);
        } else {
          setEvents((payload.events || []) as SecurityEvent[]);
        }
    } catch (err: any) {
        setError(err.message || 'Falha na conexão com o protocolo.');
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const stats = useMemo(() => {
    return events.reduce(
      (acc, event) => {
        acc.total += 1;
        acc[event.severity] += 1;
        return acc;
      },
      { total: 0, INFO: 0, WARNING: 0, CRITICAL: 0, FATAL: 0 }
    );
  }, [events]);

  const filteredEvents = useMemo(() => {
    return events.filter(event => {
        const matchesSearch = 
            event.event_type.toLowerCase().includes(search.toLowerCase()) || 
            (eventLabels[event.event_type] || '').toLowerCase().includes(search.toLowerCase()) ||
            (event.ip_address || '').includes(search);
        
        const matchesSeverity = activeFilter === 'ALL' || event.severity === activeFilter;
        
        return matchesSearch && matchesSeverity;
    });
  }, [events, search, activeFilter]);

  return (
    <Layout>
      {/* Tactical Header */}
      <div className="mb-12 flex flex-col md:flex-row md:items-center justify-between gap-6 animate-in fade-in slide-in-from-top duration-700">
        <div>
          <h1 className="text-4xl font-black text-white italic tracking-tighter flex items-center gap-3">
            <ShieldAlert className="w-10 h-10 text-primary drop-shadow-[0_0_15px_rgba(138,43,226,0.5)]" />
            SECURITY <span className="text-primary">AUDIT</span>
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <span className="flex items-center gap-1.5 bg-primary/10 text-primary px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase border border-primary/20">
               <Terminal className="w-3 h-3" /> Integrity Monitoring Active
            </span>
            <span className="text-gray-500 text-xs font-medium">Real-time Authorization Logs</span>
          </div>
        </div>
        <div className="flex gap-3">
            <Button 
                onClick={loadEvents} 
                variant="ghost" 
                size="icon"
                disabled={loading}
                className="bg-white/5 hover:bg-white/10 border border-white/5 h-12 w-12 rounded-xl transition-all duration-300"
            >
                <RefreshCw className={`w-5 h-5 text-gray-400 ${loading ? 'animate-spin text-primary' : ''}`} />
            </Button>
            <div className="px-6 h-12 flex items-center bg-[#0A0A15]/60 border border-white/5 rounded-xl">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Protocol Live</span>
                </div>
            </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12 animate-in fade-in slide-in-from-bottom duration-700 delay-100">
        <button 
            onClick={() => setActiveFilter('ALL')}
            className={`group p-6 rounded-[2rem] border transition-all duration-500 text-left relative overflow-hidden ${
                activeFilter === 'ALL' ? 'bg-white/10 border-white/20 shadow-xl' : 'bg-[#0A0A15]/40 border-white/5 hover:border-white/10'
            }`}
        >
          {activeFilter === 'ALL' && <div className="absolute inset-0 bg-primary/5 blur-3xl" />}
          <div className="text-[10px] uppercase font-black text-gray-500 tracking-[0.2em] mb-4">Total events</div>
          <div className="flex items-end justify-between">
            <div className={`text-4xl font-portal-display italic tracking-tighter ${activeFilter === 'ALL' ? 'text-white' : 'text-gray-400'}`}>
                {stats.total.toString().padStart(2, '0')}
            </div>
            <Activity className={`w-6 h-6 ${activeFilter === 'ALL' ? 'text-primary' : 'text-gray-800'}`} />
          </div>
        </button>

        <button 
            onClick={() => setActiveFilter('INFO')}
            className={`group p-6 rounded-[2rem] border transition-all duration-500 text-left relative overflow-hidden ${
                activeFilter === 'INFO' ? 'bg-blue-500/10 border-blue-500/30 shadow-blue-500/10' : 'bg-[#0A0A15]/40 border-white/5 hover:border-blue-500/20'
            }`}
        >
          <div className="text-[10px] uppercase font-black text-blue-500/50 tracking-[0.2em] mb-4">Integrity: OK</div>
          <div className="flex items-end justify-between">
            <div className={`text-4xl font-portal-display italic tracking-tighter ${activeFilter === 'INFO' ? 'text-blue-400' : 'text-gray-400'}`}>
                {stats.INFO.toString().padStart(2, '0')}
            </div>
            <CheckCircle className={`w-6 h-6 ${activeFilter === 'INFO' ? 'text-blue-500' : 'text-gray-800'}`} />
          </div>
        </button>

        <button 
            onClick={() => setActiveFilter('WARNING')}
            className={`group p-6 rounded-[2rem] border transition-all duration-500 text-left relative overflow-hidden ${
                activeFilter === 'WARNING' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-[#0A0A15]/40 border-white/5 hover:border-amber-500/20'
            }`}
        >
          <div className="text-[10px] uppercase font-black text-amber-500/50 tracking-[0.2em] mb-4">Warnings Check</div>
          <div className="flex items-end justify-between">
            <div className={`text-4xl font-portal-display italic tracking-tighter ${activeFilter === 'WARNING' ? 'text-amber-400' : 'text-gray-400'}`}>
                {stats.WARNING.toString().padStart(2, '0')}
            </div>
            <AlertTriangle className={`w-6 h-6 ${activeFilter === 'WARNING' ? 'text-amber-500' : 'text-gray-800'}`} />
          </div>
        </button>

        <button 
            onClick={() => setActiveFilter('CRITICAL')}
            className={`group p-6 rounded-[2rem] border transition-all duration-500 text-left relative overflow-hidden ${
                activeFilter === 'CRITICAL' || activeFilter === 'FATAL' ? 'bg-red-500/10 border-red-500/30' : 'bg-[#0A0A15]/40 border-white/5 hover:border-red-500/20'
            }`}
        >
          <div className="text-[10px] uppercase font-black text-red-500/50 tracking-[0.2em] mb-4">Defense Triggered</div>
          <div className="flex items-end justify-between">
            <div className={`text-4xl font-portal-display italic tracking-tighter ${activeFilter === 'CRITICAL' || activeFilter === 'FATAL' ? 'text-red-400' : 'text-gray-400'}`}>
                {(stats.CRITICAL + stats.FATAL).toString().padStart(2, '0')}
            </div>
            <Lock className={`w-6 h-6 ${activeFilter === 'CRITICAL' || activeFilter === 'FATAL' ? 'text-red-500' : 'text-gray-800'}`} />
          </div>
        </button>
      </div>

      {/* Advanced Filter Pod */}
      <div className="mb-8 animate-in fade-in slide-in-from-bottom duration-700 delay-200">
        <div className="relative group">
            <div className="absolute inset-0 bg-primary/5 blur-2xl rounded-full opacity-0 group-focus-within:opacity-100 transition-opacity duration-700" />
            <Card className="relative p-1.5 bg-[#0A0A15]/60 backdrop-blur-2xl border-white/5 rounded-2xl overflow-hidden shadow-2xl">
                <div className="relative flex items-center">
                    <Search className="absolute left-4 w-5 h-5 text-gray-500 group-focus-within:text-primary transition-colors" />
                    <input
                        type="text"
                        placeholder="Scan hashes, IP addresses or protocol labels..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-transparent border-none rounded-xl pl-12 pr-4 py-4 text-white placeholder:text-gray-600 focus:ring-0 outline-none transition-all font-medium"
                    />
                    <div className="absolute right-4 flex items-center gap-2">
                        <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 text-[9px] font-black text-gray-600 uppercase tracking-widest">
                            {filteredEvents.length} Logs Found
                        </div>
                    </div>
                </div>
            </Card>
        </div>
      </div>

      {/* Audit Log Feed */}
      <div className="animate-in fade-in slide-in-from-bottom duration-700 delay-300">
        <Card noPadding className="bg-[#0A0A15]/40 backdrop-blur-3xl border-white/5 rounded-[2.5rem] overflow-hidden">
            {error ? (
              <div className="m-12 p-8 rounded-3xl bg-red-500/5 border border-red-500/10 text-red-400 flex flex-col items-center gap-4 text-center">
                <div className="p-4 bg-red-500/20 rounded-2xl animate-pulse">
                    <AlertTriangle className="w-8 h-8" />
                </div>
                <div>
                    <h3 className="font-black italic text-lg uppercase tracking-tighter text-white">Grid Signal Lost</h3>
                    <p className="text-xs text-red-500/60 font-bold uppercase tracking-tight mt-1">{error}</p>
                </div>
                <Button onClick={loadEvents} className="mt-4 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl px-10">
                    Reconnect Pulse
                </Button>
              </div>
            ) : loading ? (
              <div className="p-32 text-center">
                <div className="relative inline-block">
                    <div className="w-20 h-20 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                    <ShieldAlert className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-primary animate-pulse" />
                </div>
                <div className="mt-6 text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] animate-pulse">Decrypting Security Logs...</div>
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="p-32 text-center">
                <div className="w-20 h-20 bg-emerald-500/10 rounded-[2rem] flex items-center justify-center mx-auto mb-6 border border-emerald-500/20">
                    <CheckCircle className="w-10 h-10 text-emerald-500" />
                </div>
                <h3 className="font-portal-display italic text-2xl text-white tracking-tighter uppercase font-black">System Matrix Clear</h3>
                <p className="text-gray-500 text-xs font-medium uppercase mt-2 tracking-widest">No protocol deviations detected in current buffer.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {filteredEvents.map((event, idx) => {
                  const meta = summarizeMetadata(event.metadata);
                  const config = severityConfig[event.severity];
                  
                  return (
                    <div 
                        key={event.id} 
                        className="group flex flex-col lg:flex-row lg:items-center justify-between p-8 hover:bg-white/[0.02] transition-all duration-500 relative overflow-hidden"
                    >
                        {/* Status Line */}
                        <div className={`absolute left-0 top-0 bottom-0 w-1 transition-all duration-500 ${config.bg} opacity-0 group-hover:opacity-100`} />
                        
                        <div className="flex items-start gap-6 flex-1">
                            {/* Visual Indicator */}
                            <div className={`mt-1 h-12 w-12 rounded-2xl ${config.bg} border ${config.border} flex items-center justify-center ${config.glow} transition-all duration-500 group-hover:scale-110`}>
                                <Activity className={`w-6 h-6 ${config.color}`} />
                            </div>
                            
                            {/* Main Info */}
                            <div className="flex-1">
                                <div className="flex flex-wrap items-center gap-3 mb-2">
                                    <h3 className="text-lg font-black text-white italic tracking-tighter uppercase group-hover:text-primary transition-colors">
                                        {eventLabels[event.event_type] || event.event_type}
                                    </h3>
                                    <span className={`px-2.5 py-0.5 rounded-full border text-[9px] font-black tracking-[0.1em] uppercase ${config.bg} ${config.color} ${config.border}`}>
                                        {event.severity}
                                    </span>
                                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-gray-700 uppercase tracking-widest">
                                        <Globe className="w-3 h-3" /> {event.ip_address || 'Internal Protocol'}
                                    </span>
                                </div>
                                
                                <div className="flex items-center gap-4 mb-3">
                                    <div className="flex items-center gap-2 text-[10px] font-mono text-gray-600 tracking-tighter">
                                        <Terminal className="w-3 h-3" /> EVENT_ID: {event.id.substring(0, 8)}...
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] font-bold text-gray-700 uppercase tracking-widest">
                                        <Clock className="w-3 h-3" /> {formatDate(event.created_at)}
                                    </div>
                                </div>

                                {/* Metadata Pods */}
                                {meta && (
                                    <div className="flex flex-wrap gap-2 mt-4">
                                        {meta.map((m, mIdx) => (
                                            <div key={mIdx} className="bg-white/[0.03] border border-white/5 px-2.5 py-1 rounded-lg flex items-center gap-2 group/meta hover:border-primary/30 transition-all">
                                                <span className="text-[9px] font-black text-gray-600 uppercase tracking-tighter group-hover/meta:text-primary transition-colors">{m.key}:</span>
                                                <code className="text-[10px] text-gray-400 font-mono group-hover/meta:text-white transition-colors">{m.value}</code>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Action Corner */}
                        <div className="mt-6 lg:mt-0 flex items-center gap-3 pl-14 lg:pl-0">
                            {event.user_id && (
                                <div className="flex items-center gap-3 bg-white/5 border border-white/5 rounded-xl px-4 py-2 group/user hover:border-primary/30 transition-all">
                                    <div className="w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center">
                                        <User className="w-3 h-3 text-primary" />
                                    </div>
                                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest group-hover/user:text-white transition-colors">
                                        System User
                                    </div>
                                </div>
                            )}
                            <button className="h-10 w-10 flex items-center justify-center bg-white/5 hover:bg-primary hover:text-white rounded-xl text-gray-500 transition-all">
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                  );
                })}
              </div>
            )}
        </Card>
        
        {/* Advanced Stats Overlay */}
        {!loading && !error && filteredEvents.length > 0 && (
            <div className="mt-8 flex justify-center">
                <div className="flex items-center gap-8 px-10 py-4 bg-[#0A0A15]/60 backdrop-blur-xl border border-white/5 rounded-full animate-in slide-in-from-bottom duration-1000">
                    <div className="flex items-center gap-3">
                        <Cpu className="w-4 h-4 text-gray-700" />
                        <span className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em]">Buffer Analysis: Ready</span>
                    </div>
                    <div className="w-px h-4 bg-white/5" />
                    <div className="flex items-center gap-3">
                        <Zap className="w-4 h-4 text-primary" />
                        <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Sync Status: Enforced</span>
                    </div>
                </div>
            </div>
        )}
      </div>
    </Layout>
  );
};
