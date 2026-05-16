import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Check } from 'lucide-react';
import { systemService } from '../../services/systemService';

const languages = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'pt', name: 'Português', flag: '🇧🇷' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
];

export const LanguageSelector: React.FC<{ variant?: 'sidebar' | 'header' | 'portal', sidebarOpen?: boolean }> = ({ variant = 'sidebar', sidebarOpen = true }) => {
  const [t, i18n] = useTranslation();
  const [isOpen, setIsOpen] = React.useState(false);

  const changeLanguage = async (lng: string) => {
    i18n.changeLanguage(lng);
    localStorage.setItem('i18nextLng', lng);
    // Persist to DB for instance-wide setting (global)
    await systemService.updateLocale(lng);
    setIsOpen(false);
  };

  const currentLanguage = languages.find(l => l.code === (i18n.language?.split('-')[0] || 'en')) || languages[0];

  if (variant === 'sidebar') {
    return (
      <div className="px-3 mb-2">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-xl transition-all group ${
            isOpen ? 'bg-primary/10 text-primary' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5'
          }`}
          title={!sidebarOpen ? currentLanguage.name : undefined}
        >
          <div className="flex items-center gap-3">
            <Globe className={`w-5 h-5 flex-shrink-0 ${isOpen ? 'text-primary' : 'text-gray-400 group-hover:text-gray-300'}`} />
            {sidebarOpen && (
                <span className="truncate flex items-center gap-2">
                    <span className="text-base leading-none">{currentLanguage.flag}</span>
                    <span>{currentLanguage.name}</span>
                </span>
            )}
          </div>
        </button>

        {isOpen && sidebarOpen && (
          <div className="mt-1 ml-4 space-y-1 animate-in fade-in slide-in-from-top-1 duration-200 bg-white/5 rounded-xl p-1 border border-white/5">
            {languages.map((lng) => (
              <button
                key={lng.code}
                onClick={() => changeLanguage(lng.code)}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                  i18n.language?.startsWith(lng.code)
                    ? 'text-primary bg-primary/10'
                    : 'text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                    <span className="text-sm leading-none">{lng.flag}</span>
                    <span>{lng.name}</span>
                </div>
                {i18n.language?.startsWith(lng.code) && <Check className="w-3 h-3" />}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (variant === 'portal') {
      return (
          <div className="relative">
              <button
                  onClick={() => setIsOpen(!isOpen)}
                  className={`flex items-center gap-3 px-4 py-2 rounded-2xl transition-all duration-300 group/lang ${
                      isOpen ? 'bg-primary/10 border-primary/20' : 'bg-white/5 border-white/5 hover:bg-white/10'
                  } border`}
              >
                  <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${isOpen ? 'bg-primary text-white' : 'bg-white/5 border border-white/5 text-gray-500 group-hover/lang:text-gray-300'}`}>
                          <Globe className="w-4 h-4" />
                      </div>
                      <div className="text-left">
                          <p className="text-[9px] uppercase font-black tracking-[0.2em] text-gray-500 leading-none mb-0.5">
                              {t('common.language', 'Idioma')}
                          </p>
                          <p className="text-xs font-bold text-white flex items-center gap-1.5 leading-none">
                              <span>{currentLanguage.flag}</span>
                              <span className="uppercase italic tracking-tighter">{currentLanguage.name}</span>
                          </p>
                      </div>
                  </div>
              </button>

              {isOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div className="absolute right-0 mt-3 w-48 space-y-1 animate-in fade-in slide-in-from-top-2 duration-300 p-2 bg-[#05050A]/90 rounded-3xl border border-white/10 backdrop-blur-2xl z-50 shadow-2xl">
                        {languages.map((lng) => (
                            <button
                                key={lng.code}
                                onClick={() => changeLanguage(lng.code)}
                                className={`w-full flex items-center justify-between px-4 py-3 text-[10px] font-black uppercase italic tracking-tighter rounded-xl transition-all duration-300 ${
                                    i18n.language?.startsWith(lng.code)
                                        ? 'text-white bg-primary shadow-lg shadow-primary/20'
                                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-base leading-none">{lng.flag}</span>
                                    <span>{lng.name}</span>
                                </div>
                                {i18n.language?.startsWith(lng.code) && <Check className="w-3 h-3" />}
                            </button>
                        ))}
                    </div>
                  </>
              )}
          </div>
      );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/5 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-all shadow-sm"
        title="Alterar Idioma"
      >
        <span className="text-lg">{currentLanguage.flag}</span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-[#0A0A0F] border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in zoom-in-95 duration-200 backdrop-blur-xl">
            {languages.map((lng) => (
              <button
                key={lng.code}
                onClick={() => changeLanguage(lng.code)}
                className={`w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition-all ${
                  i18n.language?.startsWith(lng.code)
                    ? 'text-primary bg-primary/5'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{lng.flag}</span>
                  <span>{lng.name}</span>
                </div>
                {i18n.language?.startsWith(lng.code) && <Check className="w-4 h-4" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
