import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Database } from 'lucide-react';
import { SCHEMA_VERSION } from '../../config/version';
import { SystemManager } from '../../services/systemManager';

export const MigrationRunner: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'idle' | 'pending'>('idle');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const required = await SystemManager.checkMigrationsRequired();
        setStatus(required ? 'pending' : 'idle');
      } catch (err) {
        console.error('[MigrationRunner] Check failed:', err);
        setStatus('idle');
      } finally {
        setReady(true);
      }
    };

    check();
  }, []);

  if (!ready || status === 'idle') return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] animate-in fade-in slide-in-from-bottom-5">
      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur-md bg-blue-500/10 border-blue-500/20 text-blue-300">
        <Database className="w-5 h-5" />

        <div className="flex flex-col">
          <span className="text-xs font-bold uppercase tracking-wider">
            Banco requer acao manual
          </span>
          <span className="text-[10px] opacity-70">Nada sera aplicado sem clicar em Atualizar Banco. Schema alvo v{SCHEMA_VERSION}.</span>
        </div>

        <button
          type="button"
          onClick={() => navigate('/admin/updates')}
          title="Abrir atualizacoes do banco"
          className="ml-2 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500 text-white transition-colors hover:bg-blue-400"
        >
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
