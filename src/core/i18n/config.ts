import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '../utils/env';

// Import all language files directly to ensure instant loading
import commonEn from '../locales/en/common.json';
import authEn from '../locales/en/auth.json';
import portalEn from '../locales/en/portal.json';
import installerEn from '../locales/en/installer.json';
import adminEn from '../locales/en/admin.json';
import memberEn from '../locales/en/member.json';

import commonPt from '../locales/pt/common.json';
import authPt from '../locales/pt/auth.json';
import portalPt from '../locales/pt/portal.json';
import installerPt from '../locales/pt/installer.json';
import adminPt from '../locales/pt/admin.json';
import memberPt from '../locales/pt/member.json';

import commonEs from '../locales/es/common.json';
import authEs from '../locales/es/auth.json';
import portalEs from '../locales/es/portal.json';
import installerEs from '../locales/es/installer.json';
import adminEs from '../locales/es/admin.json';
import memberEs from '../locales/es/member.json';

// Initialize Supabase Client for the detector
const supabaseUrl = getEnv('VITE_SUPABASE_URL');
const supabaseKey = getEnv('VITE_SUPABASE_ANON_KEY');
const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    ns: ['common', 'auth', 'portal', 'installer', 'admin', 'member'],
    defaultNS: 'common',
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false, 
    },
    resources: {
      en: {
        common: commonEn,
        auth: authEn,
        portal: portalEn,
        installer: installerEn,
        admin: adminEn,
        member: memberEn,
      },
      pt: {
        common: commonPt,
        auth: authPt,
        portal: portalPt,
        installer: installerPt,
        admin: adminPt,
        member: memberPt,
      },
      es: {
        common: commonEs,
        auth: authEs,
        portal: portalEs,
        installer: installerEs,
        admin: adminEs,
        member: memberEs,
      },
    },
    detection: {
      // LocalStorage (Manual) > Browser > Fallback EN
      order: ['querystring', 'localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },
  });

// Fetch instance default from DB if no manual preference exists
if (supabase && typeof localStorage !== 'undefined' && !localStorage.getItem('i18nextLng')) {
  supabase.from('system_config')
    .select('default_locale')
    .single()
    .then(({ data }) => {
      if (data?.default_locale) {
        i18n.changeLanguage(data.default_locale);
      }
    });
}

export default i18n;
