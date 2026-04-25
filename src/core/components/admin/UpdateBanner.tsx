import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, RefreshCw } from 'lucide-react';
import { SystemManager } from '../../services/systemManager';
import { APP_VERSION, SCHEMA_VERSION } from '../../config/version';
import { useTranslation } from 'react-i18next';

export const UpdateBanner: React.FC = () => {
  const { t } = useTranslation('admin');
  const navigate = useNavigate();
  const [updateRequired, setUpdateRequired] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const required = await SystemManager.checkMigrationsRequired();
        setUpdateRequired(required);
      } catch (err) {
        console.error('[UpdateBanner] Check failed:', err);
      } finally {
        setLoading(false);
      }
    };

    checkUpdate();
  }, []);

  if (loading || !updateRequired) return null;

  return (
    <div className="mb-8 relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-[1px] shadow-lg shadow-blue-500/20 group animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="relative bg-[#0A0A0F]/90 backdrop-blur-xl rounded-[23px] overflow-hidden p-5 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Background Effects */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-32 -mt-32 transition-transform duration-1000 group-hover:scale-110"></div>
        
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/20">
            <RefreshCw className="w-6 h-6 animate-spin-slow" />
          </div>
          <div>
            <h4 className="text-white font-bold text-base flex items-center gap-2">
              Nova Atualização Disponível
              <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] uppercase font-black tracking-widest border border-blue-500/20">
                v{SCHEMA_VERSION}
              </span>
            </h4>
            <p className="text-gray-400 text-xs mt-1">
              Melhorias de segurança e estabilidade prontas para serem aplicadas ao seu banco de dados.
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate('/admin/updates')}
          className="relative z-10 w-full md:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 group/btn active:scale-95"
        >
          Atualizar Agora
          <ArrowRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" />
        </button>
      </div>
    </div>
  );
};
