import React, { useEffect, useState } from 'react';
import { SystemManager } from '../../services/systemManager';
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';



import { SCHEMA_VERSION } from '../../config/version';

export const MigrationRunner: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'checking' | 'migrating' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      setStatus('checking');
      
      try {
        const required = await SystemManager.checkMigrationsRequired();
        
        if (required) {
          console.log(`[MigrationRunner] Database update required to v${SCHEMA_VERSION}. Starting...`);
          setStatus('migrating');

          const result = await SystemManager.runPendingMigrations();
          
          if (!result.success) {
            setError(result.error || 'Erro desconhecido na migração');
            setStatus('error');
            toast.error(`Falha ao atualizar banco de dados: ${result.error}`);
            return;
          }

          if (result.applied.length > 0) {
            setStatus('success');
            toast.success(`Sistema atualizado: ${result.applied.join(', ')}`);
            setTimeout(() => setStatus('idle'), 3000);
          } else {
            setStatus('idle');
          }
        } else {
          setStatus('idle');
        }
      } catch (err: any) {
        console.error('[MigrationRunner] Check failed:', err);
        setError(err.message);
        setStatus('error');
      }
    };

    run();
  }, []);

  if (status === 'idle') return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] animate-in fade-in slide-in-from-bottom-5">
      <div className={`
        flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur-md
        ${status === 'migrating' ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' : ''}
        ${status === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' : ''}
        ${status === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-500' : ''}
        ${status === 'checking' ? 'bg-white/5 border-white/10 text-gray-400' : ''}
      `}>
        {status === 'migrating' && <Loader2 className="w-5 h-5 animate-spin" />}
        {status === 'success' && <CheckCircle2 className="w-5 h-5" />}
        {status === 'error' && <AlertTriangle className="w-5 h-5" />}
        {status === 'checking' && <Loader2 className="w-4 h-4 animate-spin" />}

        <div className="flex flex-col">
          <span className="text-xs font-bold uppercase tracking-wider">
            {status === 'checking' && 'Verificando Sistema...'}
            {status === 'migrating' && 'Atualizando Banco...'}
            {status === 'success' && 'Sistema Atualizado'}
            {status === 'error' && 'Erro Crítico'}
          </span>
          {status === 'migrating' && <span className="text-[10px] opacity-70">Não feche esta aba</span>}
          {status === 'error' && <span className="text-[10px] opacity-70">{error}</span>}
          {status === 'success' && <span className="text-[10px] opacity-70">v{SCHEMA_VERSION}</span>}
        </div>
      </div>
    </div>
  );
};
